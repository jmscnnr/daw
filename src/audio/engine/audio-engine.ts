/**
 * Central DAW audio engine.
 * Owns the AudioContext, master bus, and all track chains.
 */
import { TrackChain } from "./track-chain";
import { SAMPLE_RATE } from "@/lib/constants";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterPanner: StereoPannerNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private trackChains = new Map<string, TrackChain>();
  private workletModulesLoaded = false;

  async init(): Promise<void> {
    if (this.ctx) return;

    if (!window.isSecureContext) {
      throw new Error(
        "AudioWorklet requires a secure context (HTTPS or localhost).",
      );
    }

    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    // Master bus: gain → panner → analyser → destination
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;

    this.masterPanner = this.ctx.createStereoPanner();
    this.masterPanner.pan.value = 0;

    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 256;

    this.masterGain.connect(this.masterPanner);
    this.masterPanner.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);
  }

  /** Load AudioWorklet modules. Call once after init(). */
  async loadWorkletModules(): Promise<void> {
    if (this.workletModulesLoaded || !this.ctx) return;

    if (!this.ctx.audioWorklet) {
      throw new Error("AudioWorklet is not supported in this browser.");
    }

    await this.ctx.audioWorklet.addModule("/worklets/synth-processor.js");
    this.workletModulesLoaded = true;
  }

  get context(): AudioContext {
    if (!this.ctx) throw new Error("AudioEngine not initialized");
    return this.ctx;
  }

  get masterOutput(): GainNode {
    if (!this.masterGain) throw new Error("AudioEngine not initialized");
    return this.masterGain;
  }

  get analyser(): AnalyserNode {
    if (!this.masterAnalyser) throw new Error("AudioEngine not initialized");
    return this.masterAnalyser;
  }

  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  setMasterVolume(value: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = value;
    }
  }

  setMasterPan(value: number): void {
    if (this.masterPanner) {
      this.masterPanner.pan.value = value;
    }
  }

  getMasterPeakDb(): number {
    if (!this.masterAnalyser) return -Infinity;
    const data = new Float32Array(this.masterAnalyser.fftSize);
    this.masterAnalyser.getFloatTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]!);
      if (abs > peak) peak = abs;
    }
    return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  }

  createTrackChain(trackId: string): TrackChain {
    if (!this.ctx || !this.masterGain) {
      throw new Error("AudioEngine not initialized");
    }
    const chain = new TrackChain(this.ctx, this.masterGain);
    this.trackChains.set(trackId, chain);
    return chain;
  }

  removeTrackChain(trackId: string): void {
    const chain = this.trackChains.get(trackId);
    if (chain) {
      chain.dispose();
      this.trackChains.delete(trackId);
    }
  }

  getTrackChain(trackId: string): TrackChain | undefined {
    return this.trackChains.get(trackId);
  }

  dispose(): void {
    for (const chain of this.trackChains.values()) {
      chain.dispose();
    }
    this.trackChains.clear();

    this.masterAnalyser?.disconnect();
    this.masterPanner?.disconnect();
    this.masterGain?.disconnect();
    void this.ctx?.close();

    this.ctx = null;
    this.masterGain = null;
    this.masterPanner = null;
    this.masterAnalyser = null;
    this.workletModulesLoaded = false;
  }
}
