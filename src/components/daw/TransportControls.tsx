"use client";

import { useCallback, useState } from "react";
import { useTransportStore } from "@/stores/transport-store";
import { useProjectStore } from "@/stores/project-store";
import { useCommandHistory } from "@/stores/command-history";
import { SetBPMCommand } from "@/commands/track-commands";
import { ticksToBarBeat } from "@/lib/time";
import { Play, Pause, Square, Repeat, Circle } from "lucide-react";

export function TransportControls() {
  const transportState = useTransportStore((s) => s.state);
  const positionTicks = useTransportStore((s) => s.positionTicks);
  const recording = useTransportStore((s) => s.recording);
  const loopEnabled = useTransportStore((s) => s.loopEnabled);
  const play = useTransportStore((s) => s.play);
  const stop = useTransportStore((s) => s.stop);
  const pause = useTransportStore((s) => s.pause);
  const toggleLoop = useTransportStore((s) => s.toggleLoop);
  const toggleRecording = useTransportStore((s) => s.toggleRecording);

  const bpm = useProjectStore((s) => s.project.bpm);
  const timeSignature = useProjectStore((s) => s.project.timeSignature);
  const executeCommand = useCommandHistory((s) => s.execute);

  const { bar, beat } = ticksToBarBeat(positionTicks, timeSignature.numerator);

  const handlePlayPause = useCallback(() => {
    if (transportState === "playing") {
      pause();
    } else {
      play();
    }
  }, [transportState, play, pause]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const [bpmInput, setBpmInput] = useState(String(bpm));
  const [bpmFocused, setBpmFocused] = useState(false);
  const displayedBpmInput = bpmFocused ? bpmInput : String(bpm);

  const commitBpm = useCallback(
    (raw: string) => {
      const value = parseInt(raw, 10);
      if (!isNaN(value) && value >= 20 && value <= 300) {
        if (value !== bpm) {
          executeCommand(new SetBPMCommand(value));
        }
        setBpmInput(String(value));
      } else {
        setBpmInput(String(bpm));
      }
    },
    [executeCommand, bpm],
  );

  const handleBPMChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setBpmInput(e.target.value);
    },
    [],
  );

  return (
    <div className="flex items-center gap-3">
      {/* Play/Pause */}
      <button
        onClick={handlePlayPause}
        className="flex h-8 w-8 items-center justify-center rounded border border-synth-border bg-synth-surface text-sm transition-colors hover:bg-synth-panel"
        title={transportState === "playing" ? "Pause" : "Play"}
      >
        {transportState === "playing" ? <Pause size={14} /> : <Play size={14} />}
      </button>

      {/* Stop */}
      <button
        onClick={handleStop}
        className="flex h-8 w-8 items-center justify-center rounded border border-synth-border bg-synth-surface text-sm transition-colors hover:bg-synth-panel"
        title="Stop"
      >
        <Square size={14} />
      </button>

      {/* Record */}
      <button
        onClick={toggleRecording}
        className={`flex h-8 w-8 items-center justify-center rounded border text-sm transition-colors ${
          recording
            ? "border-red-500 bg-red-500/20 text-red-400"
            : "border-synth-border bg-synth-surface text-synth-muted hover:bg-synth-panel"
        }`}
        title={recording ? "Stop Recording" : "Record"}
      >
        <Circle size={14} fill={recording ? "currentColor" : "none"} />
      </button>

      {/* Position display */}
      <div className="min-w-[96px] rounded border border-synth-border bg-synth-bg px-3 py-1 text-center text-sm tabular-nums">
        {bar}.{beat}
      </div>

      {/* BPM */}
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="numeric"
          value={displayedBpmInput}
          onChange={handleBPMChange}
          onFocus={() => setBpmFocused(true)}
          onBlur={(e) => {
            setBpmFocused(false);
            commitBpm(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitBpm((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="w-[3.5rem] rounded border border-synth-border bg-synth-bg px-2 py-1 text-center text-sm text-synth-text"
        />
        <span className="text-xs text-synth-muted">BPM</span>
      </div>

      {/* Loop toggle */}
      <button
        onClick={toggleLoop}
        className={`flex h-8 items-center rounded border px-2 text-xs transition-colors ${
          loopEnabled
            ? "border-synth-accent bg-synth-accent/20 text-synth-accent"
            : "border-synth-border bg-synth-surface text-synth-muted hover:bg-synth-panel"
        }`}
        title="Toggle Loop"
      >
        <Repeat size={12} className="mr-1" />
        LOOP
      </button>
    </div>
  );
}
