"use strict";
(() => {
  // src/audio/worklets/transport-clock.ts
  var BLOCK_SIZE = 128;
  var POSITION_REPORT_MS = 30;
  var TransportClockProcessor = class extends AudioWorkletProcessor {
    constructor() {
      super();
      this.playing = false;
      this.tickPosition = 0;
      this.bpm = 120;
      this.ppq = 960;
      this.samplesPerTick = 0;
      this.subTickAccumulator = 0;
      this.loopEnabled = false;
      this.loopStartTick = 0;
      this.loopEndTick = 0;
      this.events = [];
      this.eventIndex = 0;
      // Current position in sorted events array
      this.samplesSinceReport = 0;
      this.reportIntervalSamples = Math.round(POSITION_REPORT_MS / 1e3 * sampleRate);
      this.recomputeTiming();
      this.port.onmessage = (e) => {
        this.handleMessage(e.data);
      };
    }
    handleMessage(msg) {
      switch (msg.type) {
        case "play":
          this.playing = true;
          this.tickPosition = msg.tick;
          this.bpm = msg.bpm;
          this.ppq = msg.ppq;
          this.subTickAccumulator = 0;
          this.eventIndex = 0;
          this.recomputeTiming();
          break;
        case "stop":
          this.playing = false;
          this.tickPosition = 0;
          this.eventIndex = 0;
          break;
        case "pause":
          this.playing = false;
          break;
        case "seek":
          this.tickPosition = msg.tick;
          this.subTickAccumulator = 0;
          this.eventIndex = 0;
          this.seekEventIndex();
          break;
        case "setBPM":
          this.bpm = msg.bpm;
          this.recomputeTiming();
          break;
        case "setLoop":
          this.loopEnabled = msg.enabled;
          this.loopStartTick = msg.startTick;
          this.loopEndTick = msg.endTick;
          break;
        case "scheduleEvents":
          this.events = msg.events;
          this.events.sort((a, b) => a.tick - b.tick);
          this.seekEventIndex();
          break;
        case "clearEvents":
          this.events = [];
          this.eventIndex = 0;
          break;
      }
    }
    recomputeTiming() {
      this.samplesPerTick = 60 * sampleRate / (this.bpm * this.ppq);
    }
    seekEventIndex() {
      let lo = 0;
      let hi = this.events.length;
      while (lo < hi) {
        const mid = lo + hi >>> 1;
        if (this.events[mid].tick < this.tickPosition) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      this.eventIndex = lo;
    }
    process(_inputs, _outputs, _parameters) {
      if (!this.playing) return true;
      const samplesPerTick = this.samplesPerTick;
      for (let i = 0; i < BLOCK_SIZE; i++) {
        this.subTickAccumulator++;
        if (this.subTickAccumulator >= samplesPerTick) {
          this.subTickAccumulator -= samplesPerTick;
          this.tickPosition++;
          if (this.loopEnabled && this.loopEndTick > this.loopStartTick && this.tickPosition >= this.loopEndTick) {
            this.tickPosition = this.loopStartTick;
            this.seekEventIndex();
            this.port.postMessage({
              type: "loopReset",
              tick: this.tickPosition
            });
          }
          while (this.eventIndex < this.events.length && this.events[this.eventIndex].tick <= this.tickPosition) {
            const evt = this.events[this.eventIndex];
            this.port.postMessage({
              type: "event",
              trackId: evt.trackId,
              noteOn: evt.noteOn,
              note: evt.note,
              velocity: evt.velocity,
              sampleOffset: i
            });
            this.eventIndex++;
          }
        }
      }
      this.samplesSinceReport += BLOCK_SIZE;
      if (this.samplesSinceReport >= this.reportIntervalSamples) {
        this.port.postMessage({
          type: "position",
          tick: this.tickPosition
        });
        this.samplesSinceReport = 0;
      }
      return true;
    }
  };
  registerProcessor("transport-clock", TransportClockProcessor);
})();
