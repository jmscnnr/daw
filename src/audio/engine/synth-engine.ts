import type { WorkletMessage, WorkletResponse, OscConfig } from "../types";
import { EMPTY_AUDIO_DISPLAY, type PluginAudioDisplayState } from "@/types/plugin";
import {
  AudioContext,
  AudioWorkletNode,
  type IAudioContext,
  type IAudioWorkletNode,
} from "standardized-audio-context";
import type { PluginContext } from "@/types/plugin";

export class SynthEngine {
  private ctx: PluginContext | null = null;
  private workletNode: IAudioWorkletNode<PluginContext> | null = null;
  private initialized = false;
  private ownsContext = false;
  private displayState: PluginAudioDisplayState = EMPTY_AUDIO_DISPLAY;
  private onDisplayUpdate: ((state: PluginAudioDisplayState) => void) | null =
    null;

  /**
   * Initialize the synth engine.
   * @param ctx - External AudioContext from the DAW engine.
   *              If omitted, creates its own (standalone mode).
   */
  async init(ctx?: PluginContext): Promise<void> {
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

    if (!AudioWorkletNode) {
      throw new Error("AudioWorklet is not supported in this browser.");
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
      if (msg.type === "update") {
        // Batched message — handle all fields at once
        this.setDisplayState({
          waveformData: msg.waveform,
          activeNotes: msg.notes,
          levelDb: msg.db,
        });
      } else if (msg.type === "waveform") {
        this.setDisplayState({
          ...this.displayState,
          waveformData: msg.data,
        });
      } else if (msg.type === "activeNotes") {
        this.setDisplayState({
          ...this.displayState,
          activeNotes: msg.notes,
        });
      } else if (msg.type === "level") {
        this.setDisplayState({
          ...this.displayState,
          levelDb: msg.db,
        });
      }
    };

    this.initialized = true;
  }

  /** Get the AudioWorkletNode for external connection (DAW mode). */
  get outputNode(): IAudioWorkletNode<PluginContext> | null {
    return this.workletNode;
  }

  getAudioDisplayState(): PluginAudioDisplayState {
    return this.displayState;
  }

  setDisplayUpdateHandler(
    handler: ((state: PluginAudioDisplayState) => void) | null,
  ): void {
    this.onDisplayUpdate = handler;
    if (handler) {
      handler(this.displayState);
    }
  }

  private send(msg: WorkletMessage): void {
    this.workletNode?.port.postMessage(msg);
  }

  private setDisplayState(state: PluginAudioDisplayState): void {
    this.displayState = state;
    this.onDisplayUpdate?.(state);
  }

  noteOn(midi: number, velocity = 1.0, time?: number): void {
    this.send({ type: "noteOn", midi, velocity, time });
  }

  noteOff(midi: number, time?: number): void {
    this.send({ type: "noteOff", midi, time });
  }

  allNotesOff(): void {
    this.send({ type: "allNotesOff" });
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
    if (this.ctx && this.ownsContext && "close" in this.ctx) {
      void (this.ctx as IAudioContext).close();
    }
    this.workletNode = null;
    this.ctx = null;
    this.initialized = false;
    this.ownsContext = false;
    this.onDisplayUpdate = null;
    this.displayState = EMPTY_AUDIO_DISPLAY;
  }
}
