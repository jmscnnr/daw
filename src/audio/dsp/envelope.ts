export type EnvelopeState = "off" | "attack" | "decay" | "sustain" | "release";

export class RealtimeEnvelope {
  attackRate: number;
  decayRate: number;
  releaseRate: number;
  sustain: number;
  level: number;
  state: EnvelopeState;
  private releaseTime: number;
  private sr: number;
  private _buf: Float32Array;

  constructor(
    attack: number,
    decay: number,
    sustain: number,
    release: number,
    sr: number,
  ) {
    this.sr = sr;
    this.attackRate = 1.0 / Math.max(1, Math.round(sr * attack));
    this.decayRate = (1.0 - sustain) / Math.max(1, Math.round(sr * decay));
    this.releaseRate = sustain / Math.max(1, Math.round(sr * release));
    this.releaseTime = release;
    this.sustain = sustain;
    this.level = 0.0;
    this.state = "off";
    this._buf = new Float32Array(128);
  }

  /** Reinitialize without allocating a new buffer. */
  reset(
    attack: number,
    decay: number,
    sustain: number,
    release: number,
    sr: number,
  ): void {
    this.sr = sr;
    this.attackRate = 1.0 / Math.max(1, Math.round(sr * attack));
    this.decayRate = (1.0 - sustain) / Math.max(1, Math.round(sr * decay));
    this.releaseRate = sustain / Math.max(1, Math.round(sr * release));
    this.releaseTime = release;
    this.sustain = sustain;
    this.level = 0.0;
    this.state = "off";
  }

  noteOn(): void {
    this.state = "attack";
  }

  noteOff(): void {
    if (this.state !== "off") {
      this.state = "release";
      // Recompute release rate from current level (fixes sustain=0 voice leak
      // and handles noteOff during attack where level != sustain)
      this.releaseRate = this.level / Math.max(1, Math.round(this.sr * this.releaseTime));
    }
  }

  updateRelease(release: number, sr: number): void {
    this.releaseTime = release;
    this.sr = sr;
  }

  get active(): boolean {
    return this.state !== "off";
  }

  process(n: number): Float32Array {
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
          Math.max(1, Math.ceil((1.0 - this.level) / this.attackRate)),
        );

        for (let i = 0; i < steps; i++) {
          this.level += this.attackRate;
          if (this.level >= 1.0) {
            this.level = 1.0;
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
          Math.max(1, Math.ceil((this.level - this.sustain) / this.decayRate)),
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
          Math.max(1, Math.ceil(this.level / this.releaseRate)),
        );

        for (let i = 0; i < steps; i++) {
          this.level -= this.releaseRate;
          if (this.level <= 0.0) {
            this.level = 0.0;
            this.state = "off";
            out[pos + i] = 0.0;
            steps = i + 1;
            break;
          }
          out[pos + i] = this.level;
        }
        pos += steps;
      } else {
        // off
        for (let i = 0; i < remaining; i++) {
          out[pos + i] = 0.0;
        }
        pos += remaining;
      }
    }

    return out;
  }
}
