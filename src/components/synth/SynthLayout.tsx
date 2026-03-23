"use client";

import { useCallback, useState } from "react";
import { useAudioDisplayStore } from "@/stores/audio-display-store";
import { useSynthStore } from "@/stores/synth-store";
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
  const attack = useSynthStore((s) => s.attack);
  const decay = useSynthStore((s) => s.decay);
  const sustain = useSynthStore((s) => s.sustain);
  const release = useSynthStore((s) => s.release);
  const filterMode = useSynthStore((s) => s.filterMode);
  const filterCutoff = useSynthStore((s) => s.filterCutoff);
  const filterQ = useSynthStore((s) => s.filterQ);
  const volume = useSynthStore((s) => s.volume);
  const oscConfigs = useSynthStore((s) => s.oscConfigs);
  const setEnvelope = useSynthStore((s) => s.setEnvelope);
  const setFilter = useSynthStore((s) => s.setFilter);
  const setVolume = useSynthStore((s) => s.setVolume);
  const updateOscConfig = useSynthStore((s) => s.updateOscConfig);
  const addOsc = useSynthStore((s) => s.addOsc);
  const removeOsc = useSynthStore((s) => s.removeOsc);

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
        <EnvelopePanel
          attack={attack}
          decay={decay}
          sustain={sustain}
          release={release}
          onChange={setEnvelope}
        />
        <FilterPanel
          filterMode={filterMode}
          filterCutoff={filterCutoff}
          filterQ={filterQ}
          onChange={setFilter}
        />
        <VolumePanel volume={volume} onChange={setVolume} />
        <OscBankPanel
          oscConfigs={oscConfigs}
          onChange={updateOscConfig}
          onAdd={addOsc}
          onRemove={removeOsc}
        />
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
