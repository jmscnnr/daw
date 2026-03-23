"use client";

import { memo, useCallback, useState, useRef, useEffect } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useCommandHistory } from "@/stores/command-history";
import { useUIStore } from "@/stores/ui-store";
import { usePluginActions } from "@/hooks/use-plugin-actions";
import { useGestureSnapshot } from "@/hooks/use-gesture-snapshot";
import { useMeterStore } from "@/stores/meter-store";
import { getPluginsByType } from "@/audio/plugins/plugin-registry";
import type { Track } from "@/types/project";
import {
  DeleteTrackCommand,
  RenameTrackCommand,
  SetTrackPanCommand,
  SetTrackVolumeCommand,
  ToggleTrackArmCommand,
  ToggleTrackMuteCommand,
  ToggleTrackSoloCommand,
} from "@/commands/track-commands";
import { X, Trash2 } from "lucide-react";

const TRACK_HEIGHT = 76;

const VOL_DB_MIN = -60;
const VOL_DB_MAX = 6;

function volumeToDb(vol: number): number {
  if (vol <= 0) return VOL_DB_MIN;
  return 20 * Math.log10(vol);
}

function dbToVolume(db: number): number {
  return Math.pow(10, db / 20);
}

interface TrackHeaderProps {
  track: Track;
  index: number;
}

