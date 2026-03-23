"use client";

import { useEffect, useRef } from "react";
import type { PeakData } from "@/audio/engine/waveform-peaks";

const WAVE_COLOR = "#4ecdc4";
const BG_COLOR = "transparent";

interface AudioClipWaveformProps {
  peaks: PeakData;
  width: number;
  height: number;
  className?: string;
}

/**
 * Renders an audio waveform from pre-computed peak data.
 * Draws min/max peaks as a filled waveform shape.
 */
export function AudioClipWaveform({
  peaks,
  width,
  height,
  className,
}: AudioClipWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, height);

    if (peaks.min.length === 0) return;

    const midY = height / 2;
    const amp = midY * 0.9; // Leave small margin

    ctx.fillStyle = WAVE_COLOR;
    ctx.beginPath();

    const step = peaks.min.length / width;

    // Draw top half (max peaks) left to right
    for (let x = 0; x < width; x++) {
      const i = Math.min(Math.floor(x * step), peaks.max.length - 1);
      const y = midY - peaks.max[i]! * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    // Draw bottom half (min peaks) right to left
    for (let x = width - 1; x >= 0; x--) {
      const i = Math.min(Math.floor(x * step), peaks.min.length - 1);
      const y = midY - peaks.min[i]! * amp;
      ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fill();
  }, [peaks, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width, height }}
    />
  );
}
