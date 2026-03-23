// This file is bundled by esbuild into public/worklets/synth-processor.js
// It runs in the AudioWorklet scope (no DOM, no imports at runtime)

import { renderShape, type Shape } from "../dsp/waveshapes";
import { RealtimeEnvelope } from "../dsp/envelope";
import { BiquadFilter, type FilterMode } from "../dsp/filter";

const MAX_VOICES = 12;
const RING_SIZE = 4096;
const WAVEFORM_SEND_INTERVAL = 6; // ~16ms at 128 samples/block
const BLOCK_SIZE = 128; // standard AudioWorklet block size

// --- Types (duplicated from audio/types.ts — worklets are bundled separately) ---
interface OscConfig {
  shape: Shape;
  octave: number;
  fine: number;
  level: number;
}

type WorkletMessage =
  | { type: "noteOn"; midi: number; velocity: number; time?: number }
  | { type: "noteOff"; midi: number; time?: number }
  | {
      type: "setEnvelope";
      attack: number;
      decay: number;
      sustain: number;
      release: number;
    }
  | { type: "setFilter"; mode: FilterMode; cutoff: number; q: number }
  | { type: "setOscConfigs"; configs: OscConfig[] }
  | { type: "setVolume"; value: number };

interface PendingNoteEvent {
  time: number;
  type: "noteOn" | "noteOff";
  midi: number;
  velocity: number;
}

// --- MIDI util ---
function midiToFreq(midi: number): number {
  return 440.0 * 2.0 ** ((midi - 69) / 12.0);
}

// --- Voice ---
class Voice {
  midi: number;
  env: RealtimeEnvelope;
  private oscs: { shape: Shape; phase: number; phaseInc: number }[];
  private levels: number[];
  // Preallocated scratch buffers — reused every render call
  private _phases: Float32Array;
  private _oscOut: Float32Array;

  constructor(
    midi: number,
    oscConfigs: OscConfig[],
    attack: number,
    decay: number,
    sustain: number,
    release: number,
    sr: number,
  ) {
    this.midi = midi;
    this.env = new RealtimeEnvelope(attack, decay, sustain, release, sr);
    this.env.noteOn();

    this.oscs = [];
    this.levels = [];
    for (const cfg of oscConfigs) {
      const freq = midiToFreq(midi + cfg.octave * 12 + cfg.fine / 100.0);
      this.oscs.push({ shape: cfg.shape, phase: 0.0, phaseInc: freq / sr });
      this.levels.push(cfg.level);
    }

    this._phases = new Float32Array(BLOCK_SIZE);
    this._oscOut = new Float32Array(BLOCK_SIZE);
  }

  get active(): boolean {
    return this.env.active;
  }

  /** Render this voice and add into the target buffer (+=). */
  renderInto(target: Float32Array, n: number): void {
    const envBuf = this.env.process(n);
    const phases = this._phases;
    const oscOut = this._oscOut;

    for (let oi = 0; oi < this.oscs.length; oi++) {
      const osc = this.oscs[oi]!;
      const level = this.levels[oi]!;

      // Compute phases
      for (let i = 0; i < n; i++) {
        phases[i] = (osc.phase + i * osc.phaseInc) % 1.0;
      }
      osc.phase = (osc.phase + n * osc.phaseInc) % 1.0;

      // Render waveform
      renderShape(oscOut, phases, osc.shape);

      // Accumulate into target with envelope
      for (let i = 0; i < n; i++) {
        target[i]! += oscOut[i]! * level * envBuf[i]!;
      }
    }
  }
}

// --- PolySynth ---
class PolySynth {
  private voices: Map<number, Voice> = new Map();
  private sr: number;
  attack = 0.01;
  decay = 0.1;
  sustain = 0.7;
  release = 0.3;
  oscConfigs: OscConfig[] = [{ shape: "saw", octave: 0, fine: 0, level: 1.0 }];
  // Preallocated render buffer
  private _renderBuf: Float32Array;
  private _deadList: number[] = [];

  constructor(sampleRate: number) {
    this.sr = sampleRate;
    this._renderBuf = new Float32Array(BLOCK_SIZE);
  }

  noteOn(midi: number): void {
    if (this.voices.size >= MAX_VOICES && !this.voices.has(midi)) {
      // Voice stealing: prefer releasing voices, then oldest
      let stolen: number | null = null;
      for (const [m, v] of this.voices) {
        if (v.env.state === "release") {
          stolen = m;
          break;
        }
      }
      if (stolen === null) {
        stolen = this.voices.keys().next().value ?? null;
      }
      if (stolen !== null) {
        this.voices.delete(stolen);
      }
    }

    const voice = new Voice(
      midi,
      this.oscConfigs,
      this.attack,
      this.decay,
      this.sustain,
      this.release,
      this.sr,
    );
    this.voices.set(midi, voice);
  }

  noteOff(midi: number): void {
    const voice = this.voices.get(midi);
    if (voice) {
      if (this.release <= 0.001) {
        this.voices.delete(midi);
      } else {
        voice.env.noteOff();
      }
    }
  }

  activeNotes(): number[] {
    const notes: number[] = [];
    for (const [m, v] of this.voices) {
      if (v.active) notes.push(m);
    }
    return notes;
  }

  render(nFrames: number): Float32Array {
    const buf = this._renderBuf;
    // Zero the buffer
    buf.fill(0, 0, nFrames);

    const dead = this._deadList;
    dead.length = 0;

    for (const [midi, voice] of this.voices) {
      if (voice.active) {
        voice.renderInto(buf, nFrames);
      } else {
        dead.push(midi);
      }
    }

    for (const midi of dead) {
      this.voices.delete(midi);
    }

    return buf;
  }
}

