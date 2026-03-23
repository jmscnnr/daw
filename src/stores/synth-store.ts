import { create } from "zustand";
import type { OscConfig } from "@/audio/types";

export interface SynthState {
  // ADSR
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  // Filter
  filterMode: "off" | "lp" | "hp" | "bp";
  filterCutoff: number; // Hz
  filterQ: number;
  // Volume
  volume: number;
  // Oscillator configs
  oscConfigs: OscConfig[];
}

interface SynthActions {
  setEnvelope: (params: Partial<Pick<SynthState, "attack" | "decay" | "sustain" | "release">>) => void;
  setFilter: (params: Partial<Pick<SynthState, "filterMode" | "filterCutoff" | "filterQ">>) => void;
  setVolume: (volume: number) => void;
  setOscConfigs: (configs: OscConfig[]) => void;
  updateOscConfig: (index: number, config: Partial<OscConfig>) => void;
  addOsc: () => void;
  removeOsc: (index: number) => void;
}

export const useSynthStore = create<SynthState & SynthActions>()((set) => ({
  // Defaults matching Python app
  attack: 0.01,
  decay: 0.1,
  sustain: 0.7,
  release: 0.3,
  filterMode: "off",
  filterCutoff: 2000,
  filterQ: 0.71,
  volume: 0.3,
  oscConfigs: [{ shape: "saw", octave: 0, fine: 0, level: 1.0 }],

  setEnvelope: (params) => set((s) => ({ ...s, ...params })),
  setFilter: (params) => set((s) => ({ ...s, ...params })),
  setVolume: (volume) => set({ volume }),
  setOscConfigs: (configs) => set({ oscConfigs: configs }),

  updateOscConfig: (index, partial) =>
    set((s) => {
      const configs = [...s.oscConfigs];
      const existing = configs[index];
      if (existing) {
        configs[index] = { ...existing, ...partial };
      }
      return { oscConfigs: configs };
    }),

  addOsc: () =>
    set((s) => ({
      oscConfigs: [...s.oscConfigs, { shape: "saw", octave: 0, fine: 0, level: 1.0 }],
    })),

  removeOsc: (index) =>
    set((s) => {
      if (s.oscConfigs.length <= 1) return s;
      return { oscConfigs: s.oscConfigs.filter((_, i) => i !== index) };
    }),
}));
