import type {
  PluginDescriptor,
  PluginInstance,
  PluginUIDescriptor,
  PluginAudioDisplayState,
  PluginContext,
  ParameterDescriptor,
} from "@/types/plugin";
import { EMPTY_AUDIO_DISPLAY } from "@/types/plugin";
import type { TimedMidiMessage } from "@/audio/midi/types";
import type { OscConfig } from "@/audio/types";
import { SynthEngine } from "@/audio/engine";
import { registerPlugin } from "../plugin-registry";
import type { IAudioNode } from "standardized-audio-context";
import type { ComponentType } from "react";

// Lazy import to avoid circular dependency with React components
let _SynthPluginUI: ComponentType<{ instance: PluginInstance }> | null = null;

export function setSynthPluginUI(
  component: ComponentType<{ instance: PluginInstance }>,
): void {
  _SynthPluginUI = component;
}

export interface SynthPluginParams {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterMode: "off" | "lp" | "hp" | "bp";
  filterCutoff: number;
  filterQ: number;
  volume: number;
  oscConfigs: OscConfig[];
}

const PARAMETER_DESCRIPTORS: ParameterDescriptor[] = [
  { id: "attack", name: "Attack", min: 0.001, max: 5, defaultValue: 0.01, unit: "s" },
  { id: "decay", name: "Decay", min: 0.001, max: 5, defaultValue: 0.1, unit: "s" },
  { id: "sustain", name: "Sustain", min: 0, max: 1, defaultValue: 0.7 },
  { id: "release", name: "Release", min: 0.001, max: 10, defaultValue: 0.3, unit: "s" },
  { id: "filterCutoff", name: "Cutoff", min: 20, max: 20000, defaultValue: 2000, unit: "Hz", mapping: "logarithmic" },
  { id: "filterQ", name: "Q", min: 0.1, max: 20, defaultValue: 0.71, mapping: "logarithmic" },
  { id: "volume", name: "Volume", min: 0, max: 1, defaultValue: 0.3 },
];

class SynthPluginInstance implements PluginInstance {
  readonly descriptor: PluginDescriptor;
  private engine: SynthEngine;
  private _outputNode: IAudioNode<PluginContext> | null = null;
  private audioDisplay: PluginAudioDisplayState = EMPTY_AUDIO_DISPLAY;
  private audioDisplayListeners = new Set<() => void>();

  params: SynthPluginParams = {
    attack: 0.01,
    decay: 0.1,
    sustain: 0.7,
    release: 0.3,
    filterMode: "off",
    filterCutoff: 2000,
    filterQ: 0.71,
    volume: 0.3,
    oscConfigs: [{ shape: "saw", octave: 0, fine: 0, level: 1.0 }],
  };

  constructor(descriptor: PluginDescriptor, engine: SynthEngine) {
    this.descriptor = descriptor;
    this.engine = engine;
    this.engine.setDisplayUpdateHandler((state) => {
      this.audioDisplay = state;
      for (const listener of this.audioDisplayListeners) {
        listener();
      }
    });
  }

  get inputNode(): null {
    return null; // Instrument — no audio input
  }

  get outputNode(): IAudioNode<PluginContext> {
    if (!this._outputNode) throw new Error("SynthPlugin not initialized");
    return this._outputNode;
  }

  activate(): void {
    const node = this.engine.outputNode;
    if (!node) throw new Error("SynthEngine worklet not ready");
    this._outputNode = node;
    this.syncEngineParams();
  }

  deactivate(): void {}

  reset(): void {
    this.params = {
      attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3,
      filterMode: "off", filterCutoff: 2000, filterQ: 0.71,
      volume: 0.3,
      oscConfigs: [{ shape: "saw", octave: 0, fine: 0, level: 1.0 }],
    };
    this.syncEngineParams();
  }

  dispose(): void {
    this.engine.setDisplayUpdateHandler(null);
    this.engine.dispose();
    this._outputNode = null;
  }

  getParameterValue(id: string): number {
    return (this.params as unknown as Record<string, number>)[id] ?? 0;
  }

  setParameterValue(id: string, value: number): void {
    (this.params as unknown as Record<string, number>)[id] = value;
    this.syncEngineParams();
  }

  getState(): Record<string, unknown> {
    return { ...this.params };
  }

  setState(state: Record<string, unknown>): void {
    Object.assign(this.params, state);
    this.syncEngineParams();
  }

  updateParams(params: Partial<SynthPluginParams>): void {
    Object.assign(this.params, params);
    this.syncEngineParams();
  }

  processMidi(messages: TimedMidiMessage[]): void {
    for (const timed of messages) {
      const msg = timed.message;
      if (msg.type === "noteOn") {
        this.engine.noteOn(msg.note, msg.velocity);
      } else if (msg.type === "noteOff") {
        this.engine.noteOff(msg.note);
      }
    }
  }

  getUIDescriptor(): PluginUIDescriptor {
    return { type: "custom", componentId: SYNTH_PLUGIN_ID };
  }

  getAudioDisplayState(): PluginAudioDisplayState {
    return this.audioDisplay;
  }

  subscribeToAudioDisplay(listener: () => void): () => void {
    this.audioDisplayListeners.add(listener);
    return () => {
      this.audioDisplayListeners.delete(listener);
    };
  }

  /** Direct access to the engine for the synth UI. */
  getEngine(): SynthEngine {
    return this.engine;
  }

  private syncEngineParams(): void {
    this.engine.setEnvelope(
      this.params.attack,
      this.params.decay,
      this.params.sustain,
      this.params.release,
    );
    this.engine.setFilter(this.params.filterMode, this.params.filterCutoff, this.params.filterQ);
    this.engine.setVolume(this.params.volume);
    this.engine.setOscConfigs(this.params.oscConfigs);
  }
}

export const SYNTH_PLUGIN_ID = "builtin.synth";

const synthDescriptor: PluginDescriptor = {
  id: SYNTH_PLUGIN_ID,
  name: "Poly Synth",
  type: "instrument",
  parameterDescriptors: PARAMETER_DESCRIPTORS,

  async createInstance(ctx: PluginContext): Promise<PluginInstance> {
    const engine = new SynthEngine();
    await engine.init(ctx);
    const instance = new SynthPluginInstance(synthDescriptor, engine);
    return instance;
  },
};

registerPlugin(synthDescriptor);

export { SynthPluginInstance };