// --- AudioWorklet Processor ---
class SynthProcessor extends AudioWorkletProcessor {
  private synth: PolySynth;
  private filter: BiquadFilter;
  private masterVolume: number;
  private ring: Float32Array;
  private ringPos: number;
  private blockCount: number;
  private peakSinceSend: number;
  // Pending note events sorted by time, for block-accurate scheduling
  private pendingEvents: PendingNoteEvent[] = [];

  constructor() {
    super();
    this.synth = new PolySynth(sampleRate);
    this.filter = new BiquadFilter();
    this.masterVolume = 0.3;
    this.ring = new Float32Array(RING_SIZE);
    this.ringPos = 0;
    this.blockCount = 0;
    this.peakSinceSend = 0;

    this.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      this.handleMessage(event.data);
    };
  }

  private handleMessage(msg: WorkletMessage): void {
    switch (msg.type) {
      case "noteOn":
        if (msg.time !== undefined && msg.time > currentTime) {
          this.insertPendingEvent({
            time: msg.time,
            type: "noteOn",
            midi: msg.midi,
            velocity: msg.velocity,
          });
        } else {
          this.synth.noteOn(msg.midi);
        }
        break;
      case "noteOff":
        if (msg.time !== undefined && msg.time > currentTime) {
          this.insertPendingEvent({
            time: msg.time,
            type: "noteOff",
            midi: msg.midi,
            velocity: 0,
          });
        } else {
          this.synth.noteOff(msg.midi);
        }
        break;
      case "setEnvelope":
        this.synth.attack = msg.attack;
        this.synth.decay = msg.decay;
        this.synth.sustain = msg.sustain;
        this.synth.release = msg.release;
        break;
      case "setFilter": {
        const { mode, cutoff, q } = msg;
        if (mode === "off") {
          this.filter.setOff();
        } else if (mode === "lp") {
          this.filter.setLowpass(cutoff, sampleRate, q);
        } else if (mode === "hp") {
          this.filter.setHighpass(cutoff, sampleRate, q);
        } else if (mode === "bp") {
          this.filter.setBandpass(cutoff, sampleRate, q);
        }
        break;
      }
      case "setOscConfigs":
        this.synth.oscConfigs = msg.configs;
        break;
      case "setVolume":
        this.masterVolume = msg.value;
        break;
    }
  }

  /** Insert a pending event in sorted order by time. */
  private insertPendingEvent(event: PendingNoteEvent): void {
    let i = this.pendingEvents.length;
    while (i > 0 && this.pendingEvents[i - 1]!.time > event.time) {
      i--;
    }
    this.pendingEvents.splice(i, 0, event);
  }

  /** Drain pending events that fall within this block's time window. */
  private drainPendingEvents(): void {
    const blockEndTime = currentTime + BLOCK_SIZE / sampleRate;
    let i = 0;
    while (i < this.pendingEvents.length) {
      const event = this.pendingEvents[i]!;
      if (event.time <= blockEndTime) {
        if (event.type === "noteOn") {
          this.synth.noteOn(event.midi);
        } else {
          this.synth.noteOff(event.midi);
        }
        i++;
      } else {
        break; // Events are sorted — no more to drain
      }
    }
    if (i > 0) {
      this.pendingEvents.splice(0, i);
    }
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    void parameters;
    const output = outputs[0]?.[0];
    if (!output) return true;

    const nFrames = output.length;

    // Process any pending timed events that fall within this block
    this.drainPendingEvents();

    // Render synth (returns preallocated buffer — use before next render call)
    let buf = this.synth.render(nFrames);

    // Apply filter (processes in-place)
    buf = this.filter.process(buf);

    // Apply master volume and clip, track peak
    let peak = 0;
    for (let i = 0; i < nFrames; i++) {
      const sample = buf[i]! * this.masterVolume;
      output[i] = Math.max(-1.0, Math.min(1.0, sample));
      const abs = Math.abs(output[i]!);
      if (abs > peak) peak = abs;
    }
    if (peak > this.peakSinceSend) this.peakSinceSend = peak;

    // Write to ring buffer
    const n = nFrames;
    let pos = this.ringPos;
    const space = RING_SIZE - pos;
    if (n <= space) {
      this.ring.set(output.subarray(0, n), pos);
    } else {
      this.ring.set(output.subarray(0, space), pos);
      this.ring.set(output.subarray(space, n), 0);
    }
    this.ringPos = (pos + n) % RING_SIZE;

    // Periodically send batched update to main thread
    this.blockCount++;
    if (this.blockCount >= WAVEFORM_SEND_INTERVAL) {
      this.blockCount = 0;

      // Copy the ring in chronological order
      pos = this.ringPos;
      const waveform = new Float32Array(RING_SIZE);
      waveform.set(this.ring.subarray(pos), 0);
      waveform.set(this.ring.subarray(0, pos), RING_SIZE - pos);

      // Send level
      const db = this.peakSinceSend > 0 ? 20 * Math.log10(this.peakSinceSend) : -Infinity;
      this.peakSinceSend = 0;

      // Single batched message with transferable waveform buffer
      this.port.postMessage(
        {
          type: "update",
          waveform,
          notes: this.synth.activeNotes(),
          db,
        },
        [waveform.buffer],
      );
    }

    return true;
  }
}

registerProcessor("synth-processor", SynthProcessor);
