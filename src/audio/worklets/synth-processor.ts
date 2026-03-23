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
const MAX_OSCS = 8;

class Voice {
  midi = 0;
  velocity = 1.0;
  env: RealtimeEnvelope;
  filter: BiquadFilter;
  private oscs: { shape: Shape; phase: number; phaseInc: number }[];
  private levels: number[];
  private oscCount = 0;
  // Preallocated scratch buffers — reused every render call
  private _phases: Float32Array;
  private _oscOut: Float32Array;
  private _active = false;

  constructor(sr: number) {
    this.env = new RealtimeEnvelope(0.01, 0.1, 0.7, 0.3, sr);
    this.filter = new BiquadFilter();
    this.oscs = Array.from({ length: MAX_OSCS }, () => ({
      shape: "saw" as Shape,
      phase: 0,
      phaseInc: 0,
    }));
    this.levels = new Array(MAX_OSCS).fill(0);
    this._phases = new Float32Array(BLOCK_SIZE);
    this._oscOut = new Float32Array(BLOCK_SIZE);
  }

  /** Reinitialize for a new note — no allocations. */
  trigger(
    midi: number,
    velocity: number,
    configs: OscConfig[],
    attack: number,
    decay: number,
    sustain: number,
    release: number,
    sr: number,
  ): void {
    this.midi = midi;
    this.velocity = velocity;
    this._active = true;
    this.env.reset(attack, decay, sustain, release, sr);
    this.env.noteOn();
    this.filter.setOff();

    this.oscCount = Math.min(configs.length, MAX_OSCS);
    for (let i = 0; i < this.oscCount; i++) {
      const cfg = configs[i]!;
      const freq = midiToFreq(midi + cfg.octave * 12 + cfg.fine / 100.0);
      this.oscs[i]!.shape = cfg.shape;
      this.oscs[i]!.phase = 0;
      this.oscs[i]!.phaseInc = freq / sr;
      this.levels[i] = cfg.level;
    }
  }

  get active(): boolean {
    return this._active && this.env.active;
  }

  /** Update osc configs on a playing voice (preserves phase to avoid clicks). */
  updateOscConfigs(configs: OscConfig[], sr: number): void {
    this.oscCount = Math.min(configs.length, MAX_OSCS);
    for (let i = 0; i < this.oscCount; i++) {
      const cfg = configs[i]!;
      const freq = midiToFreq(this.midi + cfg.octave * 12 + cfg.fine / 100.0);
      this.oscs[i]!.shape = cfg.shape;
      // preserve phase — don't reset to 0
      this.oscs[i]!.phaseInc = freq / sr;
      this.levels[i] = cfg.level;
    }
  }

  /** Render this voice and add into the target buffer (+=). */
  renderInto(target: Float32Array, n: number): void {
    const envBuf = this.env.process(n);
    const phases = this._phases;
    const oscOut = this._oscOut;
    const vel = this.velocity;

    for (let oi = 0; oi < this.oscCount; oi++) {
      const osc = this.oscs[oi]!;
      const level = this.levels[oi]!;

      // Compute phases
      for (let i = 0; i < n; i++) {
        phases[i] = (osc.phase + i * osc.phaseInc) % 1.0;
      }
      osc.phase = (osc.phase + n * osc.phaseInc) % 1.0;

      // Render waveform with PolyBLEP anti-aliasing
      renderShape(oscOut, phases, osc.shape, osc.phaseInc);

      // Accumulate into target with envelope and velocity
      for (let i = 0; i < n; i++) {
        target[i]! += oscOut[i]! * level * envBuf[i]! * vel;
      }
    }

    if (!this.env.active) {
      this._active = false;
    }
  }
}

// --- SmoothedValue (one-pole exponential smoothing) ---
class SmoothedValue {
  current: number;
  target: number;
  private coeff: number;

  constructor(initial: number, smoothTimeMs: number, sr: number) {
    this.current = initial;
    this.target = initial;
    this.coeff = 1.0 - Math.exp(-1000.0 / (smoothTimeMs * sr));
  }

  set(value: number): void {
    this.target = value;
  }

  next(): number {
    this.current += this.coeff * (this.target - this.current);
    return this.current;
  }
}

