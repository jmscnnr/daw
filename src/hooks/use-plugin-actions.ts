"use client";

import { createContext, useContext } from "react";
import type { MidiEvent } from "@/types/plugin";

export interface PluginActions {
  assignPlugin: (trackId: string, pluginId: string) => void;
  removeTrackPlugin: (trackId: string) => void;
  sendMidiToTrack: (trackId: string, event: MidiEvent) => void;
  commitPluginState: (slotId: string, state: Record<string, unknown>) => void;
  /** Recording-aware note on — records into the active clip and plays sound */
  noteOn: (midi: number) => void;
  /** Recording-aware note off — commits the recorded note and stops sound */
  noteOff: (midi: number) => void;
}

export const PluginActionsContext = createContext<PluginActions>({
  assignPlugin: () => {},
  removeTrackPlugin: () => {},
  sendMidiToTrack: () => {},
  commitPluginState: () => {},
  noteOn: () => {},
  noteOff: () => {},
});

export function usePluginActions(): PluginActions {
  return useContext(PluginActionsContext);
}
