import { create } from "zustand";
import type { TransportState, LoopRegion } from "@/types/transport";

interface TransportStoreState {
  state: TransportState;
  positionTicks: number;
  recording: boolean;
  loopEnabled: boolean;
  loopRegion: LoopRegion | null;

  play(): void;
  stop(): void;
  pause(): void;
  setPosition(ticks: number): void;
  toggleLoop(): void;
  setLoopRegion(start: number, end: number): void;
  toggleRecording(): void;

  /** Called by the scheduler at display rate to update the playhead position. */
  updatePosition(ticks: number): void;
}

export const useTransportStore = create<TransportStoreState>()((set) => ({
  state: "stopped",
  positionTicks: 0,
  recording: false,
  loopEnabled: false,
  loopRegion: null,

  play() {
    set({ state: "playing" });
  },

  stop() {
    set({ state: "stopped", positionTicks: 0, recording: false });
  },

  pause() {
    set((s) => (s.state === "playing" ? { state: "paused" } : s));
  },

  setPosition(ticks) {
    set({ positionTicks: ticks });
  },

  toggleLoop() {
    set((s) => ({ loopEnabled: !s.loopEnabled }));
  },

  toggleRecording() {
    set((s) => {
      const newRecording = !s.recording;
      // If arming record while stopped, also start playback
      if (newRecording && s.state !== "playing") {
        return { recording: true, state: "playing" };
      }
      return { recording: newRecording };
    });
  },

  setLoopRegion(start, end) {
    set({ loopRegion: { startTick: start, endTick: end } });
  },

  updatePosition(ticks) {
    set({ positionTicks: ticks });
  },
}));
