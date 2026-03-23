"use client";

import { memo, useCallback } from "react";
import { useSynthStore } from "@/stores/synth-store";

export const VolumePanel = memo(function VolumePanel() {
  const volume = useSynthStore((s) => s.volume);
  const setVolume = useSynthStore((s) => s.setVolume);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(Number(e.target.value) / 100);
    },
    [setVolume],
  );

  return (
    <div className="bg-synth-panel rounded-lg p-2 border border-synth-border flex flex-col min-w-0">
      <h3 className="text-[10px] text-synth-muted mb-1 uppercase tracking-wider">Volume</h3>
      <div className="flex flex-col items-center gap-0.5 flex-1 min-h-0">
        <div className="relative flex-1 min-h-0 w-[14px] flex justify-center">
          {/* Visible groove */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[4px] rounded-full bg-synth-surface border border-synth-border" />
          <input
            type="range"
            className="vertical absolute inset-0 w-full h-full z-10"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            onChange={onChange}
            aria-label="Master volume"
            aria-valuetext={`${Math.round(volume * 100)}%`}
          />
        </div>
        <span className="text-[9px] text-synth-muted tabular-nums">{volume.toFixed(2)}</span>
      </div>
    </div>
  );
});
