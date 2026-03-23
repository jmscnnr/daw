"use client";

import { useEffect, useRef } from "react";
import { useAudioDisplayStore } from "@/stores/audio-display-store";

export function useWaveform(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  bgColor = "#1e1e2a",
  lineColor = "#5cabff",
): void {
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const { waveformData } = useAudioDisplayStore.getState();
      const { width, height } = canvas;
      const midY = height / 2;

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      if (waveformData.length > 0) {
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        const step = waveformData.length / width;
        for (let x = 0; x < width; x++) {
          const i = Math.floor(x * step);
          const sample = waveformData[i] ?? 0;
          const y = midY - sample * midY;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [canvasRef, bgColor, lineColor]);
}
