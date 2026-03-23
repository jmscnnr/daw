export const SAMPLE_RATE = 44100;
export const BLOCK_SIZE = 128;
export const MAX_VOICES = 12;
export const RING_SIZE = 4096;
export const SHAPES = ["sine", "saw", "square", "triangle"] as const;
export type Shape = (typeof SHAPES)[number];

// DAW constants
export const PPQ = 960; // pulses per quarter note
export const DEFAULT_BPM = 120;
export const DEFAULT_TIME_SIGNATURE = { numerator: 4, denominator: 4 } as const;

export const TRACK_COLORS = [
  "#5cabff", // blue
  "#ff6b6b", // red
  "#51cf66", // green
  "#fcc419", // yellow
  "#cc5de8", // purple
  "#ff922b", // orange
  "#20c997", // teal
  "#f06595", // pink
] as const;
