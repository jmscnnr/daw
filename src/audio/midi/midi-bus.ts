import type { TimedMidiMessage } from "./types";

export type MidiTargetHandler = (msg: TimedMidiMessage) => void;

/**
 * Centralized MIDI routing bus.
 * Sources publish messages, targets receive them.
 * Supports explicit routing and auto-routing to focused/armed tracks.
 */
export class MIDIBus {
  /** Explicit routes: sourceId → set of targetIds */
  private routes = new Map<string, Set<string>>();
  /** Registered targets: targetId → handler */
  private targets = new Map<string, MidiTargetHandler>();
  /** Registered source IDs */
  private sources = new Set<string>();

  private focusedTrackId: string | null = null;
  private armedTrackIds = new Set<string>();

  // --- Source registration ---

  registerSource(id: string): void {
    this.sources.add(id);
    if (!this.routes.has(id)) {
      this.routes.set(id, new Set());
    }
  }

  unregisterSource(id: string): void {
    this.sources.delete(id);
    this.routes.delete(id);
  }

  // --- Target registration ---

  registerTarget(id: string, handler: MidiTargetHandler): void {
    this.targets.set(id, handler);
  }

  unregisterTarget(id: string): void {
    this.targets.delete(id);
    // Remove from all routes
    for (const targetSet of this.routes.values()) {
      targetSet.delete(id);
    }
  }

  // --- Routing ---

  connect(sourceId: string, targetId: string): void {
    let targetSet = this.routes.get(sourceId);
    if (!targetSet) {
      targetSet = new Set();
      this.routes.set(sourceId, targetSet);
    }
    targetSet.add(targetId);
  }

  disconnect(sourceId: string, targetId: string): void {
    this.routes.get(sourceId)?.delete(targetId);
  }

  // --- Focus & arm ---

  setFocusedTrack(trackId: string | null): void {
    this.focusedTrackId = trackId;
  }

  setArmedTracks(trackIds: Set<string>): void {
    this.armedTrackIds = new Set(trackIds);
  }

  // --- Send ---

  /**
   * Send a MIDI message from a source.
   * Routes to explicitly connected targets first.
   * Falls back to armed tracks, then focused track.
   */
  send(sourceId: string, msg: TimedMidiMessage): void {
    const explicitTargets = this.routes.get(sourceId);

    if (explicitTargets && explicitTargets.size > 0) {
      for (const targetId of explicitTargets) {
        this.targets.get(targetId)?.(msg);
      }
      return;
    }

    // Auto-route: armed tracks first, then focused track
    if (this.armedTrackIds.size > 0) {
      for (const trackId of this.armedTrackIds) {
        this.targets.get(trackId)?.(msg);
      }
      return;
    }

    if (this.focusedTrackId) {
      this.targets.get(this.focusedTrackId)?.(msg);
    }
  }

  /**
   * Send directly to a specific target, bypassing routing.
   */
  sendToTarget(targetId: string, msg: TimedMidiMessage): void {
    this.targets.get(targetId)?.(msg);
  }

  dispose(): void {
    this.routes.clear();
    this.targets.clear();
    this.sources.clear();
    this.focusedTrackId = null;
    this.armedTrackIds.clear();
  }
}
