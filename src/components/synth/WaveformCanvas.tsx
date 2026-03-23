"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { PluginInstance } from "@/types/plugin";

const BG_COLOR = "#1e1e2a";
const LINE_COLOR = "#5cabff";
const GRID_COLOR = "rgba(92, 171, 255, 0.08)";
const EMPTY_WAVEFORM = new Float32Array(0);
const NOOP_UNSUB = () => () => {};

interface WaveformCanvasProps {
  className?: string;
  plugin?: PluginInstance | null;
}

export function WaveformCanvas({
  className,
  plugin = null,
}: WaveformCanvasProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformData = useSyncExternalStore(
    plugin?.subscribeToAudioDisplay?.bind(plugin) ?? NOOP_UNSUB,
    () => plugin?.getAudioDisplayState?.().waveformData ?? EMPTY_WAVEFORM,
    () => EMPTY_WAVEFORM,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const midY = height / 2;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    if (waveformData.length > 0 && width > 0) {
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const step = waveformData.length / width;
      for (let x = 0; x < width; x++) {
        const i = Math.floor(x * step);
        const sample = waveformData[i] ?? 0;
        const y = midY - sample * midY;
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }, [waveformData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas?.parentElement) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
    });
    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={
        className ??
        "relative h-20 w-full rounded-lg overflow-hidden border border-synth-border"
      }
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Audio waveform visualization"
      />
    </div>
  );
}
