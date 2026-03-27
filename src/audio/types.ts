import type { Shape } from "@/lib/constants";

export interface OscConfig {
  shape: Shape;
  octave: number; // -2 .. +2
  fine: number; // -100 .. +100 cents
  level: number; // 0 .. 1
}

// Main thread → Worklet
export type WorkletMessage =
  | { type: "noteOn"; midi: number; velocity: number; time?: number }
  | { type: "noteOff"; midi: number; time?: number }
  | { type: "allNotesOff" }
  | {
      type: "setEnvelope";
      attack: number;
      decay: number;
      sustain: number;
      release: number;
    }
  | { type: "setFilter"; mode: "off" | "lp" | "hp" | "bp"; cutoff: number; q: number }
  | { type: "setOscConfigs"; configs: OscConfig[] }
  | { type: "setVolume"; value: number };

// Worklet → Main thread
export type WorkletResponse =
  | { type: "waveform"; data: Float32Array }
  | { type: "activeNotes"; notes: number[] }
  | { type: "level"; db: number }
  | { type: "update"; waveform: Float32Array; notes: number[]; db: number };
