/**
 * Per-track audio signal chain.
 * Manages plugin nodes, volume, pan, and metering for a single track.
 *
 * Signal flow: [plugins...] → gainNode → panNode → analyserNode → masterOutput
 */
import type { PluginInstance, MidiEvent } from "@/types/plugin";

export class TrackChain {
  private plugins: PluginInstance[] = [];
  private gainNode: GainNode;
  private panNode: StereoPannerNode;
  private analyserNode: AnalyserNode;
  private masterOutput: GainNode;
  private ctx: AudioContext;
  private muted = false;
  private preMuteVolume = 0.8;

  constructor(ctx: AudioContext, masterOutput: GainNode) {
    this.ctx = ctx;
    this.masterOutput = masterOutput;

    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0.8;

    this.panNode = ctx.createStereoPanner();
    this.panNode.pan.value = 0;

    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 256;

    // Connect the strip: gain → pan → analyser → master
    this.gainNode.connect(this.panNode);
    this.panNode.connect(this.analyserNode);
    this.analyserNode.connect(this.masterOutput);
  }

  /** Add a plugin to the chain. Rebuilds audio connections. */
  addPlugin(plugin: PluginInstance, index?: number): void {
    if (index !== undefined) {
      this.plugins.splice(index, 0, plugin);
    } else {
      this.plugins.push(plugin);
    }
    this.rebuildChain();
  }

  /** Remove a plugin by index. Rebuilds audio connections. */
  removePlugin(index: number): void {
    const plugin = this.plugins[index];
    if (plugin) {
      try { plugin.node.disconnect(); } catch { /* plugin may not be initialized */ }
      plugin.dispose();
      this.plugins.splice(index, 1);
      this.rebuildChain();
    }
  }

  /** Disconnect all plugin nodes and reconnect in order. */
  private rebuildChain(): void {
    // Disconnect everything from plugins
    for (const plugin of this.plugins) {
      plugin.node.disconnect();
    }

    if (this.plugins.length === 0) {
      // No plugins — nothing feeds the gain node
      return;
    }

    // Chain plugins together: plugin[0] → plugin[1] → ... → gainNode
    for (let i = 0; i < this.plugins.length; i++) {
      const plugin = this.plugins[i]!;
      const next = this.plugins[i + 1];
      if (next) {
        plugin.node.connect(next.node);
      } else {
        plugin.node.connect(this.gainNode);
      }
    }
  }

  /** Set track volume (0..1). */
  setVolume(value: number): void {
    this.preMuteVolume = value;
    if (!this.muted) {
      this.gainNode.gain.value = value;
    }
  }

  /** Set track pan (-1..1). */
  setPan(value: number): void {
    this.panNode.pan.value = value;
  }

  /** Mute/unmute the track. */
  setMute(muted: boolean): void {
    this.muted = muted;
    this.gainNode.gain.value = muted ? 0 : this.preMuteVolume;
  }

  /** Read the current peak level in dB from the analyser. */
  getPeakDb(): number {
    const data = new Float32Array(this.analyserNode.fftSize);
    this.analyserNode.getFloatTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]!);
      if (abs > peak) peak = abs;
    }
    return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  }

  /** Forward a MIDI event to the first instrument plugin. */
  sendMidiEvent(event: MidiEvent): void {
    for (const plugin of this.plugins) {
      if (plugin.descriptor.type === "instrument" && plugin.onMidiEvent) {
        plugin.onMidiEvent(event);
        return;
      }
    }
  }

  /** Get the list of plugin instances. */
  getPlugins(): readonly PluginInstance[] {
    return this.plugins;
  }

  dispose(): void {
    for (const plugin of this.plugins) {
      try { plugin.node.disconnect(); } catch { /* plugin may not be initialized */ }
      plugin.dispose();
    }
    this.plugins = [];

    this.gainNode.disconnect();
    this.panNode.disconnect();
    this.analyserNode.disconnect();
  }
}