export const TrackHeader = memo(function TrackHeader({
  track,
  index,
}: TrackHeaderProps) {
  const setTrackVolume = useProjectStore((s) => s.setTrackVolume);
  const setTrackPan = useProjectStore((s) => s.setTrackPan);
  const executeCommand = useCommandHistory((s) => s.execute);
  const selectedTrackId = useUIStore((s) => s.selectedTrackId);
  const setSelectedTrack = useUIStore((s) => s.setSelectedTrack);
  const { assignPlugin, removeTrackPlugin } = usePluginActions();
  const peakDb = useMeterStore((s) => s.levels[track.id] ?? -Infinity);

  const [showPluginMenu, setShowPluginMenu] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const volumeChanged = useCallback((a: Track, b: Track) => a.volume !== b.volume, []);
  const panChanged = useCallback((a: Track, b: Track) => a.pan !== b.pan, []);
  const volumeGesture = useGestureSnapshot(track.id, "Set Track Volume", volumeChanged);
  const panGesture = useGestureSnapshot(track.id, "Set Track Pan", panChanged);

  const isSelected = selectedTrackId === track.id;

  const instrumentSlot = track.pluginChain.find(() => true);
  const instruments = getPluginsByType("instrument");

  useEffect(() => {
    if (!showPluginMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowPluginMenu(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [showPluginMenu]);

  const handleSelect = useCallback(() => {
    setSelectedTrack(track.id);
  }, [setSelectedTrack, track.id]);

  const handleMute = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      executeCommand(new ToggleTrackMuteCommand(track.id));
    },
    [executeCommand, track.id],
  );

  const handleSolo = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      executeCommand(new ToggleTrackSoloCommand(track.id));
    },
    [executeCommand, track.id],
  );

  const handleArm = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      executeCommand(new ToggleTrackArmCommand(track.id));
    },
    [executeCommand, track.id],
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      executeCommand(new DeleteTrackCommand(track.id));
    },
    [executeCommand, track.id],
  );

  const handlePluginClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setShowPluginMenu((v) => !v);
    },
    [],
  );

  const handleAssignPlugin = useCallback(
    (pluginId: string) => {
      assignPlugin(track.id, pluginId);
      setShowPluginMenu(false);
    },
    [assignPlugin, track.id],
  );

  const handleRemovePlugin = useCallback(() => {
    removeTrackPlugin(track.id);
    setShowPluginMenu(false);
  }, [removeTrackPlugin, track.id]);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      const db = parseFloat(e.target.value);
      setTrackVolume(track.id, db <= VOL_DB_MIN ? 0 : dbToVolume(db));
    },
    [setTrackVolume, track.id],
  );

  const handlePanChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      setTrackPan(track.id, parseFloat(e.target.value));
    },
    [setTrackPan, track.id],
  );

  const currentPluginName = instrumentSlot
    ? instruments.find((p) => p.id === instrumentSlot.pluginId)?.name ??
      instrumentSlot.pluginId
    : null;

  const DB_MIN = -60;
  const DB_MAX = 0;
  const clampedDb = Math.max(DB_MIN, Math.min(DB_MAX, peakDb));
  const meterPct = ((clampedDb - DB_MIN) / (DB_MAX - DB_MIN)) * 100;
  const meterColor =
    clampedDb > -6 ? "#ef4444" : clampedDb > -12 ? "#eab308" : "#22c55e";

  const volDb = volumeToDb(track.volume);
  const volLabel =
    volDb <= VOL_DB_MIN
      ? "-inf"
      : `${volDb >= 0 ? "+" : ""}${volDb.toFixed(1)}`;

  const panLabel =
    track.pan === 0
      ? "C"
      : track.pan < 0
        ? `${Math.round(Math.abs(track.pan) * 50)}L`
        : `${Math.round(track.pan * 50)}R`;

  return (
    <div
      onClick={handleSelect}
      className="relative cursor-pointer transition-colors"
      style={{
        height: TRACK_HEIGHT,
        background: isSelected
          ? `linear-gradient(90deg, ${track.color}12 0%, var(--synth-surface) 40%)`
          : undefined,
      }}
    >
      {/* Color stripe — left edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{
          backgroundColor: track.color,
          boxShadow: isSelected ? `0 0 8px ${track.color}60` : undefined,
        }}
      />

      {/* Content area */}
      <div className="flex flex-col justify-center h-full pl-[11px] pr-2 gap-[5px]">
        {/* Row 1: Index + Name + Buttons */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-synth-muted w-4 shrink-0 text-right tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
          {editingName ? (
            <input
              autoFocus
              defaultValue={track.name}
              className="text-[11px] font-medium text-synth-text flex-1 min-w-0 bg-synth-bg border border-synth-border rounded px-1 outline-none focus:border-synth-accent"
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== track.name) {
                  executeCommand(new RenameTrackCommand(track.id, v));
                }
                setEditingName(false);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  (e.target as HTMLInputElement).value = track.name;
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          ) : (
            <span
              className="truncate text-[11px] font-medium text-synth-text flex-1 min-w-0 cursor-pointer"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingName(true);
              }}
              title="Double-click to rename"
            >
              {track.name}
            </span>
          )}

          {/* M / S / Arm / Delete */}
          <div className="flex items-center gap-[3px] shrink-0">
            <button
              onClick={handleMute}
              className={`h-[18px] w-[18px] rounded-sm text-[9px] font-bold transition-colors ${
                track.mute
                  ? "bg-amber-400/90 text-neutral-900"
                  : "bg-synth-panel text-synth-muted hover:text-synth-text"
              }`}
              title="Mute"
            >
              M
            </button>
            <button
              onClick={handleSolo}
              className={`h-[18px] w-[18px] rounded-sm text-[9px] font-bold transition-colors ${
                track.solo
                  ? "bg-sky-400/90 text-neutral-900"
                  : "bg-synth-panel text-synth-muted hover:text-synth-text"
              }`}
              title="Solo"
            >
              S
            </button>
            <button
              onClick={handleArm}
              className={`h-[18px] w-[18px] rounded-full text-[9px] transition-colors flex items-center justify-center ${
                track.armed
                  ? "bg-red-500/90 text-white"
                  : "bg-synth-panel text-synth-muted hover:text-synth-text"
              }`}
              title="Record Arm"
            >
              <span
                className={`block w-[8px] h-[8px] rounded-full ${
                  track.armed ? "bg-white" : "border border-current"
                }`}
              />
            </button>
            <button
              onClick={handleRemove}
              className="h-[18px] w-[18px] rounded-sm bg-synth-panel text-synth-muted transition-colors hover:bg-red-900/50 hover:text-red-300 flex items-center justify-center"
              title="Delete Track"
            >
              <X size={10} />
            </button>
          </div>
        </div>

        {/* Row 2: Plugin + Volume + Pan */}
        <div className="flex items-center gap-1.5">
          {/* Plugin selector */}
          <div className="relative min-w-0 w-[60px] shrink-0" ref={menuRef}>
            <button
              onClick={handlePluginClick}
              className={`block truncate text-[9px] rounded px-1 max-w-full transition-colors ${
                currentPluginName
                  ? "text-synth-accent hover:text-synth-text"
                  : "text-synth-muted/60 italic hover:text-synth-text"
              }`}
              title="Select instrument"
            >
              {currentPluginName ?? "---"}
            </button>

            {showPluginMenu && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded border border-synth-border bg-synth-panel shadow-lg">
                {instruments.map((plugin) => (
                  <button
                    key={plugin.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAssignPlugin(plugin.id);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-synth-surface ${
                      instrumentSlot?.pluginId === plugin.id
                        ? "text-synth-accent"
                        : "text-synth-text"
                    }`}
                  >
                    {plugin.name}
                  </button>
                ))}

                {instrumentSlot && (
                  <>
                    <div className="mx-2 border-t border-synth-border" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemovePlugin();
                      }}
                      className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left text-[11px] text-red-400 transition-colors hover:bg-synth-surface"
                    >
                      <Trash2 size={10} />
                      Remove
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Volume slider */}
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <div className="relative flex-1 min-w-0 h-[14px] flex items-center">
              {/* Visible groove */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[6px] rounded-[3px] border border-synth-border bg-synth-surface" />
              {/* Filled portion */}
              <div
                className="absolute top-1/2 -translate-y-1/2 left-0 h-[4px] rounded-[2px] ml-px"
                style={{
                  width: `${((Math.max(VOL_DB_MIN, volDb) - VOL_DB_MIN) / (VOL_DB_MAX - VOL_DB_MIN)) * 100}%`,
                  background: "oklch(0.50 0.12 250)",
                }}
              />
              <input
                type="range"
                min={VOL_DB_MIN}
                max={VOL_DB_MAX}
                step={0.5}
                value={Math.max(VOL_DB_MIN, volDb)}
                onChange={handleVolumeChange}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={volumeGesture.begin}
              onPointerUp={volumeGesture.commit}
              onBlur={volumeGesture.commit}
              onFocus={volumeGesture.begin}
              onDoubleClick={(e) => {
                e.stopPropagation();
                executeCommand(new SetTrackVolumeCommand(track.id, dbToVolume(0)));
              }}
                className="track-slider relative w-full h-full z-10"
                title={`Volume: ${volLabel} dB`}
              />
            </div>
            <span className="text-[8px] text-synth-muted w-[28px] text-right tabular-nums shrink-0">
              {volLabel}
            </span>
          </div>

          {/* Pan control */}
          <div className="flex items-center gap-0.5 shrink-0">
            <div className="relative w-[30px] h-[14px] flex items-center">
              {/* Visible groove */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[6px] rounded-[3px] border border-synth-border bg-synth-surface" />
              {/* Center notch */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-[8px] bg-synth-muted/50" />
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={track.pan}
                onChange={handlePanChange}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={panGesture.begin}
              onPointerUp={panGesture.commit}
              onBlur={panGesture.commit}
              onFocus={panGesture.begin}
              onDoubleClick={(e) => {
                e.stopPropagation();
                executeCommand(new SetTrackPanCommand(track.id, 0));
              }}
                className="track-slider relative w-full h-full z-10"
                title={`Pan: ${panLabel}`}
              />
            </div>
            <span className="text-[8px] text-synth-muted w-[16px] text-center tabular-nums shrink-0">
              {panLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Horizontal level meter — bottom edge */}
      <div className="absolute bottom-0 left-[3px] right-0 h-[2px] bg-neutral-800/40">
        <div
          className="absolute left-0 top-0 h-full transition-[width] duration-75"
          style={{ width: `${meterPct}%`, backgroundColor: meterColor }}
        />
      </div>

      {/* Bottom border */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-synth-border" />
    </div>
  );
});

export { TRACK_HEIGHT };
