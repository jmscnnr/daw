import { describe, it, expect } from "vitest";
import { renderShape, type Shape } from "../waveshapes";

function makePhaseRamp(length: number): Float32Array {
  const phases = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    phases[i] = i / length;
  }
  return phases;
}

function makeConstantPhase(value: number, length: number): Float32Array {
  const phases = new Float32Array(length);
  phases.fill(value);
  return phases;
}

describe("renderShape", () => {
  const N = 1024;

  describe("sine", () => {
    it("produces zero at phase 0", () => {
      const out = new Float32Array(1);
      renderShape(out, makeConstantPhase(0, 1), "sine");
      expect(out[0]).toBeCloseTo(0, 10);
    });

    it("produces 1 at phase 0.25", () => {
      const out = new Float32Array(1);
      renderShape(out, makeConstantPhase(0.25, 1), "sine");
      expect(out[0]).toBeCloseTo(1, 10);
    });

    it("produces -1 at phase 0.75", () => {
      const out = new Float32Array(1);
      renderShape(out, makeConstantPhase(0.75, 1), "sine");
      expect(out[0]).toBeCloseTo(-1, 10);
    });

    it("output stays within [-1, 1]", () => {
      const out = new Float32Array(N);
      renderShape(out, makePhaseRamp(N), "sine");
      for (let i = 0; i < N; i++) {
        expect(out[i]).toBeGreaterThanOrEqual(-1);
        expect(out[i]).toBeLessThanOrEqual(1);
      }
    });

    it("is symmetric: sin(phase) = -sin(phase + 0.5)", () => {
      const phases1 = new Float32Array(N);
      const phases2 = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        phases1[i] = i / N;
        phases2[i] = ((i / N) + 0.5) % 1.0;
      }
      const out1 = new Float32Array(N);
      const out2 = new Float32Array(N);
      renderShape(out1, phases1, "sine");
      renderShape(out2, phases2, "sine");

      for (let i = 0; i < N; i++) {
        expect(out1[i]).toBeCloseTo(-out2[i]!, 5);
      }
    });
  });

  describe("saw (naive, dt=0)", () => {
    it("produces -1 at phase 0", () => {
      const out = new Float32Array(1);
      renderShape(out, makeConstantPhase(0, 1), "saw", 0);
      expect(out[0]).toBeCloseTo(-1, 10);
    });

    it("produces ~1 approaching phase 1", () => {
      const out = new Float32Array(1);
      renderShape(out, makeConstantPhase(0.999, 1), "saw", 0);
      expect(out[0]).toBeCloseTo(1, 1);
    });

    it("ramps linearly from -1 to 1", () => {
      const phases = makePhaseRamp(N);
      const out = new Float32Array(N);
      renderShape(out, phases, "saw", 0);

      // Verify linear relationship: out[i] = 2 * phase - 1
      for (let i = 0; i < N; i++) {
        expect(out[i]).toBeCloseTo(2 * phases[i]! - 1, 10);
      }
    });
  });

  describe("saw (PolyBLEP, dt>0)", () => {
    it("output stays within [-1.5, 1.5] with PolyBLEP", () => {
      const dt = 440 / 44100;
      const out = new Float32Array(N);
      renderShape(out, makePhaseRamp(N), "saw", dt);
      for (let i = 0; i < N; i++) {
        expect(out[i]).toBeGreaterThanOrEqual(-1.5);
        expect(out[i]).toBeLessThanOrEqual(1.5);
      }
    });

    it("differs from naive near discontinuity", () => {
      const dt = 440 / 44100;
      const nearDiscontinuity = new Float32Array(1);
      nearDiscontinuity[0] = dt * 0.5; // Very near phase 0

      const naiveOut = new Float32Array(1);
      const blepOut = new Float32Array(1);
      renderShape(naiveOut, new Float32Array(nearDiscontinuity), "saw", 0);
      renderShape(blepOut, new Float32Array(nearDiscontinuity), "saw", dt);

      expect(blepOut[0]).not.toBeCloseTo(naiveOut[0]!, 5);
    });
  });

  describe("square (naive, dt=0)", () => {
    it("produces 1 at phase < 0.5", () => {
      const out = new Float32Array(1);
      renderShape(out, makeConstantPhase(0.1, 1), "square", 0);
      expect(out[0]).toBe(1);
    });

    it("produces -1 at phase >= 0.5", () => {
      const out = new Float32Array(1);
      renderShape(out, makeConstantPhase(0.7, 1), "square", 0);
      expect(out[0]).toBe(-1);
    });

    it("has 50% duty cycle", () => {
      const phases = makePhaseRamp(N);
      const out = new Float32Array(N);
      renderShape(out, phases, "square", 0);

      let positiveCount = 0;
      for (let i = 0; i < N; i++) {
        if (out[i]! > 0) positiveCount++;
      }
      // Should be approximately 50%
      expect(positiveCount / N).toBeCloseTo(0.5, 1);
    });
  });

  describe("square (PolyBLEP, dt>0)", () => {
    it("modifies values near transitions", () => {
      const dt = 440 / 44100;
      const phases = makePhaseRamp(N);
      const naiveOut = new Float32Array(N);
      const blepOut = new Float32Array(N);
      renderShape(naiveOut, new Float32Array(phases), "square", 0);
      renderShape(blepOut, new Float32Array(phases), "square", dt);

      // Most samples should be the same, but some near transitions differ
      let differCount = 0;
      for (let i = 0; i < N; i++) {
        if (Math.abs(blepOut[i]! - naiveOut[i]!) > 0.01) {
          differCount++;
        }
      }
      expect(differCount).toBeGreaterThan(0);
      expect(differCount).toBeLessThan(N * 0.1); // Only near transitions
    });
  });

  describe("triangle", () => {
    // Triangle formula: 4 * |phase - 0.5| - 1
    // phase 0 → 1, phase 0.25 → 0, phase 0.5 → -1, phase 0.75 → 0, phase ~1 → 1

    it("produces 1 at phase 0", () => {
      const out = new Float32Array(1);
      renderShape(out, makeConstantPhase(0, 1), "triangle");
      expect(out[0]).toBeCloseTo(1, 10);
    });

    it("produces -1 at phase 0.5", () => {
      const out = new Float32Array(1);
      renderShape(out, makeConstantPhase(0.5, 1), "triangle");
      expect(out[0]).toBeCloseTo(-1, 10);
    });

    it("produces ~1 approaching phase 1", () => {
      const out = new Float32Array(1);
      renderShape(out, makeConstantPhase(0.999, 1), "triangle");
      expect(out[0]).toBeCloseTo(1, 1);
    });

    it("is linearly descending from phase 0 to 0.5", () => {
      const phases = new Float32Array(100);
      for (let i = 0; i < 100; i++) {
        phases[i] = (i + 1) / 200; // just above 0 to 0.5
      }
      const out = new Float32Array(100);
      renderShape(out, phases, "triangle");

      for (let i = 1; i < 100; i++) {
        expect(out[i]).toBeLessThan(out[i - 1]!);
      }
    });

    it("is linearly ascending from phase 0.5 to 1", () => {
      const phases = new Float32Array(100);
      for (let i = 0; i < 100; i++) {
        phases[i] = 0.501 + i / 200; // just above 0.5 to ~1.0
      }
      const out = new Float32Array(100);
      renderShape(out, phases, "triangle");

      for (let i = 1; i < 100; i++) {
        expect(out[i]).toBeGreaterThan(out[i - 1]!);
      }
    });

    it("output stays within [-1, 1]", () => {
      const out = new Float32Array(N);
      renderShape(out, makePhaseRamp(N), "triangle");
      for (let i = 0; i < N; i++) {
        expect(out[i]).toBeGreaterThanOrEqual(-1);
        expect(out[i]).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("default fallback", () => {
    it("falls back to sine for unknown shape", () => {
      const phases = makePhaseRamp(N);
      const sineOut = new Float32Array(N);
      const fallbackOut = new Float32Array(N);

      renderShape(sineOut, new Float32Array(phases), "sine");
      renderShape(fallbackOut, new Float32Array(phases), "unknown" as Shape);

      for (let i = 0; i < N; i++) {
        expect(fallbackOut[i]).toBeCloseTo(sineOut[i]!, 10);
      }
    });
  });

  describe("batch processing", () => {
    it("processes entire buffer without gaps", () => {
      const out = new Float32Array(N);
      const phases = makePhaseRamp(N);
      renderShape(out, phases, "sine");

      // No NaN or undefined values
      for (let i = 0; i < N; i++) {
        expect(Number.isFinite(out[i])).toBe(true);
      }
    });

    it("handles single-sample buffers", () => {
      const out = new Float32Array(1);
      renderShape(out, makeConstantPhase(0.25, 1), "sine");
      expect(out[0]).toBeCloseTo(1, 10);
    });
  });
});
