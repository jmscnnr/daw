/**
 * FaustPluginFactory: Compiles Faust DSP code into AudioWorklet-based plugins at runtime.
 *
 * Uses the @grame/faustwasm API:
 *   1. instantiateFaustModuleFromFile → FaustModule
 *   2. new LibFaust(module) → ILibFaust
 *   3. new FaustCompiler(libFaust) → IFaustCompiler
 *   4. new FaustMonoDspGenerator() → generator
 *   5. generator.compile(compiler, name, code, args) → compiled generator
 *   6. generator.createNode(audioContext) → FaustMonoAudioWorkletNode
 */
import {
  instantiateFaustModuleFromFile,
  LibFaust,
  FaustCompiler,
  FaustMonoDspGenerator,
  type IFaustCompiler,
  type FaustMonoAudioWorkletNode,
  type FaustUIInputItem,
  type FaustUIItem,
  type FaustUIGroup,
} from "@grame/faustwasm";
import type {
  PluginDescriptor,
  PluginInstance,
  PluginUIDescriptor,
  PluginContext,
  ParameterDescriptor,
} from "@/types/plugin";
import type { IAudioNode } from "standardized-audio-context";
import { registerPlugin } from "@/audio/plugins/plugin-registry";

function isFaustUIGroup(item: FaustUIItem): item is FaustUIGroup {
  return "items" in item;
}

function isFaustUIInputItem(item: FaustUIItem): item is FaustUIInputItem {
  return "address" in item && !isFaustUIGroup(item) && (
    item.type === "hslider" || item.type === "vslider" ||
    item.type === "nentry" || item.type === "button" || item.type === "checkbox"
  );
}

/** Recursively extract input items from the Faust UI descriptor tree. */
function flattenUIInputItems(items: FaustUIItem[]): FaustUIInputItem[] {
  const result: FaustUIInputItem[] = [];
  for (const item of items) {
    if (isFaustUIGroup(item)) {
      result.push(...flattenUIInputItems(item.items));
    } else if (isFaustUIInputItem(item)) {
      result.push(item);
    }
  }
  return result;
}

/** Convert Faust UI items to PluginInstance ParameterDescriptors. */
function faustItemsToParamDescriptors(items: FaustUIInputItem[]): ParameterDescriptor[] {
  return items.map((item) => {
    const unitMeta = item.meta?.find((m) => m.unit);
    const scaleMeta = item.meta?.find((m) => m.scale);
    return {
      id: item.address,
      name: item.label,
      min: item.min ?? 0,
      max: item.max ?? 1,
      defaultValue: item.init ?? 0,
      unit: unitMeta?.unit,
      mapping: scaleMeta?.scale === "log" ? "logarithmic" as const : "linear" as const,
      automatable: item.type !== "button" && item.type !== "checkbox",
    };
  });
}

class FaustPluginInstance implements PluginInstance {
  readonly descriptor: PluginDescriptor;
  private faustNode: FaustMonoAudioWorkletNode;

  constructor(descriptor: PluginDescriptor, faustNode: FaustMonoAudioWorkletNode) {
    this.descriptor = descriptor;
    this.faustNode = faustNode;
  }

  get inputNode(): IAudioNode<PluginContext> {
    return this.faustNode as unknown as IAudioNode<PluginContext>;
  }

  get outputNode(): IAudioNode<PluginContext> {
    return this.faustNode as unknown as IAudioNode<PluginContext>;
  }

  activate(): void {
    this.faustNode.start();
  }

  deactivate(): void {
    this.faustNode.stop();
  }

  reset(): void {
    // Reset all parameters to defaults
    for (const param of this.descriptor.parameterDescriptors) {
      this.faustNode.setParamValue(param.id, param.defaultValue);
    }
  }

  dispose(): void {
    this.faustNode.stop();
    this.faustNode.destroy();
    this.faustNode.disconnect();
  }

  getParameterValue(id: string): number {
    return this.faustNode.getParamValue(id);
  }

  setParameterValue(id: string, value: number): void {
    this.faustNode.setParamValue(id, value);
  }

  getState(): Record<string, unknown> {
    const state: Record<string, unknown> = {};
    for (const path of this.faustNode.getParams()) {
      state[path] = this.faustNode.getParamValue(path);
    }
    return state;
  }

  setState(state: Record<string, unknown>): void {
    for (const [path, value] of Object.entries(state)) {
      if (typeof value === "number") {
        this.faustNode.setParamValue(path, value);
      }
    }
  }

  processMidi(messages: import("@/audio/midi/types").TimedMidiMessage[]): void {
    for (const timed of messages) {
      const msg = timed.message;
      if (msg.type === "noteOn") {
        this.faustNode.keyOn(msg.channel, msg.note, Math.round(msg.velocity * 127));
      } else if (msg.type === "noteOff") {
        this.faustNode.keyOff(msg.channel, msg.note, Math.round(msg.velocity * 127));
      } else if (msg.type === "cc") {
        this.faustNode.ctrlChange(msg.channel, msg.controller, msg.value);
      } else if (msg.type === "pitchBend") {
        this.faustNode.pitchWheel(msg.channel, msg.value);
      }
    }
  }

  getUIDescriptor(): PluginUIDescriptor {
    return { type: "generic" };
  }
}

/**
 * Factory for creating Faust-based effect plugins.
 */
export class FaustPluginFactory {
  private compiler: IFaustCompiler | null = null;

  /**
   * Initialize the Faust compiler. Must be called before createPlugin().
   * @param faustModuleJsPath - Path to libfaust-wasm.js (e.g. "/faust/libfaust-wasm.js")
   */
  async init(faustModuleJsPath: string): Promise<void> {
    const faustModule = await instantiateFaustModuleFromFile(faustModuleJsPath);
    const libFaust = new LibFaust(faustModule);
    this.compiler = new FaustCompiler(libFaust);
  }

  /**
   * Compile Faust DSP code and register it as a plugin.
   * @param dspCode - Faust source code
   * @param id - Unique plugin ID (will be prefixed with "faust:")
   * @param name - Human-readable plugin name
   * @param compilerArgs - Faust compiler arguments (default: "-I libraries/")
   */
  async createPlugin(
    dspCode: string,
    id: string,
    name: string,
    compilerArgs = "-I libraries/",
  ): Promise<PluginDescriptor> {
    if (!this.compiler) {
      throw new Error("FaustPluginFactory not initialized — call init() first");
    }

    // Compile the DSP code into a factory
    const generator = new FaustMonoDspGenerator();
    const compiled = await generator.compile(this.compiler, id, dspCode, compilerArgs);
    if (!compiled) {
      throw new Error(
        `Faust compilation failed: ${this.compiler.getErrorMessage()}`,
      );
    }

    // Extract parameter descriptors from the compiled UI metadata
    const ui = generator.getUI();
    const inputItems = flattenUIInputItems(ui);
    const paramDescriptors = faustItemsToParamDescriptors(inputItems);

    const descriptor: PluginDescriptor = {
      id: `faust:${id}`,
      name,
      type: "effect",
      parameterDescriptors: paramDescriptors,

      async createInstance(ctx: PluginContext): Promise<PluginInstance> {
        const node = await generator.createNode(
          ctx as unknown as BaseAudioContext,
          id,
        );
        if (!node) {
          throw new Error(`Failed to create Faust node for "${name}"`);
        }
        return new FaustPluginInstance(descriptor, node);
      },
    };

    registerPlugin(descriptor);
    return descriptor;
  }

  /**
   * Get the compiler version string.
   */
  version(): string {
    return this.compiler?.version() ?? "not initialized";
  }
}
