import type {
  PluginDescriptor,
  PluginInstance,
  MidiEvent,
} from "@/types/plugin";
import type { OscConfig } from "@/audio/types";
import { SynthEngine } from "@/audio/engine";
import { useSynthStore } from "@/stores/synth-store";
import { registerPlugin } from "../plugin-registry";
import type { ComponentType } from "react";

// Lazy import to avoid circular dependency with React components
let SynthPluginUI: ComponentType<{ instance: PluginInstance }> | null = null;

export function setSynthPluginUI(
  component: ComponentType<{ instance: PluginInstance }>,
): void {
  SynthPluginUI = component;
}

class SynthPluginInstance implements PluginInstance {
  readonly descriptor: PluginDescriptor;
  private engine: SynthEngine;
  private _node: AudioNode | null = null;

  // Per-instance synth parameters
  params: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    filterMode: "off" | "lp" | "hp" | "bp";
    filterCutoff: number;
    filterQ: number;
    volume: number;
    oscConfigs: OscConfig[];
  } = {
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
  }

  get node(): AudioNode {
    if (!this._node) throw new Error("SynthPlugin not initialized");
    return this._node;
  }

  async initialize(): Promise<void> {
    const outputNode = this.engine.outputNode;
    if (!outputNode) throw new Error("SynthEngine worklet not ready");
    this._node = outputNode;

    // Apply per-instance params to the engine
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

  dispose(): void {
    this.engine.dispose();
    this._node = null;
  }

  /** Save current params from the global synth store into this instance */
  saveFromStore(): void {
    const s = useSynthStore.getState();
    this.params = {
      attack: s.attack,
      decay: s.decay,
      sustain: s.sustain,
      release: s.release,
      filterMode: s.filterMode,
      filterCutoff: s.filterCutoff,
      filterQ: s.filterQ,
      volume: s.volume,
      oscConfigs: s.oscConfigs,
    };
  }

  /** Load this instance's params into the global synth store */
  loadIntoStore(): void {
    const store = useSynthStore.getState();
    store.setEnvelope({
      attack: this.params.attack,
      decay: this.params.decay,
      sustain: this.params.sustain,
      release: this.params.release,
    });
    store.setFilter({
      filterMode: this.params.filterMode,
      filterCutoff: this.params.filterCutoff,
      filterQ: this.params.filterQ,
    });
    store.setVolume(this.params.volume);
    store.setOscConfigs(this.params.oscConfigs);
  }

  getState(): Record<string, unknown> {
    return { ...this.params };
  }

  setState(state: Record<string, unknown>): void {
    Object.assign(this.params, state);
  }

  onMidiEvent(event: MidiEvent): void {
    if (event.type === "noteOn") {
      this.engine.noteOn(event.note, event.velocity);
    } else if (event.type === "noteOff") {
      this.engine.noteOff(event.note);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getUIComponent(): ComponentType<any> | null {
    return SynthPluginUI;
  }

  /** Direct access to the engine for the synth UI hook. */
  getEngine(): SynthEngine {
    return this.engine;
  }
}

export const SYNTH_PLUGIN_ID = "builtin.synth";

const synthDescriptor: PluginDescriptor = {
  id: SYNTH_PLUGIN_ID,
  name: "Poly Synth",
  type: "instrument",

  async createInstance(ctx: AudioContext): Promise<PluginInstance> {
    const engine = new SynthEngine();
    await engine.init(ctx);
    const instance = new SynthPluginInstance(synthDescriptor, engine);
    return instance;
  },
};

// Self-register on import
registerPlugin(synthDescriptor);

export { SynthPluginInstance };
