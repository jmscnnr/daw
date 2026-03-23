"use client";

import { memo, useCallback, useRef } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useUIStore } from "@/stores/ui-store";
import { useMeterStore } from "@/stores/meter-store";
import type { Track } from "@/types/project";

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

interface ChannelStripProps {
  track: Track;
  index: number;
}

export const ChannelStrip = memo(function ChannelStrip({
  track,
  index,
}: ChannelStripProps) {
  const setTrackVolume = useProjectStore((s) => s.setTrackVolume);
  const setTrackPan = useProjectStore((s) => s.setTrackPan);
  const toggleMute = useProjectStore((s) => s.toggleTrackMute);
  const toggleSolo = useProjectStore((s) => s.toggleTrackSolo);
  const selectedTrackId = useUIStore((s) => s.selectedTrackId);
  const setSelectedTrack = useUIStore((s) => s.setSelectedTrack);
  const peakDb = useMeterStore((s) => s.levels[track.id] ?? -Infinity);

  // Fader uses dB scale mapped to pixels for linear feel
  const faderRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const volDb = volumeToDb(track.volume);
  const volDbDisplay = volDb <= -60 ? "-∞" : volDb.toFixed(1);
  const faderPercent = dbToPercent(volDb);
  const meterPercent = dbToPercent(peakDb);

  const panDisplay =
    track.pan > 0.01
      ? `${Math.round(track.pan * 50)}R`
      : track.pan < -0.01
        ? `${Math.round(-track.pan * 50)}L`
        : "C";

  const panRef = useRef<HTMLDivElement>(null);
  const panDraggingRef = useRef(false);

  const setPanFromX = useCallback(
    (clientX: number) => {
      const el = panRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = (clientX - rect.left) / rect.width;
      const pan = Math.max(-1, Math.min(1, pct * 2 - 1));
      setTrackPan(track.id, Math.round(pan * 50) / 50);
    },
    [setTrackPan, track.id],
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

  // Custom fader drag — maps y position to dB
  const setVolumeFromY = useCallback(
    (clientY: number) => {
      const el = faderRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = 1 - (clientY - rect.top) / rect.height;
      const clampedPct = Math.max(0, Math.min(1, pct));
      const db = DB_MIN + clampedPct * (DB_MAX - DB_MIN);
      setTrackVolume(track.id, db <= DB_MIN ? 0 : dbToVolume(db));
    },
    [setTrackVolume, track.id],
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

  const isSelected = selectedTrackId === track.id;

  return (
    <div
      onClick={() => setSelectedTrack(track.id)}
      className={`flex w-[82px] shrink-0 flex-col border-r border-[#2a2a2a] cursor-pointer select-none ${
        isSelected ? "bg-[#2c2c30]" : "bg-[#202024]"
      }`}
    >
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
          onDoubleClick={() => setTrackPan(track.id, 0)}
        >
          {/* Center line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-[#555]" />
          {/* Fill from center */}
          <div
            className="absolute top-[1px] bottom-[1px] bg-[#888] rounded-full"
            style={{
              left: track.pan < 0 ? `${(1 + track.pan) * 50}%` : "50%",
              right: track.pan > 0 ? `${(1 - track.pan) * 50}%` : "50%",
              width: track.pan === 0 ? "1px" : undefined,
            }}
          />
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-[8px] h-[8px] bg-[#ccc] rounded-full shadow-sm pointer-events-none"
            style={{ left: `calc(${(track.pan + 1) / 2 * 100}% - 4px)` }}
          />
        </div>
        <span className="text-[8px] text-[#666] tabular-nums leading-none">{panDisplay}</span>
      </div>

      {/* Fader + Meter — fills remaining height */}
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

        {/* Fader track + thumb (custom div-based) */}
        <div
          ref={faderRef}
          className="relative w-[24px] shrink-0 cursor-ns-resize"
          onPointerDown={handleFaderPointerDown}
          onPointerMove={handleFaderPointerMove}
          onPointerUp={handleFaderPointerUp}
          onPointerCancel={handleFaderPointerUp}
          onDoubleClick={() => setTrackVolume(track.id, dbToVolume(0))}
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

        {/* Level meter */}
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

      {/* Solo / Mute */}
      <div className="flex border-t border-[#2a2a2a]">
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleSolo(track.id);
          }}
          className={`flex-1 h-[22px] text-[10px] font-bold transition-colors border-r border-[#2a2a2a] ${
            track.solo
              ? "bg-[#3b82f6] text-white"
              : "text-[#555] hover:text-[#999] hover:bg-[#282828]"
          }`}
        >
          S
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMute(track.id);
          }}
          className={`flex-1 h-[22px] text-[10px] font-bold transition-colors ${
            track.mute
              ? "bg-[#ca8a04] text-black"
              : "text-[#555] hover:text-[#999] hover:bg-[#282828]"
          }`}
        >
          M
        </button>
      </div>

      {/* Track number */}
      <div
        className="flex items-center justify-center h-[26px] text-[12px] font-bold text-black"
        style={{ backgroundColor: track.color }}
      >
        {index + 1}
      </div>
    </div>
  );
});
