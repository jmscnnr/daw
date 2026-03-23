import { create } from "zustand";

interface AudioDisplayState {
  waveformData: Float32Array;
  activeNotes: number[];
  levelDb: number;
  setWaveform: (data: Float32Array) => void;
  setActiveNotes: (notes: number[]) => void;
  setLevelDb: (db: number) => void;
}

export const useAudioDisplayStore = create<AudioDisplayState>()((set) => ({
  waveformData: new Float32Array(0),
  activeNotes: [],
  levelDb: -Infinity,
  setWaveform: (data) => set({ waveformData: data }),
  setActiveNotes: (notes) => set({ activeNotes: notes }),
  setLevelDb: (db) => set({ levelDb: db }),
}));
