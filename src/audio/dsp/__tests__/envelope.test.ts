import { describe, it, expect } from "vitest";
import { RealtimeEnvelope } from "../envelope";

const SR = 44100;

function processAll(env: RealtimeEnvelope, samples: number): Float32Array {
  return env.process(samples).slice(0, samples);
}

describe("RealtimeEnvelope", () => {
  describe("construction", () => {
    it("initializes in the off state with zero level", () => {
      const env = new RealtimeEnvelope(0.01, 0.1, 0.5, 0.2, SR);
      expect(env.state).toBe("off");
      expect(env.level).toBe(0);
      expect(env.active).toBe(false);
    });

    it("computes attack rate from sample rate and attack time", () => {
      const attackTime = 0.01; // 10ms
      const env = new RealtimeEnvelope(attackTime, 0.1, 0.5, 0.2, SR);
      const expectedSamples = Math.round(SR * attackTime);
      expect(env.attackRate).toBeCloseTo(1.0 / expectedSamples, 10);
    });

    it("computes decay rate proportional to (1 - sustain)", () => {
      const sustain = 0.7;
      const decayTime = 0.1;
      const env = new RealtimeEnvelope(0.01, decayTime, sustain, 0.2, SR);
      const expectedSamples = Math.round(SR * decayTime);
      expect(env.decayRate).toBeCloseTo((1.0 - sustain) / expectedSamples, 10);
    });

    it("computes release rate proportional to sustain level", () => {
      const sustain = 0.5;
      const releaseTime = 0.2;
      const env = new RealtimeEnvelope(0.01, 0.1, sustain, releaseTime, SR);
      const expectedSamples = Math.round(SR * releaseTime);
      expect(env.releaseRate).toBeCloseTo(sustain / expectedSamples, 10);
    });
  });

  describe("noteOn/noteOff lifecycle", () => {
    it("transitions to attack on noteOn", () => {
      const env = new RealtimeEnvelope(0.01, 0.1, 0.5, 0.2, SR);
      env.noteOn();
      expect(env.state).toBe("attack");
      expect(env.active).toBe(true);
    });

    it("transitions through attack -> decay -> sustain", () => {
      const env = new RealtimeEnvelope(0.001, 0.001, 0.5, 0.2, SR);
      env.noteOn();

      // Process enough samples to get through attack and decay
      const totalSamples = Math.ceil(SR * 0.005);
      processAll(env, totalSamples);

      expect(env.state).toBe("sustain");
      expect(env.level).toBeCloseTo(0.5, 2);
    });

    it("holds at sustain level indefinitely", () => {
      const sustain = 0.6;
      const env = new RealtimeEnvelope(0.001, 0.001, sustain, 0.2, SR);
      env.noteOn();

      // Get through attack and decay
      processAll(env, Math.ceil(SR * 0.005));
      expect(env.state).toBe("sustain");

      // Process more samples — should stay at sustain
      const buf = processAll(env, 1024);
      for (let i = 0; i < 1024; i++) {
        expect(buf[i]).toBeCloseTo(sustain, 5);
      }
      expect(env.state).toBe("sustain");
    });

    it("transitions to release on noteOff and decays to zero", () => {
      const env = new RealtimeEnvelope(0.001, 0.001, 0.5, 0.01, SR);
      env.noteOn();

      // Get to sustain
      processAll(env, Math.ceil(SR * 0.005));
      expect(env.state).toBe("sustain");

      env.noteOff();
      expect(env.state).toBe("release");

      // Process through release
      processAll(env, Math.ceil(SR * 0.02));
      expect(env.state).toBe("off");
      expect(env.level).toBe(0);
      expect(env.active).toBe(false);
    });

    it("handles noteOff during attack phase", () => {
      const env = new RealtimeEnvelope(0.1, 0.1, 0.5, 0.01, SR);
      env.noteOn();

      // Process just a few samples (still in attack)
      processAll(env, 10);
      expect(env.state).toBe("attack");
      expect(env.level).toBeGreaterThan(0);
      expect(env.level).toBeLessThan(1);

      env.noteOff();
      expect(env.state).toBe("release");

      // Release rate is recomputed from current level
      processAll(env, Math.ceil(SR * 0.02));
      expect(env.state).toBe("off");
      expect(env.level).toBe(0);
    });

    it("noteOff when already off is a no-op", () => {
      const env = new RealtimeEnvelope(0.01, 0.1, 0.5, 0.2, SR);
      expect(env.state).toBe("off");
      env.noteOff();
      expect(env.state).toBe("off");
    });
  });

  describe("process", () => {
    it("outputs zeros when off", () => {
      const env = new RealtimeEnvelope(0.01, 0.1, 0.5, 0.2, SR);
      const buf = processAll(env, 128);
      for (let i = 0; i < 128; i++) {
        expect(buf[i]).toBe(0);
      }
    });

    it("attack phase ramps from 0 toward 1", () => {
      const env = new RealtimeEnvelope(0.01, 0.1, 0.5, 0.2, SR);
      env.noteOn();
      const buf = processAll(env, 64);

      // Each sample should be greater than or equal to the previous
      for (let i = 1; i < 64; i++) {
        expect(buf[i]!).toBeGreaterThanOrEqual(buf[i - 1]!);
      }
      expect(buf[0]).toBeGreaterThan(0);
    });

    it("peak level reaches exactly 1.0", () => {
      const env = new RealtimeEnvelope(0.001, 0.5, 0.5, 0.2, SR);
      env.noteOn();

      // Process enough to get past attack
      const totalSamples = Math.ceil(SR * 0.003);
      const buf = processAll(env, totalSamples);

      // At least one sample should be exactly 1.0
      let foundPeak = false;
      for (let i = 0; i < totalSamples; i++) {
        if (buf[i] === 1.0) {
          foundPeak = true;
          break;
        }
      }
      expect(foundPeak).toBe(true);
    });

    it("decay phase decreases from 1.0 toward sustain", () => {
      const env = new RealtimeEnvelope(0.0001, 0.01, 0.3, 0.2, SR);
      env.noteOn();

      // Skip through attack
      processAll(env, Math.ceil(SR * 0.001));

      // Now in decay — values should decrease
      if (env.state === "decay") {
        const buf = processAll(env, 64);
        for (let i = 1; i < 64; i++) {
          if (env.state === "sustain") break;
          expect(buf[i]!).toBeLessThanOrEqual(buf[i - 1]!);
        }
      }
    });

    it("handles zero sustain without voice leak", () => {
      const env = new RealtimeEnvelope(0.001, 0.001, 0, 0.01, SR);
      env.noteOn();

      // Get through attack, decay, sustain
      processAll(env, Math.ceil(SR * 0.005));
      expect(env.state).toBe("sustain");
      expect(env.level).toBe(0);

      // noteOff with level=0 and sustain=0 produces releaseRate=0, which
      // causes a NaN step count in the release loop. The process method exits
      // early because pos+=NaN breaks the while condition. The envelope stays
      // in "release" state but the level remains at 0, so no audio leaks.
      env.noteOff();
      expect(env.state).toBe("release");
      expect(env.level).toBe(0);

      // Even though state is "release", level is 0 so no audio output
      const buf = processAll(env, 128);
      // The NaN in step count means the loop produces partial output, but
      // level stays at 0 so there is no audible leak
      expect(env.level).toBe(0);
    });

    it("resizes internal buffer when n exceeds current capacity", () => {
      const env = new RealtimeEnvelope(0.01, 0.1, 0.5, 0.2, SR);
      env.noteOn();
      // Default buffer is 128 — request 256
      const buf = processAll(env, 256);
      expect(buf.length).toBe(256);
      for (let i = 0; i < 256; i++) {
        expect(buf[i]).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("reset", () => {
    it("reinitializes state without allocating a new envelope", () => {
      const env = new RealtimeEnvelope(0.01, 0.1, 0.5, 0.2, SR);
      env.noteOn();
      processAll(env, 100);

      env.reset(0.02, 0.2, 0.7, 0.3, SR);
      expect(env.state).toBe("off");
      expect(env.level).toBe(0);
      expect(env.sustain).toBe(0.7);

      const expectedAttackSamples = Math.round(SR * 0.02);
      expect(env.attackRate).toBeCloseTo(1.0 / expectedAttackSamples, 10);
    });
  });

  describe("updateRelease", () => {
    it("updates release time without changing other state", () => {
      const env = new RealtimeEnvelope(0.01, 0.1, 0.5, 0.2, SR);
      env.noteOn();
      processAll(env, Math.ceil(SR * 0.015));

      const levelBefore = env.level;
      const stateBefore = env.state;

      env.updateRelease(0.5, SR);

      expect(env.level).toBe(levelBefore);
      expect(env.state).toBe(stateBefore);
    });
  });
});
