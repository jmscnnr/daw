"use client";

import { memo, useCallback } from "react";

interface VerticalSliderProps {
  label: string;
  ariaLabel: string;
  value: number;
  onChange: (value: number) => void;
}

function VerticalSlider({ label, ariaLabel, value, onChange }: VerticalSliderProps) {
  return (
    <div className="flex flex-col items-center gap-0.5 flex-1">
      <span className="text-[10px] text-synth-muted font-medium">{label}</span>
      <div className="relative flex-1 min-h-0 w-[14px] flex justify-center">
        {/* Visible groove */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[4px] rounded-full bg-synth-surface border border-synth-border" />
        <input
          type="range"
          className="vertical absolute inset-0 w-full h-full z-10"
          min={0}
          max={1000}
          step={1}
          value={Math.round(value * 1000)}
          aria-label={ariaLabel}
          aria-valuetext={value.toFixed(2)}
          onChange={(e) => onChange(Number(e.target.value) / 1000)}
        />
      </div>
      <span className="text-[9px] text-synth-muted tabular-nums">{value.toFixed(2)}</span>
    </div>
  );
}

interface EnvelopePanelProps {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  onChange: (
    params: Partial<{
      attack: number;
      decay: number;
      sustain: number;
      release: number;
    }>,
  ) => void;
}

export const EnvelopePanel = memo(function EnvelopePanel({
  attack,
  decay,
  sustain,
  release,
  onChange,
}: EnvelopePanelProps) {
  const onAttack = useCallback((v: number) => onChange({ attack: v }), [onChange]);
  const onDecay = useCallback((v: number) => onChange({ decay: v }), [onChange]);
  const onSustain = useCallback((v: number) => onChange({ sustain: v }), [onChange]);
  const onRelease = useCallback((v: number) => onChange({ release: v }), [onChange]);

  return (
    <div className="bg-synth-panel rounded-lg p-2 border border-synth-border flex flex-col min-w-0">
      <h3 className="text-[10px] text-synth-muted mb-1 uppercase tracking-wider">Envelope</h3>
      <div className="flex gap-1 flex-1 min-h-0">
        <VerticalSlider label="A" ariaLabel="Attack time" value={attack} onChange={onAttack} />
        <VerticalSlider label="D" ariaLabel="Decay time" value={decay} onChange={onDecay} />
        <VerticalSlider label="S" ariaLabel="Sustain level" value={sustain} onChange={onSustain} />
        <VerticalSlider label="R" ariaLabel="Release time" value={release} onChange={onRelease} />
      </div>
    </div>
  );
});
