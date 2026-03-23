// Piano-style key layout:
//  upper row: q 2 w 3 e r 5 t 6 y 7 u  (C5..B5)
//  lower row: z s x d c v g b h n j m  (C4..B4)
export const KEY_TO_MIDI: Record<string, number> = {
  z: 60, s: 61, x: 62, d: 63, c: 64, v: 65,
  g: 66, b: 67, h: 68, n: 69, j: 70, m: 71,
  q: 72, "2": 73, w: 74, "3": 75, e: 76, r: 77,
  "5": 78, t: 79, "6": 80, y: 81, "7": 82, u: 83,
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export function midiToFreq(midi: number): number {
  return 440.0 * 2.0 ** ((midi - 69) / 12.0);
}

export function midiToName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

// Reverse map: midi → key label
export const MIDI_TO_KEY_LABEL: Record<number, string> = Object.fromEntries(
  Object.entries(KEY_TO_MIDI).map(([k, v]) => [v, k]),
);
