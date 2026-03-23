/**
 * AudioGraph: Managed audio routing graph with bus/send support
 * and non-destructive plugin insertion.
 *
 * Signal flow per node: preInsert → [plugins...] → postInsert → gain → pan → meterNode → output
 *
 * Metering uses meter-processor worklet nodes that push peak dB to the main
 * thread, eliminating RAF polling.
 */
import type {
  IGainNode,
  IStereoPannerNode,
  IAudioNode,
  IAudioWorkletNode,
} from "standardized-audio-context";
import { AudioWorkletNode } from "standardized-audio-context";
import type { PluginInstance, PluginContext } from "@/types/plugin";
import type { MeterCollector } from "./meter-collector";

// --- Types ---

export type GraphNodeType = "track" | "bus" | "master" | "send";

export interface SendConnection {
  id: string;
  fromNodeId: string;
  toBusId: string;
  preFader: boolean;
  gainNode: IGainNode<PluginContext>;
}

export interface AudioGraphNode {
  id: string;
  type: GraphNodeType;
  plugins: PluginInstance[];

  // Audio nodes
  preInsertNode: IGainNode<PluginContext>;
  postInsertNode: IGainNode<PluginContext>;
  gainNode: IGainNode<PluginContext>;
  panNode: IStereoPannerNode<PluginContext>;
  /** Meter worklet node — inline pass-through that reports peak dB. */
  meterNode: IAudioWorkletNode<PluginContext>;

  // Routing
  outputId: string | null;
  sends: SendConnection[];

  // Mute state
  muted: boolean;
  preMuteVolume: number;
}

// --- Constants ---

const SMOOTH_TIME = 0.005;

// --- AudioGraph ---

export class AudioGraph {
  private ctx: PluginContext;
  private nodes = new Map<string, AudioGraphNode>();
  private masterNodeId = "__master__";
  private meterCollector: MeterCollector | null = null;

  constructor(ctx: PluginContext, meterCollector?: MeterCollector) {
    this.ctx = ctx;
    this.meterCollector = meterCollector ?? null;

    const master = this.createNode(this.masterNodeId, "master");
    master.meterNode.connect(ctx.destination);

    if (this.meterCollector) {
      this.meterCollector.setMasterNodeId(this.masterNodeId);
    }
  }

  // --- Node lifecycle ---

  addTrack(id: string): AudioGraphNode {
    const node = this.createNode(id, "track");
    this.routeToMaster(node);
    return node;
  }

  addBus(id: string): AudioGraphNode {
    const node = this.createNode(id, "bus");
    this.routeToMaster(node);
    return node;
  }

  removeNode(id: string): void {
    if (id === this.masterNodeId) return;

    const node = this.nodes.get(id);
    if (!node) return;

    for (const plugin of node.plugins) {
      plugin.dispose();
    }

    for (const send of node.sends) {
      send.gainNode.disconnect();
    }

    node.preInsertNode.disconnect();
    node.postInsertNode.disconnect();
    node.gainNode.disconnect();
    node.panNode.disconnect();
    node.meterNode.disconnect();

    this.meterCollector?.removeMeter(id);
    this.nodes.delete(id);
  }

  getNode(id: string): AudioGraphNode | undefined {
    return this.nodes.get(id);
  }

  getMasterNode(): AudioGraphNode {
    return this.nodes.get(this.masterNodeId)!;
  }

  // --- Routing ---

  setOutput(nodeId: string, targetId: string): void {
    const node = this.nodes.get(nodeId);
    const target = this.nodes.get(targetId);
    if (!node || !target) return;

    node.meterNode.disconnect();
    node.meterNode.connect(target.preInsertNode);
    node.outputId = targetId;
  }

  // --- Sends ---

  addSend(fromId: string, toBusId: string, preFader = false): string {
    const fromNode = this.nodes.get(fromId);
    const busNode = this.nodes.get(toBusId);
    if (!fromNode || !busNode) throw new Error("Node not found");

    const sendId = `send:${fromId}→${toBusId}:${Date.now()}`;
    const sendGain = this.ctx.createGain();
    sendGain.gain.value = 1.0;

    const tapPoint = preFader ? fromNode.postInsertNode : fromNode.gainNode;
    tapPoint.connect(sendGain);
    sendGain.connect(busNode.preInsertNode);

    const send: SendConnection = {
      id: sendId,
      fromNodeId: fromId,
      toBusId,
      preFader,
      gainNode: sendGain,
    };

    fromNode.sends.push(send);
    return sendId;
  }

  removeSend(sendId: string): void {
    for (const node of this.nodes.values()) {
      const idx = node.sends.findIndex((s) => s.id === sendId);
      if (idx >= 0) {
        node.sends[idx]!.gainNode.disconnect();
        node.sends.splice(idx, 1);
        return;
      }
    }
  }

