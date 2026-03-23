/**
 * Lookahead transport scheduler.
 * Uses setInterval + AudioContext.currentTime for sample-accurate event scheduling.
 */
import type { AudioEngine } from "./audio-engine";
import type { MidiEvent } from "@/types/plugin";
import type { Clip, MidiNote } from "@/types/project";
import type { TrackChain } from "./track-chain";
import { PPQ } from "@/lib/constants";

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SECONDS = 0.1;

export interface SchedulerTrackInfo {
  trackId: string;
  clips: Clip[];
  chain: TrackChain;
  muted: boolean;
}

export class TransportScheduler {
  private audioEngine: AudioEngine;
  private bpm = 120;
  private timerHandle: ReturnType<typeof setInterval> | null = null;

  // Playback state
  private playing = false;
  private startContextTime = 0; // AudioContext time when play was started
  private startTick = 0; // Tick position when play was started
  private currentTick = 0;

  // Track info supplier — set by the DAW engine hook
  private getTrackInfos: () => SchedulerTrackInfo[] = () => [];

  // Position callback for UI
  private onPositionUpdate: ((ticks: number) => void) | null = null;

  // Loop
  private loopEnabled = false;
  private loopStartTick = 0;
  private loopEndTick = 0;

  // Tracking which notes have been scheduled
  private scheduledNoteKeys = new Set<string>();
  private lastTick = 0; // For detecting loop wraps

  constructor(audioEngine: AudioEngine) {
    this.audioEngine = audioEngine;
  }

  setTrackInfoSupplier(fn: () => SchedulerTrackInfo[]): void {
    this.getTrackInfos = fn;
  }

  setPositionCallback(fn: (ticks: number) => void): void {
    this.onPositionUpdate = fn;
  }

  setBPM(bpm: number): void {
    if (this.playing) {
      // Recalculate start references so position stays continuous
      const now = this.audioEngine.currentTime;
      this.currentTick = this.getCurrentTick();
      this.startContextTime = now;
      this.startTick = this.currentTick;
    }
    this.bpm = bpm;
  }

  setLoop(enabled: boolean, startTick?: number, endTick?: number): void {
    // When disabling loop during playback, rebase to current wrapped position
    // so the playhead doesn't jump to the raw elapsed tick
    if (this.playing && this.loopEnabled && !enabled) {
      const currentTick = this.getCurrentTick();
      this.startContextTime = this.audioEngine.currentTime;
      this.startTick = currentTick;
      this.scheduledNoteKeys.clear();
      this.lastTick = currentTick;
    }
    this.loopEnabled = enabled;
    if (startTick !== undefined) this.loopStartTick = startTick;
    if (endTick !== undefined) this.loopEndTick = endTick;
  }

  start(fromTick?: number): void {
    if (this.playing) return;

    this.playing = true;
    this.startContextTime = this.audioEngine.currentTime;
    this.startTick = fromTick ?? this.currentTick;
    this.scheduledNoteKeys.clear();
    this.lastTick = this.startTick;

    this.timerHandle = setInterval(() => this.schedule(), LOOKAHEAD_MS);
  }

  stop(): void {
    this.playing = false;
    this.currentTick = 0;

    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }

    this.scheduledNoteKeys.clear();
    this.lastTick = 0;
    this.onPositionUpdate?.(0);
  }

  pause(): void {
    this.playing = false;
    this.currentTick = this.getCurrentTick();

    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  setPosition(tick: number): void {
    this.currentTick = tick;
    if (this.playing) {
      this.startContextTime = this.audioEngine.currentTime;
      this.startTick = tick;
      this.scheduledNoteKeys.clear();
      this.lastTick = tick;
    }
    this.onPositionUpdate?.(tick);
  }

  getCurrentTick(): number {
    if (!this.playing) return this.currentTick;

    const elapsed = this.audioEngine.currentTime - this.startContextTime;
    const elapsedTicks = this.secondsToTicks(elapsed);
    let tick = this.startTick + elapsedTicks;

    if (this.loopEnabled && this.loopEndTick > this.loopStartTick) {
      const loopLen = this.loopEndTick - this.loopStartTick;
      if (tick >= this.loopEndTick) {
        tick = this.loopStartTick + ((tick - this.loopStartTick) % loopLen);
      }
    }

    return tick;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  private schedule(): void {
    if (!this.playing) return;

    const now = this.audioEngine.currentTime;
    const scheduleEnd = now + SCHEDULE_AHEAD_SECONDS;
    const currentTick = this.getCurrentTick();

    // Detect loop wrap: tick jumped backwards → reset scheduling state
    if (currentTick < this.lastTick && this.loopEnabled) {
      this.scheduledNoteKeys.clear();
      this.startContextTime = now;
      this.startTick = currentTick;
    }
    this.lastTick = currentTick;

    // Update UI position
    this.onPositionUpdate?.(currentTick);

    // Schedule MIDI events from clips
    const trackInfos = this.getTrackInfos();
    for (const info of trackInfos) {
      if (info.muted) continue;

      for (const clip of info.clips) {
        if (clip.content.type !== "midi") continue;

        for (const note of clip.content.notes) {
          this.scheduleNote(
            info.chain,
            clip,
            note,
            scheduleEnd,
          );
        }
      }
    }
  }

  private scheduleNote(
    chain: TrackChain,
    clip: Clip,
    note: MidiNote,
    scheduleEndTime: number,
  ): void {
    const absoluteStartTick = clip.startTick + note.startTick;
    const absoluteEndTick = absoluteStartTick + note.durationTicks;

    const noteOnTime = this.tickToContextTime(absoluteStartTick);
    const noteOffTime = this.tickToContextTime(absoluteEndTick);

    const noteKey = `${clip.id}:${note.note}:${absoluteStartTick}`;

    if (this.scheduledNoteKeys.has(noteKey)) return;
    if (noteOnTime > scheduleEndTime) return;
    if (noteOffTime < this.audioEngine.currentTime) return;

    this.scheduledNoteKeys.add(noteKey);

    const noteOnEvent: MidiEvent = {
      type: "noteOn",
      note: note.note,
      velocity: note.velocity,
      time: Math.max(noteOnTime, this.audioEngine.currentTime),
    };

    const noteOffEvent: MidiEvent = {
      type: "noteOff",
      note: note.note,
      velocity: 0,
      time: noteOffTime,
    };

    chain.sendMidiEvent(noteOnEvent);

    // Schedule noteOff
    const delay = (noteOffTime - this.audioEngine.currentTime) * 1000;
    if (delay > 0) {
      setTimeout(() => chain.sendMidiEvent(noteOffEvent), delay);
    } else {
      chain.sendMidiEvent(noteOffEvent);
    }
  }

  private tickToContextTime(tick: number): number {
    const ticksFromStart = tick - this.startTick;
    const secondsFromStart = this.ticksToSeconds(ticksFromStart);
    return this.startContextTime + secondsFromStart;
  }

  private ticksToSeconds(ticks: number): number {
    return (ticks / PPQ) * (60 / this.bpm);
  }

  private secondsToTicks(seconds: number): number {
    return (seconds * this.bpm * PPQ) / 60;
  }

  dispose(): void {
    this.stop();
    this.onPositionUpdate = null;
    this.getTrackInfos = () => [];
  }
}
