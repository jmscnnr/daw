/**
 * Compute min/max peak data from an AudioBuffer for waveform display.
 */
export interface PeakData {
  min: Float32Array;
  max: Float32Array;
}

/**
 * Compute peaks at a given resolution.
 * @param buffer - The source AudioBuffer (uses channel 0)
 * @param samplesPerPixel - Number of source samples per output pixel/column
 * @returns min and max arrays of equal length
 */
export function computePeaks(
  buffer: AudioBuffer,
  samplesPerPixel: number,
): PeakData {
  const channelData = buffer.getChannelData(0);
  const totalSamples = channelData.length;
  const numPeaks = Math.ceil(totalSamples / samplesPerPixel);

  const min = new Float32Array(numPeaks);
  const max = new Float32Array(numPeaks);

  for (let i = 0; i < numPeaks; i++) {
    const start = Math.floor(i * samplesPerPixel);
    const end = Math.min(start + Math.ceil(samplesPerPixel), totalSamples);

    let lo = Infinity;
    let hi = -Infinity;

    for (let j = start; j < end; j++) {
      const sample = channelData[j]!;
      if (sample < lo) lo = sample;
      if (sample > hi) hi = sample;
    }

    min[i] = lo === Infinity ? 0 : lo;
    max[i] = hi === -Infinity ? 0 : hi;
  }

  return { min, max };
}
