export type Shape = "sine" | "saw" | "square" | "triangle";

export function renderShape(
  out: Float32Array,
  phases: Float32Array,
  shape: Shape,
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
      for (let i = 0; i < len; i++) {
        out[i] = 2.0 * phases[i]! - 1.0;
      }
      break;
    case "square":
      for (let i = 0; i < len; i++) {
        out[i] = phases[i]! < 0.5 ? 1.0 : -1.0;
      }
      break;
    case "triangle":
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
