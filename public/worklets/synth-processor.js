"use strict";
(() => {
  // src/audio/dsp/waveshapes.ts
  function renderShape(out, phases, shape) {
    const len = phases.length;
    const TWO_PI = 2 * Math.PI;
    switch (shape) {
      case "sine":
        for (let i = 0; i < len; i++) {
          out[i] = Math.sin(TWO_PI * phases[i]);
        }
        break;
      case "saw":
        for (let i = 0; i < len; i++) {
          out[i] = 2 * phases[i] - 1;
        }
        break;
      case "square":
        for (let i = 0; i < len; i++) {
          out[i] = phases[i] < 0.5 ? 1 : -1;
        }
        break;
      case "triangle":
        for (let i = 0; i < len; i++) {
          out[i] = 4 * Math.abs(phases[i] - 0.5) - 1;
        }
        break;
      default:
        for (let i = 0; i < len; i++) {
          out[i] = Math.sin(TWO_PI * phases[i]);
        }
    }
  }

  // src/audio/dsp/envelope.ts
  var RealtimeEnvelope = class {
    constructor(attack, decay, sustain, release, sr) {
      this.attackRate = 1 / Math.max(1, Math.round(sr * attack));
      this.decayRate = (1 - sustain) / Math.max(1, Math.round(sr * decay));
      this.releaseRate = sustain / Math.max(1, Math.round(sr * release));
      this.sustain = sustain;
      this.level = 0;
      this.state = "off";
      this._buf = new Float32Array(128);
    }
    noteOn() {
      this.state = "attack";
    }
    noteOff() {
      if (this.state !== "off") {
        this.state = "release";
      }
    }
    get active() {
      return this.state !== "off";
    }
    process(n) {
      if (this._buf.length < n) {
        this._buf = new Float32Array(n);
      }
      const out = this._buf;
      let pos = 0;
      while (pos < n) {
        const remaining = n - pos;
        if (this.state === "attack") {
          let steps = Math.min(
            remaining,
            Math.max(1, Math.ceil((1 - this.level) / this.attackRate))
          );
          for (let i = 0; i < steps; i++) {
            this.level += this.attackRate;
            if (this.level >= 1) {
              this.level = 1;
              this.state = "decay";
              out[pos + i] = this.level;
              steps = i + 1;
              break;
            }
            out[pos + i] = this.level;
          }
          pos += steps;
        } else if (this.state === "decay") {
          let steps = Math.min(
            remaining,
            Math.max(1, Math.ceil((this.level - this.sustain) / this.decayRate))
          );
          for (let i = 0; i < steps; i++) {
            this.level -= this.decayRate;
            if (this.level <= this.sustain) {
              this.level = this.sustain;
              this.state = "sustain";
              out[pos + i] = this.level;
              steps = i + 1;
              break;
            }
            out[pos + i] = this.level;
          }
          pos += steps;
        } else if (this.state === "sustain") {
          for (let i = 0; i < remaining; i++) {
            out[pos + i] = this.sustain;
          }
          pos += remaining;
        } else if (this.state === "release") {
          let steps = Math.min(
            remaining,
            Math.max(1, Math.ceil(this.level / this.releaseRate))
          );
          for (let i = 0; i < steps; i++) {
            this.level -= this.releaseRate;
            if (this.level <= 0) {
              this.level = 0;
              this.state = "off";
              out[pos + i] = 0;
              steps = i + 1;
              break;
            }
            out[pos + i] = this.level;
          }
          pos += steps;
        } else {
          for (let i = 0; i < remaining; i++) {
            out[pos + i] = 0;
          }
          pos += remaining;
        }
      }
      return out;
    }
  };

  // src/audio/dsp/filter.ts
  var BiquadFilter = class {
    constructor() {
      this.x1 = 0;
      this.x2 = 0;
      this.y1 = 0;
      this.y2 = 0;
      this.b0 = 1;
      this.b1 = 0;
      this.b2 = 0;
      this.a1 = 0;
      this.a2 = 0;
      this.active = false;
    }
    setOff() {
      this.active = false;
    }
    setLowpass(cutoff, sr, q) {
      this.active = true;
      this.compute(cutoff, sr, q, "lp");
    }
    setHighpass(cutoff, sr, q) {
      this.active = true;
      this.compute(cutoff, sr, q, "hp");
    }
    setBandpass(cutoff, sr, q) {
      this.active = true;
      this.compute(cutoff, sr, q, "bp");
    }
    compute(cutoff, sr, q, mode) {
      cutoff = Math.max(20, Math.min(cutoff, sr / 2 - 1));
      const w0 = 2 * Math.PI * cutoff / sr;
      const alpha = Math.sin(w0) / (2 * q);
      const cosW0 = Math.cos(w0);
      let b0, b1, b2;
      if (mode === "lp") {
        b0 = (1 - cosW0) / 2;
        b1 = 1 - cosW0;
        b2 = (1 - cosW0) / 2;
      } else if (mode === "hp") {
        b0 = (1 + cosW0) / 2;
        b1 = -(1 + cosW0);
        b2 = (1 + cosW0) / 2;
      } else {
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
      }
      const a0 = 1 + alpha;
      this.b0 = b0 / a0;
      this.b1 = b1 / a0;
      this.b2 = b2 / a0;
      this.a1 = -2 * cosW0 / a0;
      this.a2 = (1 - alpha) / a0;
    }
    /** Process the buffer in-place and return it. */
    process(x) {
      if (!this.active) return x;
      const { b0, b1, b2, a1, a2 } = this;
      let { x1, x2, y1, y2 } = this;
      for (let i = 0; i < x.length; i++) {
        const x0 = x[i];
        const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x[i] = y0;
        x2 = x1;
        x1 = x0;
        y2 = y1;
        y1 = y0;
      }
      this.x1 = x1;
      this.x2 = x2;
      this.y1 = y1;
      this.y2 = y2;
      return x;
    }
  };

  // src/audio/worklets/synth-processor.ts
  var MAX_VOICES = 12;
  var RING_SIZE = 4096;
  var WAVEFORM_SEND_INTERVAL = 6;
  var BLOCK_SIZE = 128;
  function midiToFreq(midi) {
    return 440 * 2 ** ((midi - 69) / 12);
  }
  var Voice = class {
    constructor(midi, oscConfigs, attack, decay, sustain, release, sr) {
      this.midi = midi;
      this.env = new RealtimeEnvelope(attack, decay, sustain, release, sr);
      this.env.noteOn();
      this.oscs = [];
      this.levels = [];
      for (const cfg of oscConfigs) {
        const freq = midiToFreq(midi + cfg.octave * 12 + cfg.fine / 100);
        this.oscs.push({ shape: cfg.shape, phase: 0, phaseInc: freq / sr });
        this.levels.push(cfg.level);
      }
      this._phases = new Float32Array(BLOCK_SIZE);
      this._oscOut = new Float32Array(BLOCK_SIZE);
    }
    get active() {
      return this.env.active;
    }
    /** Render this voice and add into the target buffer (+=). */
    renderInto(target, n) {
      const envBuf = this.env.process(n);
      const phases = this._phases;
      const oscOut = this._oscOut;
      for (let oi = 0; oi < this.oscs.length; oi++) {
        const osc = this.oscs[oi];
        const level = this.levels[oi];
        for (let i = 0; i < n; i++) {
          phases[i] = (osc.phase + i * osc.phaseInc) % 1;
        }
        osc.phase = (osc.phase + n * osc.phaseInc) % 1;
        renderShape(oscOut, phases, osc.shape);
        for (let i = 0; i < n; i++) {
          target[i] += oscOut[i] * level * envBuf[i];
        }
      }
    }
  };
  var PolySynth = class {
    constructor(sampleRate2) {
      this.voices = /* @__PURE__ */ new Map();
      this.attack = 0.01;
      this.decay = 0.1;
      this.sustain = 0.7;
      this.release = 0.3;
      this.oscConfigs = [{ shape: "saw", octave: 0, fine: 0, level: 1 }];
      this._deadList = [];
      this.sr = sampleRate2;
      this._renderBuf = new Float32Array(BLOCK_SIZE);
    }
    noteOn(midi) {
      if (this.voices.size >= MAX_VOICES && !this.voices.has(midi)) {
        let stolen = null;
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
        this.sr
      );
      this.voices.set(midi, voice);
    }
    noteOff(midi) {
      const voice = this.voices.get(midi);
      if (voice) {
        if (this.release <= 1e-3) {
          this.voices.delete(midi);
        } else {
          voice.env.noteOff();
        }
      }
    }
    activeNotes() {
      const notes = [];
      for (const [m, v] of this.voices) {
        if (v.active) notes.push(m);
      }
      return notes;
    }
    render(nFrames) {
      const buf = this._renderBuf;
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
  };
  var SynthProcessor = class extends AudioWorkletProcessor {
    constructor() {
      super();
      // Pending note events sorted by time, for block-accurate scheduling
      this.pendingEvents = [];
      this.synth = new PolySynth(sampleRate);
      this.filter = new BiquadFilter();
      this.masterVolume = 0.3;
      this.ring = new Float32Array(RING_SIZE);
      this.ringPos = 0;
      this.blockCount = 0;
      this.peakSinceSend = 0;
      this.port.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    }
    handleMessage(msg) {
      switch (msg.type) {
        case "noteOn":
          if (msg.time !== void 0 && msg.time > currentTime) {
            this.insertPendingEvent({
              time: msg.time,
              type: "noteOn",
              midi: msg.midi,
              velocity: msg.velocity
            });
          } else {
            this.synth.noteOn(msg.midi);
          }
          break;
        case "noteOff":
          if (msg.time !== void 0 && msg.time > currentTime) {
            this.insertPendingEvent({
              time: msg.time,
              type: "noteOff",
              midi: msg.midi,
              velocity: 0
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
    insertPendingEvent(event) {
      let i = this.pendingEvents.length;
      while (i > 0 && this.pendingEvents[i - 1].time > event.time) {
        i--;
      }
      this.pendingEvents.splice(i, 0, event);
    }
    /** Drain pending events that fall within this block's time window. */
    drainPendingEvents() {
      const blockEndTime = currentTime + BLOCK_SIZE / sampleRate;
      let i = 0;
      while (i < this.pendingEvents.length) {
        const event = this.pendingEvents[i];
        if (event.time <= blockEndTime) {
          if (event.type === "noteOn") {
            this.synth.noteOn(event.midi);
          } else {
            this.synth.noteOff(event.midi);
          }
          i++;
        } else {
          break;
        }
      }
      if (i > 0) {
        this.pendingEvents.splice(0, i);
      }
    }
    process(_inputs, outputs, parameters) {
      void parameters;
      const output = outputs[0]?.[0];
      if (!output) return true;
      const nFrames = output.length;
      this.drainPendingEvents();
      let buf = this.synth.render(nFrames);
      buf = this.filter.process(buf);
      let peak = 0;
      for (let i = 0; i < nFrames; i++) {
        const sample = buf[i] * this.masterVolume;
        output[i] = Math.max(-1, Math.min(1, sample));
        const abs = Math.abs(output[i]);
        if (abs > peak) peak = abs;
      }
      if (peak > this.peakSinceSend) this.peakSinceSend = peak;
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
      this.blockCount++;
      if (this.blockCount >= WAVEFORM_SEND_INTERVAL) {
        this.blockCount = 0;
        pos = this.ringPos;
        const waveform = new Float32Array(RING_SIZE);
        waveform.set(this.ring.subarray(pos), 0);
        waveform.set(this.ring.subarray(0, pos), RING_SIZE - pos);
        const db = this.peakSinceSend > 0 ? 20 * Math.log10(this.peakSinceSend) : -Infinity;
        this.peakSinceSend = 0;
        this.port.postMessage(
          {
            type: "update",
            waveform,
            notes: this.synth.activeNotes(),
            db
          },
          [waveform.buffer]
        );
      }
      return true;
    }
  };
  registerProcessor("synth-processor", SynthProcessor);
})();
