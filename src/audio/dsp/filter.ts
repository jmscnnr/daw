export type FilterMode = "off" | "lp" | "hp" | "bp";

export class BiquadFilter {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  active = false;

  setOff(): void {
    this.active = false;
  }

  setLowpass(cutoff: number, sr: number, q: number): void {
    this.active = true;
    this.compute(cutoff, sr, q, "lp");
  }

  setHighpass(cutoff: number, sr: number, q: number): void {
    this.active = true;
    this.compute(cutoff, sr, q, "hp");
  }

  setBandpass(cutoff: number, sr: number, q: number): void {
    this.active = true;
    this.compute(cutoff, sr, q, "bp");
  }

  private compute(cutoff: number, sr: number, q: number, mode: FilterMode): void {
    cutoff = Math.max(20.0, Math.min(cutoff, sr / 2 - 1));
    const w0 = (2.0 * Math.PI * cutoff) / sr;
    const alpha = Math.sin(w0) / (2.0 * q);
    const cosW0 = Math.cos(w0);

    let b0: number, b1: number, b2: number;
    if (mode === "lp") {
      b0 = (1.0 - cosW0) / 2.0;
      b1 = 1.0 - cosW0;
      b2 = (1.0 - cosW0) / 2.0;
    } else if (mode === "hp") {
      b0 = (1.0 + cosW0) / 2.0;
      b1 = -(1.0 + cosW0);
      b2 = (1.0 + cosW0) / 2.0;
    } else {
      b0 = alpha;
      b1 = 0.0;
      b2 = -alpha;
    }

    const a0 = 1.0 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2.0 * cosW0) / a0;
    this.a2 = (1.0 - alpha) / a0;
  }

  /** Process the buffer in-place and return it. */
  process(x: Float32Array): Float32Array {
    if (!this.active) return x;

    const { b0, b1, b2, a1, a2 } = this;
    let { x1, x2, y1, y2 } = this;

    for (let i = 0; i < x.length; i++) {
      const x0 = x[i]!;
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
}
