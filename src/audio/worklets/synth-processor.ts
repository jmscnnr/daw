// This file is bundled by esbuild into public/worklets/synth-processor.js
// It runs in the AudioWorklet scope (no DOM, no imports at runtime)

import { renderShape, type Shape } from "../dsp/waveshapes";
import { RealtimeEnvelope } from "../dsp/envelope";
import { BiquadFilter, type FilterMode } from "../dsp/filter";

const MAX_VOICES = 12;
const RING_SIZE = 4096;
const WAVEFORM_SEND_INTERVAL = 6; // ~16ms at 128 samples/block

// --- Types ---
interface OscConfig {
  shape: Shape;
  octave: number;
  fine: number;
  level: number;
}

interface WorkletMessage {
  type: string;
  [key: string]: unknown;
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
  }

  get active(): boolean {
    return this.env.active;
  }

  render(n: number): Float32Array {
    const envBuf = this.env.process(n);
    const buf = new Float32Array(n);
    const phases = new Float32Array(n);
    const oscOut = new Float32Array(n);

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

      // Accumulate
      for (let i = 0; i < n; i++) {
        buf[i] = buf[i]! + oscOut[i]! * level;
      }
    }

    // Apply envelope
    for (let i = 0; i < n; i++) {
      buf[i] = buf[i]! * envBuf[i]!;
    }

    return buf;
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

  constructor(sampleRate: number) {
    this.sr = sampleRate;
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
    const buf = new Float32Array(nFrames);
    const dead: number[] = [];

    for (const [midi, voice] of this.voices) {
      if (voice.active) {
        const voiceBuf = voice.render(nFrames);
        for (let i = 0; i < nFrames; i++) {
          buf[i] = buf[i]! + voiceBuf[i]!;
        }
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
        this.synth.noteOn(msg.midi as number);
        break;
      case "noteOff":
        this.synth.noteOff(msg.midi as number);
        break;
      case "setEnvelope":
        this.synth.attack = msg.attack as number;
        this.synth.decay = msg.decay as number;
        this.synth.sustain = msg.sustain as number;
        this.synth.release = msg.release as number;
        break;
      case "setFilter": {
        const mode = msg.mode as FilterMode;
        const cutoff = msg.cutoff as number;
        const q = msg.q as number;
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
        this.synth.oscConfigs = msg.configs as OscConfig[];
        break;
      case "setVolume":
        this.masterVolume = msg.value as number;
        break;
    }
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0]?.[0];
    if (!output) return true;

    const nFrames = output.length;

    // Render synth
    let buf = this.synth.render(nFrames);

    // Apply filter
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

    // Periodically send waveform + active notes to main thread
    this.blockCount++;
    if (this.blockCount >= WAVEFORM_SEND_INTERVAL) {
      this.blockCount = 0;

      // Send waveform (copy the ring in chronological order)
      pos = this.ringPos;
      const waveform = new Float32Array(RING_SIZE);
      waveform.set(this.ring.subarray(pos), 0);
      waveform.set(this.ring.subarray(0, pos), RING_SIZE - pos);
      this.port.postMessage(
        { type: "waveform", data: waveform },
        [waveform.buffer],
      );

      // Send active notes
      this.port.postMessage({
        type: "activeNotes",
        notes: this.synth.activeNotes(),
      });

      // Send level and reset peak tracker
      const db = this.peakSinceSend > 0 ? 20 * Math.log10(this.peakSinceSend) : -Infinity;
      this.port.postMessage({ type: "level", db });
      this.peakSinceSend = 0;
    }

    return true;
  }
}

registerProcessor("synth-processor", SynthProcessor);
