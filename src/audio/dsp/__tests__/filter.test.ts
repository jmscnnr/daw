import { describe, it, expect } from "vitest";
import { BiquadFilter } from "../filter";

const SR = 44100;

function generateSineWave(
  frequency: number,
  sampleRate: number,
  numSamples: number,
): Float32Array {
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    buffer[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return buffer;
}

function generateWhiteNoise(numSamples: number): Float32Array {
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    buffer[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function rms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i]! * buffer[i]!;
  }
  return Math.sqrt(sum / buffer.length);
}

describe("BiquadFilter", () => {
  describe("initialization", () => {
    it("starts in inactive state", () => {
      const filter = new BiquadFilter();
      expect(filter.active).toBe(false);
    });

    it("passes through signal unmodified when inactive", () => {
      const filter = new BiquadFilter();
      const input = generateSineWave(440, SR, 512);
      const expected = new Float32Array(input);
      const output = filter.process(input);

      expect(output).toBe(input); // same reference
      for (let i = 0; i < 512; i++) {
        expect(output[i]).toBe(expected[i]);
      }
    });
  });

  describe("lowpass", () => {
    it("activates filter on setLowpass", () => {
      const filter = new BiquadFilter();
      filter.setLowpass(1000, SR, 0.707);
      expect(filter.active).toBe(true);
    });

    it("passes low frequency signals through with minimal attenuation", () => {
      const filter = new BiquadFilter();
      filter.setLowpass(5000, SR, 0.707);

      // 200 Hz is well below 5000 Hz cutoff
      const input = generateSineWave(200, SR, 4096);
      const inputRms = rms(input);

      // Let filter settle
      filter.process(generateSineWave(200, SR, 2048));
      const output = filter.process(input);
      const outputRms = rms(output);

      // Should preserve most of the signal (within 1 dB)
      expect(outputRms / inputRms).toBeGreaterThan(0.89);
    });

    it("attenuates high frequency signals", () => {
      const filter = new BiquadFilter();
      filter.setLowpass(500, SR, 0.707);

      // 8000 Hz is well above 500 Hz cutoff
      const settleSignal = generateSineWave(8000, SR, 4096);
      filter.process(settleSignal);

      const input = generateSineWave(8000, SR, 4096);
      const inputRms = rms(input);
      const output = filter.process(input);
      const outputRms = rms(output);

      // Should be significantly attenuated
      expect(outputRms / inputRms).toBeLessThan(0.1);
    });
  });

  describe("highpass", () => {
    it("activates filter on setHighpass", () => {
      const filter = new BiquadFilter();
      filter.setHighpass(1000, SR, 0.707);
      expect(filter.active).toBe(true);
    });

    it("passes high frequency signals through with minimal attenuation", () => {
      const filter = new BiquadFilter();
      filter.setHighpass(200, SR, 0.707);

      // 5000 Hz is well above 200 Hz cutoff
      filter.process(generateSineWave(5000, SR, 2048));
      const input = generateSineWave(5000, SR, 4096);
      const inputRms = rms(input);
      const output = filter.process(input);
      const outputRms = rms(output);

      expect(outputRms / inputRms).toBeGreaterThan(0.89);
    });

    it("attenuates low frequency signals", () => {
      const filter = new BiquadFilter();
      filter.setHighpass(5000, SR, 0.707);

      filter.process(generateSineWave(100, SR, 4096));
      const input = generateSineWave(100, SR, 4096);
      const inputRms = rms(input);
      const output = filter.process(input);
      const outputRms = rms(output);

      expect(outputRms / inputRms).toBeLessThan(0.1);
    });
  });

  describe("bandpass", () => {
    it("activates filter on setBandpass", () => {
      const filter = new BiquadFilter();
      filter.setBandpass(1000, SR, 2);
      expect(filter.active).toBe(true);
    });

    it("passes center frequency with minimal attenuation", () => {
      const filter = new BiquadFilter();
      const centerFreq = 2000;
      filter.setBandpass(centerFreq, SR, 1);

      filter.process(generateSineWave(centerFreq, SR, 4096));
      const input = generateSineWave(centerFreq, SR, 4096);
      const inputRms = rms(input);
      const output = filter.process(input);
      const outputRms = rms(output);

      expect(outputRms / inputRms).toBeGreaterThan(0.7);
    });

    it("attenuates frequencies far from center", () => {
      const filter = new BiquadFilter();
      filter.setBandpass(2000, SR, 5);

      // Test with frequency far from center
      filter.process(generateSineWave(100, SR, 4096));
      const input = generateSineWave(100, SR, 4096);
      const inputRms = rms(input);
      const output = filter.process(input);
      const outputRms = rms(output);

      expect(outputRms / inputRms).toBeLessThan(0.2);
    });
  });

  describe("setOff", () => {
    it("deactivates the filter", () => {
      const filter = new BiquadFilter();
      filter.setLowpass(1000, SR, 0.707);
      expect(filter.active).toBe(true);

      filter.setOff();
      expect(filter.active).toBe(false);
    });

    it("passes through signal after deactivation", () => {
      const filter = new BiquadFilter();
      filter.setLowpass(1000, SR, 0.707);
      filter.setOff();

      const input = generateSineWave(8000, SR, 512);
      const expected = new Float32Array(input);
      filter.process(input);

      for (let i = 0; i < 512; i++) {
        expect(input[i]).toBe(expected[i]);
      }
    });
  });

  describe("coefficient stability", () => {
    it("clamps cutoff frequency to valid range", () => {
      const filter = new BiquadFilter();

      // Should not throw with extreme cutoff values
      expect(() => filter.setLowpass(0, SR, 0.707)).not.toThrow();
      expect(() => filter.setLowpass(100000, SR, 0.707)).not.toThrow();
      expect(() => filter.setHighpass(0, SR, 0.707)).not.toThrow();
      expect(() => filter.setBandpass(100000, SR, 0.707)).not.toThrow();
    });

    it("produces finite output with edge-case parameters", () => {
      const filter = new BiquadFilter();
      filter.setLowpass(20, SR, 0.707);

      const input = generateWhiteNoise(4096);
      const output = filter.process(input);

      for (let i = 0; i < 4096; i++) {
        expect(Number.isFinite(output[i])).toBe(true);
      }
    });

    it("processes in-place and returns the same buffer", () => {
      const filter = new BiquadFilter();
      filter.setLowpass(1000, SR, 0.707);

      const input = generateSineWave(440, SR, 512);
      const result = filter.process(input);
      expect(result).toBe(input);
    });
  });

  describe("state continuity", () => {
    it("maintains filter state across multiple process calls", () => {
      const filter = new BiquadFilter();
      filter.setLowpass(500, SR, 0.707);

      // Process in two chunks vs one large chunk
      const filterA = new BiquadFilter();
      filterA.setLowpass(500, SR, 0.707);

      const fullInput = generateSineWave(440, SR, 1024);
      const chunkA = new Float32Array(fullInput.subarray(0, 512));
      const chunkB = new Float32Array(fullInput.subarray(512, 1024));

      const resultA1 = new Float32Array(filterA.process(new Float32Array(chunkA)));
      const resultA2 = new Float32Array(filterA.process(new Float32Array(chunkB)));

      const filterB = new BiquadFilter();
      filterB.setLowpass(500, SR, 0.707);
      const fullResult = new Float32Array(filterB.process(new Float32Array(fullInput)));

      // Results should be identical (chunked vs whole)
      for (let i = 0; i < 512; i++) {
        expect(resultA1[i]).toBeCloseTo(fullResult[i]!, 10);
      }
      for (let i = 0; i < 512; i++) {
        expect(resultA2[i]).toBeCloseTo(fullResult[512 + i]!, 10);
      }
    });
  });
});
