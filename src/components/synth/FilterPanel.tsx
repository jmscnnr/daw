"use client";

import { memo, useCallback } from "react";

function sliderToFreq(v: number): number {
  return 20.0 * Math.pow(10.0, (3.0 * v) / 1000.0);
}

function freqToSlider(freq: number): number {
  return (Math.log10(freq / 20.0) / 3.0) * 1000.0;
}

function formatCutoff(freq: number): string {
  if (freq >= 1000) return `${(freq / 1000).toFixed(1)} kHz`;
  return `${Math.round(freq)} Hz`;
}

const FILTER_TYPES = [
  { value: "off" as const, label: "Off" },
  { value: "lp" as const, label: "Low Pass" },
  { value: "hp" as const, label: "High Pass" },
  { value: "bp" as const, label: "Band Pass" },
];

interface FilterPanelProps {
  filterMode: "off" | "lp" | "hp" | "bp";
  filterCutoff: number;
  filterQ: number;
  onChange: (
    params: Partial<{
      filterMode: "off" | "lp" | "hp" | "bp";
      filterCutoff: number;
      filterQ: number;
    }>,
  ) => void;
}

export const FilterPanel = memo(function FilterPanel({
  filterMode,
  filterCutoff,
  filterQ,
  onChange,
}: FilterPanelProps) {

  const onModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ filterMode: e.target.value as "off" | "lp" | "hp" | "bp" });
    },
    [onChange],
  );

  const onCutoffChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ filterCutoff: sliderToFreq(Number(e.target.value)) });
    },
    [onChange],
  );

  const onQChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ filterQ: Number(e.target.value) / 100 });
    },
    [onChange],
  );

  return (
    <div className="bg-synth-panel rounded-lg p-2 border border-synth-border flex flex-col min-w-0">
      <h3 className="text-[10px] text-synth-muted mb-1 uppercase tracking-wider">Filter</h3>
      <div className="flex flex-col gap-1.5 justify-center flex-1">
        <div className="flex items-center gap-2">
          <label className="text-xs text-synth-muted w-12">Type</label>
          <select
            value={filterMode}
            onChange={onModeChange}
            aria-label="Filter type"
            className="flex-1 bg-synth-surface text-synth-text text-xs rounded px-2 py-1 border border-synth-border outline-none focus:border-synth-accent"
          >
            {FILTER_TYPES.map((ft) => (
              <option key={ft.value} value={ft.value}>
                {ft.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-synth-muted w-12">Cutoff</label>
          <div className="relative flex-1 h-[14px] flex items-center">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[4px] rounded-full bg-synth-surface border border-synth-border" />
            <input
              type="range"
              className="track-slider relative w-full h-full z-10"
              min={0}
              max={1000}
              step={1}
              value={Math.round(freqToSlider(filterCutoff))}
              onChange={onCutoffChange}
              aria-label="Filter cutoff frequency"
              aria-valuetext={formatCutoff(filterCutoff)}
            />
          </div>
          <span className="text-[10px] text-synth-muted tabular-nums w-14 text-right">
            {formatCutoff(filterCutoff)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-synth-muted w-12">Q</label>
          <div className="relative flex-1 h-[14px] flex items-center">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[4px] rounded-full bg-synth-surface border border-synth-border" />
            <input
              type="range"
              className="track-slider relative w-full h-full z-10"
              min={10}
              max={1000}
              step={1}
              value={Math.round(filterQ * 100)}
              onChange={onQChange}
              aria-label="Filter resonance"
              aria-valuetext={filterQ.toFixed(2)}
            />
          </div>
          <span className="text-[10px] text-synth-muted tabular-nums w-14 text-right">
            {filterQ.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
});
