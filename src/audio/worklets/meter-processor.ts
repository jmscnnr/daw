// Lightweight metering worklet — pass-through audio, push peak dB to main thread.
// Bundled by esbuild into public/worklets/meter-processor.js

const REPORT_INTERVAL_MS = 30;

class MeterProcessor extends AudioWorkletProcessor {
  private peak = 0;
  private samplesSinceReport = 0;
  private reportIntervalSamples: number;

  constructor() {
    super();
    this.reportIntervalSamples = Math.round((REPORT_INTERVAL_MS / 1000) * sampleRate);
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const input = inputs[0]?.[0];
    if (!input) return true;

    // Pass through
    const output = outputs[0]?.[0];
    if (output) output.set(input);

    // Track peak
    for (let i = 0; i < input.length; i++) {
      const abs = Math.abs(input[i]!);
      if (abs > this.peak) this.peak = abs;
    }

    this.samplesSinceReport += input.length;
    if (this.samplesSinceReport >= this.reportIntervalSamples) {
      const db = this.peak > 0 ? 20 * Math.log10(this.peak) : -Infinity;
      this.port.postMessage({ type: "meter", peak: db });
      this.peak = 0;
      this.samplesSinceReport = 0;
    }

    return true;
  }
}

registerProcessor("meter-processor", MeterProcessor);
