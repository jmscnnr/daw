"use client";

import { memo } from "react";
import { useAudioDisplayStore } from "@/stores/audio-display-store";

const DB_MIN = -60;
const DB_MAX = 0;
const TICK_MARKS = [0, -6, -12, -24, -48];

export const MeterPanel = memo(function MeterPanel() {
  const db = useAudioDisplayStore((s) => s.levelDb);

  const clamped = Math.max(DB_MIN, Math.min(DB_MAX, db));
  const pct = ((clamped - DB_MIN) / (DB_MAX - DB_MIN)) * 100;

  // Color: green < -12, yellow -12..-6, red > -6
  let barColor = "bg-green-500";
  if (clamped > -6) barColor = "bg-red-500";
  else if (clamped > -12) barColor = "bg-yellow-500";

  const display = db === -Infinity ? "--" : `${Math.round(db)}`;

  return (
    <div className="bg-synth-panel rounded-lg p-3 border border-synth-border">
      <h3 className="text-xs text-synth-muted mb-2 uppercase tracking-wider">
        Level
      </h3>
      <div className="flex items-end gap-1.5">
        {/* Tick labels */}
        <div className="flex flex-col justify-between h-28 text-[9px] text-synth-muted tabular-nums leading-none py-0.5">
          {TICK_MARKS.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        {/* Meter bar */}
        <div className="relative w-4 h-28 rounded-sm bg-neutral-800 overflow-hidden">
          <div
            className={`absolute bottom-0 left-0 right-0 rounded-sm transition-[height] duration-75 ${barColor}`}
            style={{ height: `${pct}%` }}
          />
        </div>
      </div>
      <p className="text-center text-[10px] text-synth-muted tabular-nums mt-1 w-10">
        {display} dB
      </p>
    </div>
  );
});
