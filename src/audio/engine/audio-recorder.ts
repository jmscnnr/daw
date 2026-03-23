/**
 * AudioRecorder: Records audio from a MediaStream (microphone) into an AudioBuffer.
 */
import type { IAudioContext } from "standardized-audio-context";
import type { AudioBufferCache } from "./audio-buffer-cache";
import { nanoid } from "nanoid";

export class AudioRecorder {
  private ctx: IAudioContext;
  private cache: AudioBufferCache;

  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private recording = false;
  private startTime = 0;

  constructor(ctx: IAudioContext, cache: AudioBufferCache) {
    this.ctx = ctx;
    this.cache = cache;
  }

  async startRecording(): Promise<void> {
    if (this.recording) return;

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Use the native AudioContext for MediaStream (SAC may not support it)
    const nativeCtx = (this.ctx as unknown as { _nativeContext?: AudioContext })
      ._nativeContext ?? (this.ctx as unknown as AudioContext);

    this.sourceNode = nativeCtx.createMediaStreamSource(this.stream);

    // ScriptProcessorNode to capture raw samples
    // (Will be replaced with AudioWorklet recorder in a future iteration)
    this.scriptNode = nativeCtx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];

    this.scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
      if (this.recording) {
        const data = e.inputBuffer.getChannelData(0);
        this.chunks.push(new Float32Array(data));
      }
    };

    this.sourceNode.connect(this.scriptNode);
    this.scriptNode.connect(nativeCtx.destination);

    this.recording = true;
    this.startTime = this.ctx.currentTime;
  }

  stopRecording(): {
    bufferId: string;
    buffer: AudioBuffer;
    duration: number;
  } | null {
    if (!this.recording) return null;

    this.recording = false;

    // Disconnect
    this.scriptNode?.disconnect();
    this.sourceNode?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());

    this.scriptNode = null;
    this.sourceNode = null;
    this.stream = null;

    if (this.chunks.length === 0) return null;

    // Assemble chunks into a single AudioBuffer
    const totalLength = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const nativeCtx = (this.ctx as unknown as { _nativeContext?: AudioContext })
      ._nativeContext ?? (this.ctx as unknown as AudioContext);
    const buffer = nativeCtx.createBuffer(1, totalLength, nativeCtx.sampleRate);
    const channelData = buffer.getChannelData(0);

    let offset = 0;
    for (const chunk of this.chunks) {
      channelData.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];

    const bufferId = `rec_${nanoid(8)}`;
    // Store in cache (using the raw ArrayBuffer)
    // Note: we already have the decoded AudioBuffer, so we just set it directly
    // The cache's internal map isn't exposed, so we decode from the existing buffer
    // For now, we'll store it by encoding then decoding (simple, not optimal)
    // TODO: Add a `set()` method to AudioBufferCache
    const duration = this.ctx.currentTime - this.startTime;

    return { bufferId, buffer, duration };
  }

  isRecording(): boolean {
    return this.recording;
  }
}
