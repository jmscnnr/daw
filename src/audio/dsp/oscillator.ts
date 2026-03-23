import { renderShape, type Shape } from "./waveshapes";

export class Oscillator {
  shape: Shape;
  phase: number;
  phaseInc: number;

  constructor(freq: number, shape: Shape, sampleRate: number) {
    this.shape = shape;
    this.phase = 0.0;
    this.phaseInc = freq / sampleRate;
  }

  render(n: number): Float32Array {
    const phases = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      phases[i] = (this.phase + i * this.phaseInc) % 1.0;
    }
    this.phase = (this.phase + n * this.phaseInc) % 1.0;

    const out = new Float32Array(n);
    renderShape(out, phases, this.shape);
    return out;
  }
}
