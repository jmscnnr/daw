import type { ComponentType } from "react";

export type PluginType = "instrument" | "effect";

export interface MidiEvent {
  type: "noteOn" | "noteOff";
  note: number;
  velocity: number;
  time: number;
}

export interface PluginDescriptor {
  id: string;
  name: string;
  type: PluginType;
  createInstance(ctx: AudioContext): Promise<PluginInstance>;
}

export interface PluginInstance {
  readonly descriptor: PluginDescriptor;
  readonly node: AudioNode;

  initialize(): Promise<void>;
  dispose(): void;

  getState(): Record<string, unknown>;
  setState(state: Record<string, unknown>): void;

  onMidiEvent?(event: MidiEvent): void;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getUIComponent(): ComponentType<any> | null;
}
