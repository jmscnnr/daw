"use client";

import { useCallback, useState } from "react";
import { useAudioDisplayStore } from "@/stores/audio-display-store";
import { EnvelopePanel } from "./EnvelopePanel";
import { FilterPanel } from "./FilterPanel";
import { VolumePanel } from "./VolumePanel";
import { OscBankPanel } from "./OscBankPanel";
import { PianoKeyboard } from "./PianoKeyboard";
import { AudioInitOverlay } from "./AudioInitOverlay";
import { useAudioEngine } from "@/hooks/use-audio-engine";
import { useKeyboard } from "@/hooks/use-keyboard";

export function SynthLayout() {
  const [audioStarted, setAudioStarted] = useState(false);
  const { engine, error } = useAudioEngine(audioStarted);
  const activeNotes = useAudioDisplayStore((s) => s.activeNotes);

  const handleStart = useCallback(() => {
    setAudioStarted(true);
  }, []);

  const handleNoteOn = useCallback(
    (midi: number) => {
      engine?.noteOn(midi);
    },
    [engine],
  );

  const handleNoteOff = useCallback(
    (midi: number) => {
      engine?.noteOff(midi);
    },
    [engine],
  );

  useKeyboard(handleNoteOn, handleNoteOff);

  return (
    <div className="relative flex flex-col gap-3 p-4 h-screen max-w-5xl mx-auto w-full">
      {!audioStarted && <AudioInitOverlay onStart={handleStart} />}

      {error && (
        <div className="bg-red-900/50 border border-red-500 rounded-lg p-3 text-sm text-red-200">
          <strong>Audio Error:</strong> {error}
        </div>
      )}

      {/* Controls row */}
      <div className="flex gap-2">
        <EnvelopePanel />
        <FilterPanel />
        <VolumePanel />
        <OscBankPanel />
      </div>

      {/* Piano */}
      <div className="rounded-lg overflow-hidden border border-synth-border">
        <PianoKeyboard
          activeNotes={activeNotes}
          onNoteOn={handleNoteOn}
          onNoteOff={handleNoteOff}
        />
      </div>
    </div>
  );
}
