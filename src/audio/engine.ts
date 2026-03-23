import type { WorkletMessage, WorkletResponse, OscConfig } from "./types";
import { useAudioDisplayStore } from "@/stores/audio-display-store";

export class SynthEngine {
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private initialized = false;
  private ownsContext = false;

  /**
   * Initialize the synth engine.
   * @param ctx - External AudioContext from the DAW engine.
   *              If omitted, creates its own (standalone mode).
   */
  async init(ctx?: AudioContext): Promise<void> {
    if (this.initialized) return;

    if (!window.isSecureContext) {
      throw new Error(
        "AudioWorklet requires a secure context (HTTPS or localhost). " +
          "Access this page via http://localhost:3000 instead of a LAN IP.",
      );
    }

    if (ctx) {
      this.ctx = ctx;
      this.ownsContext = false;
    } else {
      this.ctx = new AudioContext({ sampleRate: 44100 });
      this.ownsContext = true;

      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }
    }

    if (!this.ctx.audioWorklet) {
      throw new Error("AudioWorklet is not supported in this browser.");
    }

    // Only add the module if it hasn't been loaded yet.
    // In DAW mode, the AudioEngine loads it first.
    try {
      await this.ctx.audioWorklet.addModule("/worklets/synth-processor.js");
    } catch {
      // Module may already be registered — that's fine.
    }

    this.workletNode = new AudioWorkletNode(this.ctx, "synth-processor");

    // In standalone mode, connect to destination.
    // In DAW mode, the TrackChain will connect the node.
    if (!ctx) {
      this.workletNode.connect(this.ctx.destination);
    }

    this.workletNode.port.onmessage = (
      event: MessageEvent<WorkletResponse>,
    ) => {
      const msg = event.data;
      if (msg.type === "waveform") {
        useAudioDisplayStore.getState().setWaveform(msg.data);
      } else if (msg.type === "activeNotes") {
        useAudioDisplayStore.getState().setActiveNotes(msg.notes);
      } else if (msg.type === "level") {
        useAudioDisplayStore.getState().setLevelDb(msg.db);
      }
    };

    this.initialized = true;
  }

  /** Get the AudioWorkletNode for external connection (DAW mode). */
  get outputNode(): AudioWorkletNode | null {
    return this.workletNode;
  }

  private send(msg: WorkletMessage): void {
    this.workletNode?.port.postMessage(msg);
  }

  noteOn(midi: number, velocity = 1.0): void {
    this.send({ type: "noteOn", midi, velocity });
  }

  noteOff(midi: number): void {
    this.send({ type: "noteOff", midi });
  }

  setEnvelope(
    attack: number,
    decay: number,
    sustain: number,
    release: number,
  ): void {
    this.send({ type: "setEnvelope", attack, decay, sustain, release });
  }

  setFilter(
    mode: "off" | "lp" | "hp" | "bp",
    cutoff: number,
    q: number,
  ): void {
    this.send({ type: "setFilter", mode, cutoff, q });
  }

  setVolume(value: number): void {
    this.send({ type: "setVolume", value });
  }

  setOscConfigs(configs: OscConfig[]): void {
    this.send({ type: "setOscConfigs", configs });
  }

  dispose(): void {
    this.workletNode?.disconnect();
    // Only close the context if we created it (standalone mode)
    if (this.ctx && this.ownsContext) {
      void this.ctx.close();
    }
    this.workletNode = null;
    this.ctx = null;
    this.initialized = false;
    this.ownsContext = false;
  }
}
