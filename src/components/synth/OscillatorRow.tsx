"use client";

import { memo, useCallback } from "react";
import type { OscConfig } from "@/audio/types";
import { SHAPES } from "@/lib/constants";
import { X } from "lucide-react";

interface OscillatorRowProps {
  index: number;
  config: OscConfig;
  canRemove: boolean;
  onChange: (index: number, partial: Partial<OscConfig>) => void;
  onRemove: (index: number) => void;
}

export const OscillatorRow = memo(function OscillatorRow({
  index,
  config,
  canRemove,
  onChange,
  onRemove,
}: OscillatorRowProps) {
  const onShapeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(index, { shape: e.target.value as OscConfig["shape"] });
    },
    [index, onChange],
  );

  const onOctaveChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(index, { octave: Number(e.target.value) });
    },
    [index, onChange],
  );

  const onFineChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(index, { fine: Number(e.target.value) });
    },
    [index, onChange],
  );

  const onLevelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(index, { level: Number(e.target.value) / 100 });
    },
    [index, onChange],
  );

  const handleRemove = useCallback(() => onRemove(index), [index, onRemove]);

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[10px] text-synth-muted w-5 text-right">#{index + 1}</span>

      <select
        value={config.shape}
        onChange={onShapeChange}
        aria-label={`Oscillator ${index + 1} waveform`}
        className="bg-synth-surface text-synth-text text-xs rounded px-1.5 py-0.5 border border-synth-border outline-none focus:border-synth-accent"
      >
        {SHAPES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <span className="text-[10px] text-synth-muted">Oct</span>
      <select
        value={config.octave}
        onChange={onOctaveChange}
        aria-label={`Oscillator ${index + 1} octave`}
        className="bg-synth-surface text-synth-text text-xs rounded px-1 py-0.5 border border-synth-border outline-none focus:border-synth-accent w-12"
      >
        {[-2, -1, 0, 1, 2].map((o) => (
          <option key={o} value={o}>
            {o > 0 ? `+${o}` : o}
          </option>
        ))}
      </select>

      <span className="text-[10px] text-synth-muted">Fine</span>
      <div className="relative w-16 h-[14px] flex items-center">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[4px] rounded-full bg-synth-surface border border-synth-border" />
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={config.fine}
          onChange={onFineChange}
          aria-label={`Oscillator ${index + 1} fine tune`}
          aria-valuetext={`${config.fine} cents`}
          className="track-slider relative w-full h-full z-10"
        />
      </div>
      <span className="text-[10px] text-synth-muted tabular-nums w-8">{config.fine}ct</span>

      <span className="text-[10px] text-synth-muted">Lvl</span>
      <div className="relative flex-1 h-[14px] flex items-center">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[4px] rounded-full bg-synth-surface border border-synth-border" />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(config.level * 100)}
          onChange={onLevelChange}
          aria-label={`Oscillator ${index + 1} level`}
          aria-valuetext={`${Math.round(config.level * 100)}%`}
          className="track-slider relative w-full h-full z-10"
        />
      </div>
      <span className="text-[10px] text-synth-muted tabular-nums w-8">
        {config.level.toFixed(2)}
      </span>

      <button
        type="button"
        onClick={handleRemove}
        disabled={!canRemove}
        aria-label={`Remove oscillator ${index + 1}`}
        className="text-synth-muted hover:text-synth-text disabled:opacity-30 disabled:cursor-not-allowed w-5 h-5 flex items-center justify-center"
      >
        <X size={12} />
      </button>
    </div>
  );
});
