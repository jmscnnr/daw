export type TransportState = "stopped" | "playing" | "paused";

export interface TransportPosition {
  ticks: number;
  seconds: number;
  bar: number;
  beat: number;
}

export interface LoopRegion {
  startTick: number;
  endTick: number;
}
