"use client";

import { createContext, useContext } from "react";
import type { MidiEvent } from "@/types/plugin";

export interface PluginActions {
  assignPlugin: (trackId: string, pluginId: string) => void;
  removeTrackPlugin: (trackId: string) => void;
  sendMidiToTrack: (trackId: string, event: MidiEvent) => void;
  commitPluginState: (slotId: string, state: Record<string, unknown>) => void;
}

export const PluginActionsContext = createContext<PluginActions>({
  assignPlugin: () => {},
  removeTrackPlugin: () => {},
  sendMidiToTrack: () => {},
  commitPluginState: () => {},
});

export function usePluginActions(): PluginActions {
  return useContext(PluginActionsContext);
}
