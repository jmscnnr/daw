"use strict";
(() => {
  // src/audio/dsp/waveshapes.ts
  function polyBlep(t, dt) {
    if (t < dt) {
      const u = t / dt;
      return u + u - u * u - 1;
    }
    if (t > 1 - dt) {
      const u = (t - 1) / dt;
      return u * u + u + u + 1;
    }
    return 0;
  }
  function renderShape(out, phases, shape, dt = 0) {
    const len = phases.length;
    const TWO_PI = 2 * Math.PI;
    switch (shape) {
      case "sine":
        for (let i = 0; i < len; i++) {
          out[i] = Math.sin(TWO_PI * phases[i]);
        }
        break;
      case "saw":
        if (dt > 0) {
          for (let i = 0; i < len; i++) {
            const t = phases[i];
            out[i] = 2 * t - 1 - polyBlep(t, dt);
          }
        } else {
          for (let i = 0; i < len; i++) {
            out[i] = 2 * phases[i] - 1;
          }
        }
        break;
      case "square":
        if (dt > 0) {
          for (let i = 0; i < len; i++) {
            const t = phases[i];
            let val = t < 0.5 ? 1 : -1;
            val += polyBlep(t, dt);
            val -= polyBlep((t + 0.5) % 1, dt);
            out[i] = val;
          }
        } else {
          for (let i = 0; i < len; i++) {
            out[i] = phases[i] < 0.5 ? 1 : -1;
          }
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
      this.sr = sr;
      this.attackRate = 1 / Math.max(1, Math.round(sr * attack));
      this.decayRate = (1 - sustain) / Math.max(1, Math.round(sr * decay));
      this.releaseRate = sustain / Math.max(1, Math.round(sr * release));
      this.releaseTime = release;
      this.sustain = sustain;
      this.level = 0;
      this.state = "off";
      this._buf = new Float32Array(128);
    }
    /** Reinitialize without allocating a new buffer. */
    reset(attack, decay, sustain, release, sr) {
      this.sr = sr;
      this.attackRate = 1 / Math.max(1, Math.round(sr * attack));
      this.decayRate = (1 - sustain) / Math.max(1, Math.round(sr * decay));
      this.releaseRate = sustain / Math.max(1, Math.round(sr * release));
      this.releaseTime = release;
      this.sustain = sustain;
      this.level = 0;
      this.state = "off";
    }
    noteOn() {
      this.state = "attack";
    }
    noteOff() {
      if (this.state !== "off") {
        this.state = "release";
        this.releaseRate = this.level / Math.max(1, Math.round(this.sr * this.releaseTime));
      }
    }
    updateRelease(release, sr) {
      this.releaseTime = release;
      this.sr = sr;
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
  var BiquadFilter = class _BiquadFilter {
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
    /** Flush denormals to zero to prevent CPU spikes on near-silent tails. */
    static flush(v) {
      return v + 1e-18 - 1e-18;
    }
    /** Reset filter state — call when output has gone bad (NaN/Infinity). */
    resetState() {
      this.x1 = 0;
      this.x2 = 0;
      this.y1 = 0;
      this.y2 = 0;
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
      x1 = _BiquadFilter.flush(x1);
      x2 = _BiquadFilter.flush(x2);
      y1 = _BiquadFilter.flush(y1);
      y2 = _BiquadFilter.flush(y2);
      if (!isFinite(y1) || !isFinite(y2)) {
        this.x1 = 0;
        this.x2 = 0;
        this.y1 = 0;
        this.y2 = 0;
        return x;
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
  var MAX_PENDING_EVENTS = 256;
  function midiToFreq(midi) {
    return 440 * 2 ** ((midi - 69) / 12);
  }
  var MAX_OSCS = 8;
  var Voice = class {
    constructor(sr) {
      this.midi = 0;
      this.velocity = 1;
      this.oscCount = 0;
      this._active = false;
      this.env = new RealtimeEnvelope(0.01, 0.1, 0.7, 0.3, sr);
      this.filter = new BiquadFilter();
      this.oscs = Array.from({ length: MAX_OSCS }, () => ({
        shape: "saw",
        phase: 0,
        phaseInc: 0
      }));
      this.levels = new Array(MAX_OSCS).fill(0);
      this._phases = new Float32Array(BLOCK_SIZE);
      this._oscOut = new Float32Array(BLOCK_SIZE);
    }
    /** Reinitialize for a new note — no allocations. */
    trigger(midi, velocity, configs, attack, decay, sustain, release, sr) {
      this.midi = midi;
      this.velocity = velocity;
      this._active = true;
      this.env.reset(attack, decay, sustain, release, sr);
      this.env.noteOn();
      this.filter.setOff();
      this.oscCount = Math.min(configs.length, MAX_OSCS);
      for (let i = 0; i < this.oscCount; i++) {
        const cfg = configs[i];
        const freq = midiToFreq(midi + cfg.octave * 12 + cfg.fine / 100);
        this.oscs[i].shape = cfg.shape;
        this.oscs[i].phase = 0;
        this.oscs[i].phaseInc = freq / sr;
        this.levels[i] = cfg.level;
      }
    }
    get active() {
      return this._active && this.env.active;
    }
    /** Update osc configs on a playing voice (preserves phase to avoid clicks). */
    updateOscConfigs(configs, sr) {
      this.oscCount = Math.min(configs.length, MAX_OSCS);
      for (let i = 0; i < this.oscCount; i++) {
        const cfg = configs[i];
        const freq = midiToFreq(this.midi + cfg.octave * 12 + cfg.fine / 100);
        this.oscs[i].shape = cfg.shape;
        this.oscs[i].phaseInc = freq / sr;
        this.levels[i] = cfg.level;
      }
    }
    /** Render this voice and add into the target buffer (+=). */
    renderInto(target, n) {
      const envBuf = this.env.process(n);
      const phases = this._phases;
      const oscOut = this._oscOut;
      const vel = this.velocity;
      for (let oi = 0; oi < this.oscCount; oi++) {
        const osc = this.oscs[oi];
        const level = this.levels[oi];
        for (let i = 0; i < n; i++) {
          phases[i] = (osc.phase + i * osc.phaseInc) % 1;
        }
        osc.phase = (osc.phase + n * osc.phaseInc) % 1;
        renderShape(oscOut, phases, osc.shape, osc.phaseInc);
        for (let i = 0; i < n; i++) {
          target[i] += oscOut[i] * level * envBuf[i] * vel;
        }
      }
      if (!this.env.active) {
        this._active = false;
        this.filter.resetState();
      }
    }
  };
  var SmoothedValue = class {
    constructor(initial, smoothTimeMs, sr) {
      this.current = initial;
      this.target = initial;
      this.coeff = 1 - Math.exp(-1e3 / (smoothTimeMs * sr));
    }
    set(value) {
      this.target = value;
    }
    next() {
      this.current += this.coeff * (this.target - this.current);
      return this.current;
    }
  };
  var PolySynth = class {
    constructor(sampleRate2) {
      this.activeVoices = /* @__PURE__ */ new Map();
      this.attack = 0.01;
      this.decay = 0.1;
      this.sustain = 0.7;
      this.release = 0.3;
      this.oscConfigs = [{ shape: "saw", octave: 0, fine: 0, level: 1 }];
      this._deadList = [];
      // Preallocated active-notes array (avoids allocation every ~16ms)
      this._notesBuf = [];
      this.sr = sampleRate2;
      this._renderBuf = new Float32Array(BLOCK_SIZE);
      this.pool = Array.from({ length: MAX_VOICES }, () => new Voice(sampleRate2));
    }
    findFreeVoice() {
      for (const v of this.pool) {
        if (!v.active && !this.activeVoices.has(v.midi)) {
          let inUse = false;
          for (const av of this.activeVoices.values()) {
            if (av === v) {
              inUse = true;
              break;
            }
          }
          if (!inUse) return v;
        }
      }
      return null;
    }
    stealVoice() {
      let stolen = null;
      let stolenMidi = null;
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
        this.activeVoices.delete(stolenMidi);
      }
      return stolen;
    }
    noteOn(midi, velocity) {
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
        this.sr
      );
      this.activeVoices.set(midi, voice);
    }
    noteOff(midi) {
      const voice = this.activeVoices.get(midi);
      if (voice) {
        if (this.release <= 1e-3) {
          this.activeVoices.delete(midi);
        } else {
          voice.env.noteOff();
        }
      }
    }
    /** Release all active voices immediately — prevents hanging notes. */
    allNotesOff() {
      for (const voice of this.activeVoices.values()) {
        voice.env.noteOff();
      }
    }
    /** Propagate osc config changes to all active voices. */
    updateActiveOscConfigs(configs) {
      for (const voice of this.activeVoices.values()) {
        voice.updateOscConfigs(configs, this.sr);
      }
    }
    /** Update release time on all active voices. */
    updateActiveRelease(release) {
      for (const voice of this.activeVoices.values()) {
        voice.env.updateRelease(release, this.sr);
      }
    }
    activeNotes() {
      const notes = this._notesBuf;
      notes.length = 0;
      for (const [m, v] of this.activeVoices) {
        if (v.active) notes.push(m);
      }
      return notes;
    }
    render(nFrames) {
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
  };
  var WAVEFORM_DISPLAY_SIZE = 256;
  var SynthProcessor = class extends AudioWorkletProcessor {
    constructor() {
      super();
      // Pending note events sorted by time, for block-accurate scheduling
      this.pendingEvents = [];
      this.synth = new PolySynth(sampleRate);
      this.filter = new BiquadFilter();
      this.smoothVolume = new SmoothedValue(0.3, 5, sampleRate);
      this.ring = new Float32Array(RING_SIZE);
      this.ringPos = 0;
      this.blockCount = 0;
      this.peakSinceSend = 0;
      this._waveformBuf = new Float32Array(WAVEFORM_DISPLAY_SIZE);
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
            this.synth.noteOn(msg.midi, msg.velocity);
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
        case "allNotesOff":
          this.synth.allNotesOff();
          this.pendingEvents.length = 0;
          break;
        case "setEnvelope":
          this.synth.attack = msg.attack;
          this.synth.decay = msg.decay;
          this.synth.sustain = msg.sustain;
          this.synth.release = msg.release;
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
          this.synth.updateActiveOscConfigs(msg.configs);
          break;
        case "setVolume":
          this.smoothVolume.set(msg.value);
          break;
      }
    }
    /** Insert a pending event in sorted order by time. */
    insertPendingEvent(event) {
      if (this.pendingEvents.length >= MAX_PENDING_EVENTS) {
        this.pendingEvents.splice(0, this.pendingEvents.length - MAX_PENDING_EVENTS + 1);
      }
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
            this.synth.noteOn(event.midi, event.velocity);
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
      const outL = outputs[0]?.[0];
      if (!outL) return true;
      const outR = outputs[0]?.[1];
      const nFrames = outL.length;
      this.drainPendingEvents();
      let buf = this.synth.render(nFrames);
      buf = this.filter.process(buf);
      let peak = 0;
      let hasNaN = false;
      for (let i = 0; i < nFrames; i++) {
        const vol = this.smoothVolume.next();
        let sample = buf[i] * vol;
        if (!isFinite(sample)) {
          sample = 0;
          hasNaN = true;
        }
        outL[i] = Math.tanh(sample);
        const abs = Math.abs(outL[i]);
        if (abs > peak) peak = abs;
      }
      if (hasNaN) {
        this.filter.resetState();
      }
      if (peak > this.peakSinceSend) this.peakSinceSend = peak;
      if (outR) outR.set(outL);
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
      this.blockCount++;
      if (this.blockCount >= WAVEFORM_SEND_INTERVAL) {
        this.blockCount = 0;
        pos = this.ringPos;
        const waveform = this._waveformBuf;
        const step = RING_SIZE / WAVEFORM_DISPLAY_SIZE;
        for (let i = 0; i < WAVEFORM_DISPLAY_SIZE; i++) {
          const srcIdx = (pos + Math.floor(i * step)) % RING_SIZE;
          waveform[i] = this.ring[srcIdx];
        }
        const db = this.peakSinceSend > 0 ? 20 * Math.log10(this.peakSinceSend) : -Infinity;
        this.peakSinceSend = 0;
        const transfer = new Float32Array(waveform);
        this.port.postMessage(
          {
            type: "update",
            waveform: transfer,
            notes: this.synth.activeNotes(),
            db
          },
          [transfer.buffer]
        );
      }
      return true;
    }
  };
  registerProcessor("synth-processor", SynthProcessor);
})();
