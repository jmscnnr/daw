import { PPQ } from "./constants";

/** Convert ticks to seconds at a given BPM. */
export function ticksToSeconds(ticks: number, bpm: number): number {
  return (ticks / PPQ) * (60 / bpm);
}

/** Convert seconds to ticks at a given BPM. */
export function secondsToTicks(seconds: number, bpm: number): number {
  return (seconds * bpm * PPQ) / 60;
}

/** Convert ticks to bar:beat position (1-indexed). */
export function ticksToBarBeat(
  ticks: number,
  beatsPerBar: number,
): { bar: number; beat: number } {
  const totalBeats = ticks / PPQ;
  const bar = Math.floor(totalBeats / beatsPerBar) + 1;
  const beat = Math.floor(totalBeats % beatsPerBar) + 1;
  return { bar, beat };
}

/** Convert bar:beat (1-indexed) to ticks. */
export function barBeatToTicks(
  bar: number,
  beat: number,
  beatsPerBar: number,
): number {
  return ((bar - 1) * beatsPerBar + (beat - 1)) * PPQ;
}