// --- PolySynth ---
class PolySynth {
  private pool: Voice[];
  private activeVoices: Map<number, Voice> = new Map();
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
    // Pre-allocate all voices upfront — no allocations on noteOn
    this.pool = Array.from({ length: MAX_VOICES }, () => new Voice(sampleRate));
  }

  private findFreeVoice(): Voice | null {
    for (const v of this.pool) {
      if (!v.active && !this.activeVoices.has(v.midi)) {
        // Double check it's not in the active map under a different key
        let inUse = false;
        for (const av of this.activeVoices.values()) {
          if (av === v) { inUse = true; break; }
        }
        if (!inUse) return v;
      }
    }
    return null;
  }

  private stealVoice(): Voice {
    // Prefer releasing voices, then oldest
    let stolen: Voice | null = null;
    let stolenMidi: number | null = null;
    for (const [m, v] of this.activeVoices) {
      if (v.env.state === "release") {
        stolen = v;
        stolenMidi = m;
        break;
      }
    }
    if (!stolen) {
      const first = this.activeVoices.entries().next().value;
      if (first) {
        stolenMidi = first[0];
        stolen = first[1];
      }
    }
    if (stolenMidi !== null) {
      this.activeVoices.delete(stolenMidi!);
    }
    return stolen!;
  }

  noteOn(midi: number, velocity: number): void {
    // If same note is already playing, release it first
    const existing = this.activeVoices.get(midi);
    if (existing) {
      this.activeVoices.delete(midi);
    }

    let voice = this.findFreeVoice();
    if (!voice) {
      voice = this.stealVoice();
    }

    voice.trigger(
      midi,
      velocity,
      this.oscConfigs,
      this.attack,
      this.decay,
      this.sustain,
      this.release,
      this.sr,
    );
    this.activeVoices.set(midi, voice);
  }

  noteOff(midi: number): void {
    const voice = this.activeVoices.get(midi);
    if (voice) {
      if (this.release <= 0.001) {
        this.activeVoices.delete(midi);
      } else {
        voice.env.noteOff();
      }
    }
  }

  /** Propagate osc config changes to all active voices. */
  updateActiveOscConfigs(configs: OscConfig[]): void {
    for (const voice of this.activeVoices.values()) {
      voice.updateOscConfigs(configs, this.sr);
    }
  }

  /** Update release time on all active voices. */
  updateActiveRelease(release: number): void {
    for (const voice of this.activeVoices.values()) {
      voice.env.updateRelease(release, this.sr);
    }
  }

  activeNotes(): number[] {
    const notes: number[] = [];
    for (const [m, v] of this.activeVoices) {
      if (v.active) notes.push(m);
    }
    return notes;
  }

  render(nFrames: number): Float32Array {
    const buf = this._renderBuf;
    buf.fill(0, 0, nFrames);

    const dead = this._deadList;
    dead.length = 0;

    for (const [midi, voice] of this.activeVoices) {
      if (voice.active) {
        voice.renderInto(buf, nFrames);
      } else {
        dead.push(midi);
      }
    }

    for (const midi of dead) {
      this.activeVoices.delete(midi);
    }

    return buf;
  }
}

const WAVEFORM_DISPLAY_SIZE = 256;

// --- AudioWorklet Processor ---
class SynthProcessor extends AudioWorkletProcessor {
  private synth: PolySynth;
  private filter: BiquadFilter;
  private smoothVolume: SmoothedValue;
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
    this.smoothVolume = new SmoothedValue(0.3, 5, sampleRate);
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
          this.synth.noteOn(msg.midi, msg.velocity);
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
        // Update release on all currently sounding voices
        this.synth.updateActiveRelease(msg.release);
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
        // Propagate to all active voices
        this.synth.updateActiveOscConfigs(msg.configs);
        break;
      case "setVolume":
        this.smoothVolume.set(msg.value);
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
          this.synth.noteOn(event.midi, event.velocity);
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
    const outL = outputs[0]?.[0];
    if (!outL) return true;
    const outR = outputs[0]?.[1];

    const nFrames = outL.length;

    // Process any pending timed events that fall within this block
    this.drainPendingEvents();

    // Render synth (returns preallocated buffer — use before next render call)
    let buf = this.synth.render(nFrames);

    // Apply global filter (processes in-place)
    buf = this.filter.process(buf);

    // Apply smoothed master volume and tanh soft saturation, track peak
    let peak = 0;
    for (let i = 0; i < nFrames; i++) {
      const vol = this.smoothVolume.next();
      const sample = buf[i]! * vol;
      outL[i] = Math.tanh(sample);
      const abs = Math.abs(outL[i]!);
      if (abs > peak) peak = abs;
    }
    if (peak > this.peakSinceSend) this.peakSinceSend = peak;

    // Copy to right channel (dual mono)
    if (outR) outR.set(outL);

    // Write to ring buffer
    const n = nFrames;
    let pos = this.ringPos;
    const space = RING_SIZE - pos;
    if (n <= space) {
      this.ring.set(outL.subarray(0, n), pos);
    } else {
      this.ring.set(outL.subarray(0, space), pos);
      this.ring.set(outL.subarray(space, n), 0);
    }
    this.ringPos = (pos + n) % RING_SIZE;

    // Periodically send batched update to main thread
    this.blockCount++;
    if (this.blockCount >= WAVEFORM_SEND_INTERVAL) {
      this.blockCount = 0;

      // Downsample the ring for display — 256 samples is plenty for visualization
      pos = this.ringPos;
      const waveform = new Float32Array(WAVEFORM_DISPLAY_SIZE);
      const step = RING_SIZE / WAVEFORM_DISPLAY_SIZE;
      for (let i = 0; i < WAVEFORM_DISPLAY_SIZE; i++) {
        const srcIdx = (pos + Math.floor(i * step)) % RING_SIZE;
        waveform[i] = this.ring[srcIdx]!;
      }

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
