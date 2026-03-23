"use client";

import { useEffect, useRef } from "react";
import { useAudioDisplayStore } from "@/stores/audio-display-store";

const BG_COLOR = "#1e1e2a";
const LINE_COLOR = "#5cabff";
const GRID_COLOR = "rgba(92, 171, 255, 0.08)";

interface WaveformCanvasProps {
  className?: string;
}

export function WaveformCanvas({ className }: WaveformCanvasProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, width, height);

      // Grid line at center
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();

      // Waveform
      if (waveformData.length > 0) {
        ctx.strokeStyle = LINE_COLOR;
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
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = width * devicePixelRatio;
        canvas.height = height * devicePixelRatio;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.scale(devicePixelRatio, devicePixelRatio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
    });
    observer.observe(canvas.parentElement!);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={className ?? "relative h-20 w-full rounded-lg overflow-hidden border border-synth-border"}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        role="img"
        aria-label="Audio waveform visualization"
      />
    </div>
  );
}
