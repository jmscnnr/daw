/**
 * Utility gain plugin — a minimal effect that validates the effect path
 * through AudioGraph.
 */
import type {
  PluginDescriptor,
  PluginInstance,
  PluginUIDescriptor,
  PluginContext,
  ParameterDescriptor,
} from "@/types/plugin";
import type { IGainNode, IAudioNode } from "standardized-audio-context";
import { registerPlugin } from "@/audio/plugins/plugin-registry";

export const GAIN_PLUGIN_ID = "builtin.gain";

const parameterDescriptors: ParameterDescriptor[] = [
  {
    id: "gain",
    name: "Gain",
    min: -60,
    max: 12,
    defaultValue: 0,
    unit: "dB",
    mapping: "linear",
    automatable: true,
  },
  {
    id: "mute",
    name: "Mute",
    min: 0,
    max: 1,
    defaultValue: 0,
    mapping: "discrete",
    automatable: false,
  },
];

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

class GainPluginInstance implements PluginInstance {
  readonly descriptor: PluginDescriptor;
  private gainNode: IGainNode<PluginContext>;
  private gainDb = 0;
  private muted = false;
  private ctx: PluginContext;

  constructor(descriptor: PluginDescriptor, ctx: PluginContext) {
    this.descriptor = descriptor;
    this.ctx = ctx;
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 1.0; // 0 dB
  }

  get inputNode(): IAudioNode<PluginContext> {
    return this.gainNode;
  }

  get outputNode(): IAudioNode<PluginContext> {
    return this.gainNode;
  }

  activate(): void {}
  deactivate(): void {}
  reset(): void {
    this.gainDb = 0;
    this.muted = false;
    this.gainNode.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.005);
  }

  dispose(): void {
    this.gainNode.disconnect();
  }

  getParameterValue(id: string): number {
    switch (id) {
      case "gain": return this.gainDb;
      case "mute": return this.muted ? 1 : 0;
      default: return 0;
    }
  }

  setParameterValue(id: string, value: number): void {
    switch (id) {
      case "gain":
        this.gainDb = value;
        if (!this.muted) {
          this.gainNode.gain.setTargetAtTime(
            dbToLinear(value),
            this.ctx.currentTime,
            0.005,
          );
        }
        break;
      case "mute":
        this.muted = value >= 0.5;
        this.gainNode.gain.setTargetAtTime(
          this.muted ? 0 : dbToLinear(this.gainDb),
          this.ctx.currentTime,
          0.005,
        );
        break;
    }
  }

  getState(): Record<string, unknown> {
    return { gain: this.gainDb, mute: this.muted ? 1 : 0 };
  }

  setState(state: Record<string, unknown>): void {
    if (typeof state.gain === "number") this.setParameterValue("gain", state.gain);
    if (typeof state.mute === "number") this.setParameterValue("mute", state.mute);
  }

  getUIDescriptor(): PluginUIDescriptor {
    return { type: "generic" };
  }
}

const gainDescriptor: PluginDescriptor = {
  id: GAIN_PLUGIN_ID,
  name: "Gain",
  type: "effect",
  parameterDescriptors,

  async createInstance(ctx: PluginContext): Promise<PluginInstance> {
    return new GainPluginInstance(gainDescriptor, ctx);
  },
};

registerPlugin(gainDescriptor);

export { GainPluginInstance };
