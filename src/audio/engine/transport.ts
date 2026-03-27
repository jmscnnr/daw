/**
 * Transport: Main-thread controller wrapping the transport-clock worklet.
 * Replaces TransportScheduler for sample-accurate playback.
 */
import type { IAudioContext, IAudioWorkletNode } from "standardized-audio-context";
import { AudioWorkletNode } from "standardized-audio-context";
import type { MidiEvent } from "@/types/plugin";
import type { Clip, MidiNote } from "@/types/project";
import { PPQ } from "@/lib/constants";

export interface TransportTrackInfo {
  trackId: string;
  clips: Clip[];
  muted: boolean;
}

export type TransportMidiDispatchFn = (
  trackId: string,
  event: MidiEvent,
  sampleOffset: number,
) => void;

type ClockResponse =
  | { type: "position"; tick: number }
  | { type: "event"; trackId: string; noteOn: boolean; note: number; velocity: number; sampleOffset: number }
  | { type: "loopReset"; tick: number };

export class Transport {
  private ctx: IAudioContext;
  private clockNode: IAudioWorkletNode<IAudioContext> | null = null;

  private playing = false;
  private currentTick = 0;
  private bpm = 120;

  private loopEnabled = false;
  private loopStartTick = 0;
  private loopEndTick = 0;

  private getTrackInfos: () => TransportTrackInfo[] = () => [];
  private dispatchMidi: TransportMidiDispatchFn = () => {};
  private onPositionUpdate: ((tick: number) => void) | null = null;
  private onStop: (() => void) | null = null;

  constructor(ctx: IAudioContext) {
    this.ctx = ctx;
  }

  async init(): Promise<void> {
    if (!AudioWorkletNode) {
      throw new Error("AudioWorklet is not supported in this browser.");
    }
    this.clockNode = new AudioWorkletNode(this.ctx, "transport-clock");

    // Connect to destination so the worklet keeps running
    // (it produces silence but needs to be in the graph)
    this.clockNode.connect(this.ctx.destination);

    this.clockNode.port.onmessage = (e: MessageEvent<ClockResponse>) => {
      this.handleClockMessage(e.data);
    };
  }

  private handleClockMessage(msg: ClockResponse): void {
    switch (msg.type) {
      case "position":
        this.currentTick = msg.tick;
        this.onPositionUpdate?.(msg.tick);
        break;

      case "event": {
        const event: MidiEvent = {
          type: msg.noteOn ? "noteOn" : "noteOff",
          note: msg.note,
          velocity: msg.velocity,
          time: this.ctx.currentTime, // Already at the right time since worklet dispatched it
        };
        this.dispatchMidi(msg.trackId, event, msg.sampleOffset);
        break;
      }

      case "loopReset":
        this.currentTick = msg.tick;
        // Re-schedule events for the new loop iteration
        this.sendEventsToWorklet();
        break;
    }
  }

  // --- Control ---

  play(fromTick?: number): void {
    if (this.playing) return;
    this.playing = true;

    const tick = fromTick ?? this.currentTick;
    this.currentTick = tick;

    this.sendEventsToWorklet();

    this.clockNode?.port.postMessage({
      type: "play",
      tick,
      bpm: this.bpm,
      ppq: PPQ,
    });
  }

  stop(): void {
    this.playing = false;
    this.currentTick = 0;
    this.clockNode?.port.postMessage({ type: "stop" });
    this.onStop?.();
    this.onPositionUpdate?.(0);
  }

  pause(): void {
    this.playing = false;
    this.clockNode?.port.postMessage({ type: "pause" });
    this.onStop?.();
  }

  seek(tick: number): void {
    this.currentTick = tick;
    // Release hanging notes when seeking during playback
    if (this.playing) {
      this.onStop?.();
      this.sendEventsToWorklet();
    }
    this.clockNode?.port.postMessage({ type: "seek", tick });
    this.onPositionUpdate?.(tick);
  }

  setBPM(bpm: number): void {
    this.bpm = bpm;
    this.clockNode?.port.postMessage({ type: "setBPM", bpm });
  }

  setLoop(enabled: boolean, startTick?: number, endTick?: number): void {
    this.loopEnabled = enabled;
    if (startTick !== undefined) this.loopStartTick = startTick;
    if (endTick !== undefined) this.loopEndTick = endTick;

    this.clockNode?.port.postMessage({
      type: "setLoop",
      enabled,
      startTick: this.loopStartTick,
      endTick: this.loopEndTick,
    });
  }

  getCurrentTick(): number {
    return this.currentTick;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  // --- Configuration ---

  setTrackInfoSupplier(fn: () => TransportTrackInfo[]): void {
    this.getTrackInfos = fn;
  }

  setMidiDispatch(fn: TransportMidiDispatchFn): void {
    this.dispatchMidi = fn;
  }

  setPositionCallback(fn: (tick: number) => void): void {
    this.onPositionUpdate = fn;
  }

  setStopCallback(fn: () => void): void {
    this.onStop = fn;
  }

  // --- Internal ---

  /**
   * Gather all MIDI events from clips and send to the worklet for scheduling.
   */
  private sendEventsToWorklet(): void {
    const trackInfos = this.getTrackInfos();
    const events: {
      tick: number;
      trackId: string;
      noteOn: boolean;
      note: number;
      velocity: number;
    }[] = [];

    for (const info of trackInfos) {
      if (info.muted) continue;

      for (const clip of info.clips) {
        if (clip.content.type !== "midi") continue;

        for (const note of clip.content.notes) {
          const absoluteStart = clip.startTick + note.startTick;
          const absoluteEnd = absoluteStart + note.durationTicks;

          events.push({
            tick: absoluteStart,
            trackId: info.trackId,
            noteOn: true,
            note: note.note,
            velocity: note.velocity,
          });

          events.push({
            tick: absoluteEnd,
            trackId: info.trackId,
            noteOn: false,
            note: note.note,
            velocity: 0,
          });
        }
      }
    }

    this.clockNode?.port.postMessage({
      type: "scheduleEvents",
      events,
    });
  }

  dispose(): void {
    this.playing = false;
    this.clockNode?.port.postMessage({ type: "stop" });
    this.clockNode?.disconnect();
    this.clockNode = null;
    this.onPositionUpdate = null;
    this.getTrackInfos = () => [];
    this.dispatchMidi = () => {};
  }
}
