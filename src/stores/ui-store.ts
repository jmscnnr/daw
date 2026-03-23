import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export type BottomPanelMode = "mixer" | "plugin" | "editor" | "none";

interface UIState {
  // Panel layout
  arrangementHeightPercent: number;
  bottomPanelMode: BottomPanelMode;

  // Selection
  selectedTrackId: string | null;
  selectedClipIds: string[];
  editingClipId: string | null; // clip open in piano roll

  // View
  horizontalZoom: number; // pixels per beat
  scrollX: number; // horizontal scroll in ticks
  scrollY: number; // vertical scroll in pixels

  // Snap
  snapEnabled: boolean;

  // Actions
  setArrangementHeight(percent: number): void;
  setBottomPanelMode(mode: BottomPanelMode): void;
  setSelectedTrack(trackId: string | null): void;
  setSelectedClips(clipIds: string[]): void;
  setEditingClip(clipId: string | null): void;
  setHorizontalZoom(zoom: number): void;
  setScrollX(ticks: number): void;
  setScrollY(pixels: number): void;
  toggleSnap(): void;
}

export const useUIStore = create<UIState>()(subscribeWithSelector((set) => ({
  arrangementHeightPercent: 60,
  bottomPanelMode: "plugin",

  selectedTrackId: null,
  selectedClipIds: [],
  editingClipId: null,

  horizontalZoom: 40,
  scrollX: 0,
  scrollY: 0,

  snapEnabled: true,

  setArrangementHeight(percent) {
    set({ arrangementHeightPercent: Math.max(20, Math.min(80, percent)) });
  },

  setBottomPanelMode(mode) {
    set({ bottomPanelMode: mode });
  },

  setSelectedTrack(trackId) {
    set({ selectedTrackId: trackId });
  },

  setSelectedClips(clipIds) {
    set({
      selectedClipIds: clipIds,
      editingClipId: clipIds.length === 1 ? clipIds[0]! : null,
    });
  },

  setEditingClip(clipId) {
    set({ editingClipId: clipId });
    if (clipId) {
      set({ bottomPanelMode: "editor" });
    }
  },

  setHorizontalZoom(zoom) {
    set({ horizontalZoom: Math.max(10, Math.min(200, zoom)) });
  },

  setScrollX(ticks) {
    set({ scrollX: Math.max(0, ticks) });
  },

  setScrollY(pixels) {
    set({ scrollY: Math.max(0, pixels) });
  },

  toggleSnap() {
    set((s) => ({ snapEnabled: !s.snapEnabled }));
  },
})));
