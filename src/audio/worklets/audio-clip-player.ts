// Audio clip player worklet — plays back audio buffers at precise sample positions.
// Bundled by esbuild into public/worklets/audio-clip-player.js

interface ScheduledRegion {
  bufferId: string;
  bufferData: Float32Array; // Mono channel data
  startSample: number;      // Absolute sample position in the timeline
  offsetSamples: number;    // Where in the buffer to start reading
  durationSamples: number;  // How many samples to play
  gain: number;
}

type PlayerMessage =
  | { type: "loadBuffer"; bufferId: string; data: Float32Array }
  | { type: "scheduleRegions"; regions: ScheduledRegion[] }
  | { type: "clearRegions" }
  | { type: "setPosition"; sample: number }
  | { type: "play"; startSample: number }
  | { type: "stop" };

class AudioClipPlayerProcessor extends AudioWorkletProcessor {
  private buffers = new Map<string, Float32Array>();
  private regions: ScheduledRegion[] = [];
  private playing = false;
  private currentSample = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<PlayerMessage>) => {
      this.handleMessage(e.data);
    };
  }

  private handleMessage(msg: PlayerMessage): void {
    switch (msg.type) {
      case "loadBuffer":
        this.buffers.set(msg.bufferId, msg.data);
        break;
      case "scheduleRegions":
        this.regions = msg.regions;
        // Resolve buffer references
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

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
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
            sample += region.bufferData[bufferIndex]! * region.gain;
          }
        }
      }

      output[i] = sample;
    }

    this.currentSample += nFrames;
    return true;
  }
}

registerProcessor("audio-clip-player", AudioClipPlayerProcessor);
