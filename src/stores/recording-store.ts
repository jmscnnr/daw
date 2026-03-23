import { create } from "zustand";

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
  /** Notes currently held down (keyed by MIDI note number) */
  activeNotes: Map<number, ActiveRecordNote>;

  startRecording(trackId: string, clipId: string, startTick: number): void;
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
  activeNotes: new Map(),

  startRecording(trackId, clipId, startTick) {
    set({
      recordTrackId: trackId,
      recordClipId: clipId,
      recordStartTick: startTick,
      activeNotes: new Map(),
    });
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
      activeNotes: new Map(),
    });
  },
}));
