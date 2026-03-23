"use client";

import { useCallback, useRef } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useMeterStore } from "@/stores/meter-store";

const DB_MIN = -60;
const DB_MAX = 6;
const DB_TICKS = [6, 0, -6, -12, -18, -24, -36, -48, -60];

function dbToPercent(db: number): number {
  const clamped = Math.max(DB_MIN, Math.min(DB_MAX, db));
  return ((clamped - DB_MIN) / (DB_MAX - DB_MIN)) * 100;
}

function volumeToDb(vol: number): number {
  if (vol <= 0) return -Infinity;
  return 20 * Math.log10(vol);
}

function dbToVolume(db: number): number {
  return Math.pow(10, db / 20);
}

export function MasterStrip() {
  const masterVolume = useProjectStore((s) => s.project.masterVolume);
  const masterPan = useProjectStore((s) => s.project.masterPan);
  const setMasterVolume = useProjectStore((s) => s.setMasterVolume);
  const setMasterPan = useProjectStore((s) => s.setMasterPan);
  const peakDb = useMeterStore((s) => s.masterLevel);

  const faderRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const panRef = useRef<HTMLDivElement>(null);
  const panDraggingRef = useRef(false);

  const volDb = volumeToDb(masterVolume);
  const volDbDisplay = volDb <= -60 ? "-∞" : volDb.toFixed(1);
  const faderPercent = dbToPercent(volDb);
  const meterPercent = dbToPercent(peakDb);

  const panDisplay =
    masterPan > 0.01
      ? `${Math.round(masterPan * 50)}R`
      : masterPan < -0.01
        ? `${Math.round(-masterPan * 50)}L`
        : "C";

  const setPanFromX = useCallback(
    (clientX: number) => {
      const el = panRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = (clientX - rect.left) / rect.width;
      const pan = Math.max(-1, Math.min(1, pct * 2 - 1));
      setMasterPan(Math.round(pan * 50) / 50);
    },
    [setMasterPan],
  );

  const handlePanPointerDown = useCallback(
    (e: React.PointerEvent) => {
      panDraggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setPanFromX(e.clientX);
    },
    [setPanFromX],
  );

  const handlePanPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!panDraggingRef.current) return;
      setPanFromX(e.clientX);
    },
    [setPanFromX],
  );

  const handlePanPointerUp = useCallback(() => {
    panDraggingRef.current = false;
  }, []);

  const setVolumeFromY = useCallback(
    (clientY: number) => {
      const el = faderRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = 1 - (clientY - rect.top) / rect.height;
      const clampedPct = Math.max(0, Math.min(1, pct));
      const db = DB_MIN + clampedPct * (DB_MAX - DB_MIN);
      setMasterVolume(db <= DB_MIN ? 0 : dbToVolume(db));
    },
    [setMasterVolume],
  );

  const handleFaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      draggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setVolumeFromY(e.clientY);
    },
    [setVolumeFromY],
  );

  const handleFaderPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      setVolumeFromY(e.clientY);
    },
    [setVolumeFromY],
  );

  const handleFaderPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  return (
    <div className="flex w-[82px] h-full flex-col bg-[#202024]">
      {/* dB readout */}
      <div className="flex items-center justify-center h-[26px] border-b border-[#2a2a2a]">
        <span className="text-[11px] tabular-nums text-[#ccc] font-medium">
          {volDbDisplay} <span className="text-[#666] text-[9px]">dB</span>
        </span>
      </div>

      {/* Pan */}
      <div className="flex flex-col items-center justify-center border-b border-[#2a2a2a] h-[30px] px-[10px] gap-[2px]">
        <div
          ref={panRef}
          className="relative w-full h-[6px] bg-[#333] rounded-full cursor-ew-resize overflow-visible"
          onPointerDown={handlePanPointerDown}
          onPointerMove={handlePanPointerMove}
          onPointerUp={handlePanPointerUp}
          onPointerCancel={handlePanPointerUp}
          onDoubleClick={() => setMasterPan(0)}
        >
          {/* Center line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-[#555]" />
          {/* Fill from center */}
          <div
            className="absolute top-[1px] bottom-[1px] bg-[#888] rounded-full"
            style={{
              left: masterPan < 0 ? `${(1 + masterPan) * 50}%` : "50%",
              right: masterPan > 0 ? `${(1 - masterPan) * 50}%` : "50%",
              width: masterPan === 0 ? "1px" : undefined,
            }}
          />
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-[8px] h-[8px] bg-[#ccc] rounded-full shadow-sm pointer-events-none"
            style={{ left: `calc(${(masterPan + 1) / 2 * 100}% - 4px)` }}
          />
        </div>
        <span className="text-[8px] text-[#666] tabular-nums leading-none">{panDisplay}</span>
      </div>

      {/* Fader + Meter */}
      <div className="flex-1 flex gap-[3px] px-[8px] py-[8px] min-h-0">
        {/* dB scale labels */}
        <div className="relative w-[20px] shrink-0">
          {DB_TICKS.map((db) => (
            <span
              key={db}
              className="absolute right-0 text-[8px] tabular-nums text-[#505050] leading-none"
              style={{
                bottom: `${dbToPercent(db)}%`,
                transform: "translateY(50%)",
              }}
            >
              {db > 0 ? `+${db}` : db}
            </span>
          ))}
        </div>

        {/* Fader */}
        <div
          ref={faderRef}
          className="relative w-[24px] shrink-0 cursor-ns-resize"
          onPointerDown={handleFaderPointerDown}
          onPointerMove={handleFaderPointerMove}
          onPointerUp={handleFaderPointerUp}
          onPointerCancel={handleFaderPointerUp}
          onDoubleClick={() => setMasterVolume(dbToVolume(0))}
        >
          {/* Fader groove */}
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[3px] bg-[#3a3a3a] rounded-sm" />

          {/* Tick marks on groove */}
          {DB_TICKS.map((db) => (
            <div
              key={db}
              className="absolute left-[4px] right-[4px] h-[1px] bg-[#3a3a3a]"
              style={{ bottom: `${dbToPercent(db)}%` }}
            />
          ))}

          {/* 0dB mark highlighted */}
          <div
            className="absolute left-[2px] right-[2px] h-[1px] bg-[#666]"
            style={{ bottom: `${dbToPercent(0)}%` }}
          />

          {/* Fader thumb */}
          <div
            className="absolute left-0 right-0 h-[12px] rounded-[2px] pointer-events-none"
            style={{
              bottom: `calc(${faderPercent}% - 6px)`,
              background: "linear-gradient(to bottom, #e0e0e0, #a0a0a0 45%, #888 100%)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.3)",
              border: "1px solid #666",
            }}
          >
            {/* Center groove on thumb */}
            <div className="absolute left-[4px] right-[4px] top-1/2 -translate-y-1/2 h-[1px] bg-[#666]" />
          </div>
        </div>

        {/* Meter */}
        <div className="relative flex-1 min-w-[10px] rounded-[1px] bg-[#0c0c0c] overflow-hidden">
          <div
            className="absolute bottom-0 w-full transition-[height] duration-[50ms]"
            style={{
              height: `${meterPercent}%`,
              background: "linear-gradient(to top, #1db954 0%, #1db954 55%, #b3d634 72%, #e8c820 85%, #e84040 100%)",
            }}
          />
          {/* 0dB marker */}
          <div
            className="absolute w-full h-[1px] bg-[#e84040]/50"
            style={{ bottom: `${dbToPercent(0)}%` }}
          />
          {/* Segment lines */}
          {[-12, -24, -36, -48].map((db) => (
            <div
              key={db}
              className="absolute w-full h-[1px] bg-[#000]/40"
              style={{ bottom: `${dbToPercent(db)}%` }}
            />
          ))}
        </div>
      </div>

      {/* Bottom placeholder (matching S/M button height) */}
      <div className="flex items-center justify-center border-t border-[#2a2a2a] h-[22px]" />

      {/* Label */}
      <div className="flex items-center justify-center h-[26px] text-[12px] font-bold bg-[#555] text-black">
        MST
      </div>
    </div>
  );
}
