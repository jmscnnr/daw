/**
 * WAM (Web Audio Modules) adapter: Wraps a WAM plugin in the PluginInstance interface.
 */
import type {
  PluginDescriptor,
  PluginInstance,
  PluginUIDescriptor,
  PluginContext,
} from "@/types/plugin";
import type { TimedMidiMessage } from "@/audio/midi/types";
import type { IAudioNode } from "standardized-audio-context";
import type { WebAudioModule } from "@webaudiomodules/api";
import { registerPlugin } from "./plugin-registry";

class WAMPluginInstance implements PluginInstance {
  readonly descriptor: PluginDescriptor;
  private wam: WebAudioModule;

  constructor(descriptor: PluginDescriptor, wam: WebAudioModule) {
    this.descriptor = descriptor;
    this.wam = wam;
  }

  get inputNode(): IAudioNode<PluginContext> {
    return this.wam.audioNode as unknown as IAudioNode<PluginContext>;
  }

  get outputNode(): IAudioNode<PluginContext> {
    return this.wam.audioNode as unknown as IAudioNode<PluginContext>;
  }

  activate(): void {}
  deactivate(): void {}
  reset(): void {}

  dispose(): void {
    this.wam.audioNode?.disconnect();
    if ("destroy" in this.wam && typeof this.wam.destroy === "function") {
      (this.wam as unknown as { destroy(): void }).destroy();
    }
  }

  getParameterValue(_id: string): number {
    return 0;
  }

  setParameterValue(_id: string, _value: number): void {}

  getState(): Record<string, unknown> {
    return {};
  }

  setState(_state: Record<string, unknown>): void {}

  processMidi(messages: TimedMidiMessage[]): void {
    const audioNode = this.wam.audioNode;
    if (!audioNode || !("port" in audioNode)) return;

    const port = (audioNode as unknown as { port: MessagePort }).port;
    for (const timed of messages) {
      const msg = timed.message;
      if (msg.type === "noteOn" || msg.type === "noteOff") {
        port.postMessage({
          type: msg.type,
          note: msg.note,
          velocity: msg.velocity,
        });
      }
    }
  }

  getUIDescriptor(): PluginUIDescriptor {
    return { type: "custom", componentId: `wam:${this.descriptor.id}` };
  }
}

/**
 * Register a WAM plugin from a URL.
 * The URL should point to a WAM module that exports a default WebAudioModule class.
 */
export async function registerWAMPlugin(
  wamUrl: string,
  ctx: PluginContext,
): Promise<PluginDescriptor> {
  const module = await import(/* webpackIgnore: true */ wamUrl);
  const WAMClass = module.default;

  const tempInstance: WebAudioModule = await WAMClass.createInstance(
    ctx as unknown as BaseAudioContext,
  );
  const wamDescriptor = tempInstance.descriptor;

  const pluginDescriptor: PluginDescriptor = {
    id: `wam:${wamDescriptor?.identifier ?? wamUrl}`,
    name: wamDescriptor?.name ?? "WAM Plugin",
    type: "effect",
    parameterDescriptors: [],

    async createInstance(instanceCtx: PluginContext): Promise<PluginInstance> {
      const wam: WebAudioModule = await WAMClass.createInstance(
        instanceCtx as unknown as BaseAudioContext,
      );
      return new WAMPluginInstance(pluginDescriptor, wam);
    },
  };

  tempInstance.audioNode?.disconnect();

  registerPlugin(pluginDescriptor);
  return pluginDescriptor;
}
