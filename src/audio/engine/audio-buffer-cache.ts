/**
 * AudioBufferCache: Decodes and caches AudioBuffer objects for audio clip playback.
 */
import type { PluginContext } from "@/types/plugin";

export class AudioBufferCache {
  private cache = new Map<string, AudioBuffer>();
  private ctx: PluginContext;

  constructor(ctx: PluginContext) {
    this.ctx = ctx;
  }

  async loadFromUrl(id: string, url: string): Promise<AudioBuffer> {
    const existing = this.cache.get(id);
    if (existing) return existing;

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return this.decodeFromArrayBuffer(id, arrayBuffer);
  }

  async decodeFromArrayBuffer(id: string, data: ArrayBuffer): Promise<AudioBuffer> {
    const existing = this.cache.get(id);
    if (existing) return existing;

    const buffer = await this.ctx.decodeAudioData(data);
    this.cache.set(id, buffer);
    return buffer;
  }

  async decodeFromBlob(id: string, blob: Blob): Promise<AudioBuffer> {
    const arrayBuffer = await blob.arrayBuffer();
    return this.decodeFromArrayBuffer(id, arrayBuffer);
  }

  get(id: string): AudioBuffer | undefined {
    return this.cache.get(id);
  }

  has(id: string): boolean {
    return this.cache.has(id);
  }

  evict(id: string): void {
    this.cache.delete(id);
  }

  clear(): void {
    this.cache.clear();
  }
}
