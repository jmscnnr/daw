import { create } from "zustand";
import { PPQ } from "@/lib/constants";

interface ActiveRecordNote {
  note: number;
  velocity: number;
  startTick: number; // absolute tick
}

interface RecordingState {
  /** Track being recorded onto */
  recordTrackId: string | null;
  /** Clip being recorded into (may be existing or newly created) */
  recordClipId: string | null;
  /** Absolute tick when recording started */
  recordStartTick: number;
  /** Wall-clock time (performance.now) when recording started */
  recordStartTimeMs: number;
  /** BPM at time of recording start */
  recordBpm: number;
  /** Notes currently held down (keyed by MIDI note number) */
  activeNotes: Map<number, ActiveRecordNote>;

  startRecording(trackId: string, clipId: string, startTick: number, bpm: number): void;
  /** Get current absolute tick based on wall-clock elapsed time */
  getCurrentTick(): number;
  noteOn(note: number, velocity: number, absoluteTick: number): void;
  /** Returns the completed note info so caller can add it to the clip */
  noteOff(note: number): ActiveRecordNote | null;
  /** Close all held notes, returns them */
  finalizeHeld(): ActiveRecordNote[];
  reset(): void;
}

export const useRecordingStore = create<RecordingState>()((set, get) => ({
  recordTrackId: null,
  recordClipId: null,
  recordStartTick: 0,
  recordStartTimeMs: 0,
  recordBpm: 120,
  activeNotes: new Map(),

  startRecording(trackId, clipId, startTick, bpm) {
    set({
      recordTrackId: trackId,
      recordClipId: clipId,
      recordStartTick: startTick,
      recordStartTimeMs: performance.now(),
      recordBpm: bpm,
      activeNotes: new Map(),
    });
  },

  getCurrentTick() {
    const { recordStartTick, recordStartTimeMs, recordBpm } = get();
    if (recordStartTimeMs === 0) return 0;
    const elapsedMs = performance.now() - recordStartTimeMs;
    const elapsedBeats = (elapsedMs / 1000) * (recordBpm / 60);
    return recordStartTick + Math.round(elapsedBeats * PPQ);
  },

  noteOn(note, velocity, absoluteTick) {
    const newActive = new Map(get().activeNotes);
    newActive.set(note, { note, velocity, startTick: absoluteTick });
    set({ activeNotes: newActive });
  },

  noteOff(note) {
    const { activeNotes } = get();
    const active = activeNotes.get(note);
    if (!active) return null;
    const newActive = new Map(activeNotes);
    newActive.delete(note);
    set({ activeNotes: newActive });
    return active;
  },

  finalizeHeld() {
    const { activeNotes } = get();
    const held = Array.from(activeNotes.values());
    set({ activeNotes: new Map() });
    return held;
  },

  reset() {
    set({
      recordTrackId: null,
      recordClipId: null,
      recordStartTick: 0,
      recordStartTimeMs: 0,
      recordBpm: 120,
      activeNotes: new Map(),
    });
  },
}));