  setSendLevel(sendId: string, value: number): void {
    for (const node of this.nodes.values()) {
      const send = node.sends.find((s) => s.id === sendId);
      if (send) {
        send.gainNode.gain.setTargetAtTime(value, this.ctx.currentTime, SMOOTH_TIME);
        return;
      }
    }
  }

  // --- Plugin management (non-destructive) ---

  insertPlugin(nodeId: string, plugin: PluginInstance, index: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    const plugins = node.plugins;
    const clampedIndex = Math.min(Math.max(0, index), plugins.length);

    const prevAudioNode = clampedIndex === 0
      ? node.preInsertNode
      : plugins[clampedIndex - 1]!.outputNode;
    const nextAudioNode = clampedIndex === plugins.length
      ? node.postInsertNode
      : plugins[clampedIndex]!.inputNode ?? plugins[clampedIndex]!.outputNode;

    prevAudioNode.disconnect(nextAudioNode);

    const pluginInput = plugin.inputNode ?? plugin.outputNode;
    prevAudioNode.connect(pluginInput);
    plugin.outputNode.connect(nextAudioNode);

    plugins.splice(clampedIndex, 0, plugin);
    plugin.activate();
  }

  removePlugin(nodeId: string, index: number): PluginInstance | undefined {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const plugins = node.plugins;
    const plugin = plugins[index];
    if (!plugin) return;

    const prevAudioNode = index === 0
      ? node.preInsertNode
      : plugins[index - 1]!.outputNode;
    const nextAudioNode = index === plugins.length - 1
      ? node.postInsertNode
      : plugins[index + 1]!.inputNode ?? plugins[index + 1]!.outputNode;

    const pluginInput = plugin.inputNode ?? plugin.outputNode;
    prevAudioNode.disconnect(pluginInput);
    plugin.outputNode.disconnect(nextAudioNode);

    prevAudioNode.connect(nextAudioNode);

    plugins.splice(index, 1);
    plugin.deactivate();

    return plugin;
  }

  getPlugins(nodeId: string): readonly PluginInstance[] {
    return this.nodes.get(nodeId)?.plugins ?? [];
  }

  // --- Mixer controls ---

  setVolume(nodeId: string, value: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.preMuteVolume = value;
    if (!node.muted) {
      node.gainNode.gain.setTargetAtTime(value, this.ctx.currentTime, SMOOTH_TIME);
    }
  }

  setPan(nodeId: string, value: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.panNode.pan.setTargetAtTime(value, this.ctx.currentTime, SMOOTH_TIME);
  }

  setMute(nodeId: string, muted: boolean): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.muted = muted;
    node.gainNode.gain.setTargetAtTime(
      muted ? 0 : node.preMuteVolume,
      this.ctx.currentTime,
      SMOOTH_TIME,
    );
  }

  // --- Dispose ---

  dispose(): void {
    for (const [id] of this.nodes) {
      if (id !== this.masterNodeId) {
        this.removeNode(id);
      }
    }
    const master = this.nodes.get(this.masterNodeId);
    if (master) {
      master.preInsertNode.disconnect();
      master.postInsertNode.disconnect();
      master.gainNode.disconnect();
      master.panNode.disconnect();
      master.meterNode.disconnect();
    }
    this.nodes.clear();
  }

  // --- Internal helpers ---

  private createNode(id: string, type: GraphNodeType): AudioGraphNode {
    const preInsert = this.ctx.createGain();
    preInsert.gain.value = 1.0;
    const postInsert = this.ctx.createGain();
    postInsert.gain.value = 1.0;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.8;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = 0;

    // Create meter worklet node
    if (!AudioWorkletNode) {
      throw new Error("AudioWorklet is not supported in this browser.");
    }
    const meter = new AudioWorkletNode(this.ctx, "meter-processor");

    // Chain: preInsert → postInsert → gain → pan → meter
    preInsert.connect(postInsert);
    postInsert.connect(gain);
    gain.connect(pan);
    pan.connect(meter);

    // Register with meter collector
    this.meterCollector?.addMeter(id, meter);

    const node: AudioGraphNode = {
      id,
      type,
      plugins: [],
      preInsertNode: preInsert,
      postInsertNode: postInsert,
      gainNode: gain,
      panNode: pan,
      meterNode: meter,
      outputId: null,
      sends: [],
      muted: false,
      preMuteVolume: 0.8,
    };

    this.nodes.set(id, node);
    return node;
  }

  private routeToMaster(node: AudioGraphNode): void {
    const master = this.nodes.get(this.masterNodeId);
    if (master) {
      node.meterNode.connect(master.preInsertNode);
      node.outputId = this.masterNodeId;
    }
  }
}
