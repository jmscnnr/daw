import { create } from "zustand";

interface MeterState {
  /** trackId → peakDb */
  levels: Record<string, number>;
  masterLevel: number;
  setLevel(trackId: string, peakDb: number): void;
  setMasterLevel(peakDb: number): void;
}

export const useMeterStore = create<MeterState>()((set) => ({
  levels: {},
  masterLevel: -Infinity,

  setLevel(trackId, peakDb) {
    set((s) => {
      // Skip update if value hasn't meaningfully changed (avoid re-renders)
      const prev = s.levels[trackId];
      if (prev !== undefined && Math.abs(prev - peakDb) < 0.5) return s;
      return { levels: { ...s.levels, [trackId]: peakDb } };
    });
  },

  setMasterLevel(peakDb) {
    set((s) => {
      if (Math.abs(s.masterLevel - peakDb) < 0.5) return s;
      return { masterLevel: peakDb };
    });
  },
}));
