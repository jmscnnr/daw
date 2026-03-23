import type { ComponentType } from "react";
import type { IAudioContext, IAudioNode, IOfflineAudioContext } from "standardized-audio-context";
import type { TimedMidiMessage } from "@/audio/midi/types";

// --- Plugin context (supports both realtime and offline rendering) ---

export type PluginContext = IAudioContext | IOfflineAudioContext;

// --- Parameter descriptors ---

export type ParameterMapping = "linear" | "logarithmic" | "discrete";

export interface ParameterDescriptor {
  id: string;
  name: string;
  min: number;
  max: number;
  defaultValue: number;
  unit?: string;
  mapping?: ParameterMapping;
  automatable?: boolean;
}

// --- Plugin types ---

export type PluginType = "instrument" | "effect";

export type PluginUIDescriptor =
  | { type: "generic" }
  | { type: "custom"; componentId: string };

export interface PluginAudioDisplayState {
  waveformData: Float32Array;
  activeNotes: number[];
  levelDb: number;
}

export const EMPTY_AUDIO_DISPLAY: PluginAudioDisplayState = {
  waveformData: new Float32Array(0),
  activeNotes: [],
  levelDb: -Infinity,
};

// --- MIDI event (used by transport, recording, keyboard) ---

export interface MidiEvent {
  type: "noteOn" | "noteOff";
  note: number;
  velocity: number;
  time: number;
}

// --- Plugin descriptor ---

export interface PluginDescriptor {
  id: string;
  name: string;
  type: PluginType;
  parameterDescriptors: ParameterDescriptor[];
  createInstance(ctx: PluginContext): Promise<PluginInstance>;
}

// --- Plugin instance ---

export interface PluginInstance {
  readonly descriptor: PluginDescriptor;

  /** Input audio node (null for instruments that generate audio). */
  readonly inputNode: IAudioNode<PluginContext> | null;
  /** Output audio node — always present. */
  readonly outputNode: IAudioNode<PluginContext>;

  // Lifecycle
  activate(): void;
  deactivate(): void;
  reset(): void;
  dispose(): void;

  // Parameters
  getParameterValue(id: string): number;
  setParameterValue(id: string, value: number): void;

  // State (serializable)
  getState(): Record<string, unknown>;
  setState(state: Record<string, unknown>): void;

  // MIDI
  processMidi?(messages: TimedMidiMessage[]): void;

  // UI
  getUIDescriptor(): PluginUIDescriptor;

  // Audio display (optional — for waveform/meter visualization)
  getAudioDisplayState?(): PluginAudioDisplayState;
  subscribeToAudioDisplay?(listener: () => void): () => void;
}
