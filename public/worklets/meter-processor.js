"use strict";
(() => {
  // src/audio/worklets/meter-processor.ts
  var REPORT_INTERVAL_MS = 30;
  var MeterProcessor = class extends AudioWorkletProcessor {
    constructor() {
      super();
      this.peak = 0;
      this.samplesSinceReport = 0;
      this.reportIntervalSamples = Math.round(REPORT_INTERVAL_MS / 1e3 * sampleRate);
    }
    process(inputs, outputs, _parameters) {
      const input = inputs[0]?.[0];
      if (!input) return true;
      const output = outputs[0]?.[0];
      if (output) output.set(input);
      for (let i = 0; i < input.length; i++) {
        const abs = Math.abs(input[i]);
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
  };
  registerProcessor("meter-processor", MeterProcessor);
})();
