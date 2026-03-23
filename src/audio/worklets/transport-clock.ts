// Transport clock worklet — sample-accurate tick counter and event dispatcher.
// Bundled by esbuild into public/worklets/transport-clock.js
//
// This processor does NOT produce audio. It runs as a connected node whose
// sole job is to advance a tick position at sample accuracy, dispatch
// scheduled events, and report position to the main thread.

const BLOCK_SIZE = 128;
const POSITION_REPORT_MS = 30;

interface ScheduledEvent {
  tick: number;
  trackId: string;
  noteOn: boolean;
  note: number;
  velocity: number;
}

type ClockMessage =
  | { type: "play"; tick: number; bpm: number; ppq: number }
  | { type: "stop" }
  | { type: "pause" }
  | { type: "seek"; tick: number }
  | { type: "setBPM"; bpm: number }
  | { type: "setLoop"; enabled: boolean; startTick: number; endTick: number }
  | { type: "scheduleEvents"; events: ScheduledEvent[] }
  | { type: "clearEvents" };

class TransportClockProcessor extends AudioWorkletProcessor {
  private playing = false;
  private tickPosition = 0;
  private bpm = 120;
  private ppq = 960;
  private samplesPerTick = 0;
  private subTickAccumulator = 0;

  private loopEnabled = false;
  private loopStartTick = 0;
  private loopEndTick = 0;

  private events: ScheduledEvent[] = [];
  private eventIndex = 0; // Current position in sorted events array

  private samplesSinceReport = 0;
  private reportIntervalSamples: number;

  constructor() {
    super();
    this.reportIntervalSamples = Math.round((POSITION_REPORT_MS / 1000) * sampleRate);
    this.recomputeTiming();

    this.port.onmessage = (e: MessageEvent<ClockMessage>) => {
      this.handleMessage(e.data);
    };
  }

  private handleMessage(msg: ClockMessage): void {
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
        // Re-find event index for new position
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

  private recomputeTiming(): void {
    // samples per tick = (60 * sampleRate) / (bpm * ppq)
    this.samplesPerTick = (60 * sampleRate) / (this.bpm * this.ppq);
  }

  private seekEventIndex(): void {
    // Binary search for current tick position
    let lo = 0;
    let hi = this.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.events[mid]!.tick < this.tickPosition) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    this.eventIndex = lo;
  }

  process(
    _inputs: Float32Array[][],
    _outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    if (!this.playing) return true;

    const samplesPerTick = this.samplesPerTick;

    for (let i = 0; i < BLOCK_SIZE; i++) {
      this.subTickAccumulator++;

      if (this.subTickAccumulator >= samplesPerTick) {
        this.subTickAccumulator -= samplesPerTick;
        this.tickPosition++;

        // Loop boundary
        if (
          this.loopEnabled &&
          this.loopEndTick > this.loopStartTick &&
          this.tickPosition >= this.loopEndTick
        ) {
          this.tickPosition = this.loopStartTick;
          this.seekEventIndex();
          this.port.postMessage({
            type: "loopReset",
            tick: this.tickPosition,
          });
        }

        // Dispatch events at this tick
        while (
          this.eventIndex < this.events.length &&
          this.events[this.eventIndex]!.tick <= this.tickPosition
        ) {
          const evt = this.events[this.eventIndex]!;
          this.port.postMessage({
            type: "event",
            trackId: evt.trackId,
            noteOn: evt.noteOn,
            note: evt.note,
            velocity: evt.velocity,
            sampleOffset: i,
          });
          this.eventIndex++;
        }
      }
    }

    // Throttled position report
    this.samplesSinceReport += BLOCK_SIZE;
    if (this.samplesSinceReport >= this.reportIntervalSamples) {
      this.port.postMessage({
        type: "position",
        tick: this.tickPosition,
      });
      this.samplesSinceReport = 0;
    }

    return true;
  }
}

registerProcessor("transport-clock", TransportClockProcessor);
