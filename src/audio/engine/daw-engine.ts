/**
 * DAWEngine: Top-level orchestrator owning AudioGraph, MIDIBus,
 * Transport, and MeterCollector. Plain class — no React dependency.
 */
import { AudioContext, type IAudioContext } from "standardized-audio-context";
import { AudioGraph } from "./audio-graph";
import { MIDIBus } from "@/audio/midi/midi-bus";
import { Transport } from "./transport";
import { MeterCollector } from "./meter-collector";
import { SAMPLE_RATE } from "@/lib/constants";
import { legacyToMidi } from "@/audio/midi/types";
import type { TimedMidiMessage } from "@/audio/midi/types";
import type { PluginInstance, MidiEvent } from "@/types/plugin";
import { createPluginInstance } from "@/audio/plugins/plugin-host";

export class DAWEngine {
  readonly graph: AudioGraph;
  readonly midiBus: MIDIBus;
  readonly transport: Transport;
  readonly meterCollector: MeterCollector;
  readonly ctx: IAudioContext;

  /** Plugin instances by slot ID */
  private plugins = new Map<string, PluginInstance>();

  /** Optional callback for live MIDI input (used for recording hardware MIDI) */
  private midiInputCallback: ((trackId: string, msg: TimedMidiMessage) => void) | null = null;

  private constructor(
    ctx: IAudioContext,
    graph: AudioGraph,
    meterCollector: MeterCollector,
    transport: Transport,
  ) {
    this.ctx = ctx;
    this.meterCollector = meterCollector;
    this.graph = graph;
    this.midiBus = new MIDIBus();
    this.transport = transport;

    // Wire transport MIDI dispatch through the graph
    this.transport.setMidiDispatch((trackId, event, _sampleOffset) => {
      this.sendMidiToTrack(trackId, event);
    });

    // Release all hanging notes when transport stops/pauses
    this.transport.setStopCallback(() => {
      this.allNotesOff();
    });
  }

  static async create(): Promise<DAWEngine> {
    if (!window.isSecureContext) {
      throw new Error(
        "AudioWorklet requires a secure context (HTTPS or localhost).",
      );
    }

    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // Load ALL worklet modules BEFORE creating any worklet nodes
    if (!ctx.audioWorklet) {
      throw new Error("AudioWorklet is not supported in this browser.");
    }
    await Promise.all([
      ctx.audioWorklet.addModule("/worklets/synth-processor.js"),
      ctx.audioWorklet.addModule("/worklets/meter-processor.js"),
      ctx.audioWorklet.addModule("/worklets/transport-clock.js"),
    ]);

    // Now safe to create AudioGraph (which creates meter worklet nodes)
    const meterCollector = new MeterCollector();
    const graph = new AudioGraph(ctx, meterCollector);
    const transport = new Transport(ctx);
    await transport.init();

    return new DAWEngine(ctx, graph, meterCollector, transport);
  }

  // --- Track lifecycle ---

  addTrack(id: string): void {
    this.graph.addTrack(id);

    this.midiBus.registerTarget(id, (msg: TimedMidiMessage) => {
      this.routeMidiToTrack(id, msg);
    });
  }

  removeTrack(id: string): void {
    const node = this.graph.getNode(id);
    if (node) {
      for (const plugin of node.plugins) {
        for (const [slotId, p] of this.plugins) {
          if (p === plugin) {
            this.plugins.delete(slotId);
            break;
          }
        }
      }
    }

    this.midiBus.unregisterTarget(id);
    this.graph.removeNode(id);
  }

  // --- Plugin lifecycle ---

  async loadPlugin(
    nodeId: string,
    pluginId: string,
    slotId: string,
    index: number,
  ): Promise<PluginInstance> {
    const instance = await createPluginInstance(pluginId, this.ctx);
    this.graph.insertPlugin(nodeId, instance, index);
    this.plugins.set(slotId, instance);
    return instance;
  }

  removePluginBySlot(nodeId: string, slotId: string): void {
    const node = this.graph.getNode(nodeId);
    const plugin = this.plugins.get(slotId);
    if (!node || !plugin) return;

    const index = node.plugins.indexOf(plugin);
    if (index >= 0) {
      this.graph.removePlugin(nodeId, index);
    }
    plugin.dispose();
    this.plugins.delete(slotId);
  }

  getPlugin(slotId: string): PluginInstance | undefined {
    return this.plugins.get(slotId);
  }

  // --- MIDI ---

  sendMidiToTrack(trackId: string, event: MidiEvent): void {
    const node = this.graph.getNode(trackId);
    if (!node) return;

    const msg = legacyToMidi(event);
    for (const plugin of node.plugins) {
      if (plugin.descriptor.type === "instrument" && plugin.processMidi) {
        plugin.processMidi([{ message: msg, tick: 0 }]);
        return;
      }
    }
  }

  /**
   * Send allNotesOff to all instrument plugins across all tracks.
   * Called on transport stop/pause/seek to prevent hanging notes.
   */
  allNotesOff(): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.descriptor.type === "instrument") {
        // Use the SynthEngine's allNotesOff if available
        const instance = plugin as { getEngine?: () => { allNotesOff(): void } };
        if (typeof instance.getEngine === "function") {
          instance.getEngine().allNotesOff();
        }
      }
    }
  }

  private routeMidiToTrack(trackId: string, msg: TimedMidiMessage): void {
    const node = this.graph.getNode(trackId);
    if (!node) return;

    // Notify recording callback (for hardware MIDI recording)
    this.midiInputCallback?.(trackId, msg);

    for (const plugin of node.plugins) {
      if (plugin.descriptor.type === "instrument" && plugin.processMidi) {
        plugin.processMidi([msg]);
        return;
      }
    }
  }

  /** Set a callback that fires whenever live MIDI input arrives on a track via the MIDIBus */
  setMidiInputCallback(cb: ((trackId: string, msg: TimedMidiMessage) => void) | null): void {
    this.midiInputCallback = cb;
  }

  // --- Dispose ---

  dispose(): void {
    this.transport.dispose();
    this.midiBus.dispose();
    this.meterCollector.dispose();

    for (const plugin of this.plugins.values()) {
      plugin.dispose();
    }
    this.plugins.clear();

    this.graph.dispose();
    void this.ctx.close();
  }
}
