"use client";

import { createContext, useContext } from "react";
import type { MidiEvent } from "@/types/plugin";

export interface PluginActions {
  assignPlugin: (trackId: string, pluginId: string) => void;
  removeTrackPlugin: (trackId: string) => void;
  sendMidiToTrack: (trackId: string, event: MidiEvent) => void;
}

export const PluginActionsContext = createContext<PluginActions>({
  assignPlugin: () => {},
  removeTrackPlugin: () => {},
  sendMidiToTrack: () => {},
});

export function usePluginActions(): PluginActions {
  return useContext(PluginActionsContext);
}
