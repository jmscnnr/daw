export type Shape = "sine" | "saw" | "square" | "triangle";

/** PolyBLEP correction — reduces aliasing at waveform discontinuities. */
function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const u = t / dt;
    return u + u - u * u - 1.0;
  }
  if (t > 1.0 - dt) {
    const u = (t - 1.0) / dt;
    return u * u + u + u + 1.0;
  }
  return 0.0;
}

/**
 * Render waveform into `out` from normalised `phases` (0..1).
 * @param dt Phase increment (freq/sampleRate) — used for PolyBLEP on saw/square. Pass 0 for naive.
 */
export function renderShape(
  out: Float32Array,
  phases: Float32Array,
  shape: Shape,
  dt = 0,
): void {
  const len = phases.length;
  const TWO_PI = 2.0 * Math.PI;

  switch (shape) {
    case "sine":
      for (let i = 0; i < len; i++) {
        out[i] = Math.sin(TWO_PI * phases[i]!);
      }
      break;
    case "saw":
      if (dt > 0) {
        for (let i = 0; i < len; i++) {
          const t = phases[i]!;
          out[i] = 2.0 * t - 1.0 - polyBlep(t, dt);
        }
      } else {
        for (let i = 0; i < len; i++) {
          out[i] = 2.0 * phases[i]! - 1.0;
        }
      }
      break;
    case "square":
      if (dt > 0) {
        for (let i = 0; i < len; i++) {
          const t = phases[i]!;
          let val = t < 0.5 ? 1.0 : -1.0;
          val += polyBlep(t, dt);
          val -= polyBlep((t + 0.5) % 1.0, dt);
          out[i] = val;
        }
      } else {
        for (let i = 0; i < len; i++) {
          out[i] = phases[i]! < 0.5 ? 1.0 : -1.0;
        }
      }
      break;
    case "triangle":
      // Triangle harmonics fall off as 1/n² — aliasing is much less audible, keep naive
      for (let i = 0; i < len; i++) {
        out[i] = 4.0 * Math.abs(phases[i]! - 0.5) - 1.0;
      }
      break;
    default:
      for (let i = 0; i < len; i++) {
        out[i] = Math.sin(TWO_PI * phases[i]!);
      }
  }
}
