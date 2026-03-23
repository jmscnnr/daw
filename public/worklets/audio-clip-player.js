"use strict";
(() => {
  // src/audio/worklets/audio-clip-player.ts
  var AudioClipPlayerProcessor = class extends AudioWorkletProcessor {
    constructor() {
      super();
      this.buffers = /* @__PURE__ */ new Map();
      this.regions = [];
      this.playing = false;
      this.currentSample = 0;
      this.port.onmessage = (e) => {
        this.handleMessage(e.data);
      };
    }
    handleMessage(msg) {
      switch (msg.type) {
        case "loadBuffer":
          this.buffers.set(msg.bufferId, msg.data);
          break;
        case "scheduleRegions":
          this.regions = msg.regions;
          for (const region of this.regions) {
            const buf = this.buffers.get(region.bufferId);
            if (buf) region.bufferData = buf;
          }
          break;
        case "clearRegions":
          this.regions = [];
          break;
        case "setPosition":
          this.currentSample = msg.sample;
          break;
        case "play":
          this.playing = true;
          this.currentSample = msg.startSample;
          break;
        case "stop":
          this.playing = false;
          break;
      }
    }
    process(_inputs, outputs, _parameters) {
      const output = outputs[0]?.[0];
      if (!output || !this.playing) return true;
      const nFrames = output.length;
      for (let i = 0; i < nFrames; i++) {
        let sample = 0;
        const pos = this.currentSample + i;
        for (const region of this.regions) {
          if (!region.bufferData) continue;
          const regionEnd = region.startSample + region.durationSamples;
          if (pos >= region.startSample && pos < regionEnd) {
            const bufferIndex = region.offsetSamples + (pos - region.startSample);
            if (bufferIndex >= 0 && bufferIndex < region.bufferData.length) {
              sample += region.bufferData[bufferIndex] * region.gain;
            }
          }
        }
        output[i] = sample;
      }
      this.currentSample += nFrames;
      return true;
    }
  };
  registerProcessor("audio-clip-player", AudioClipPlayerProcessor);
})();
