"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAudioDisplayStore } from "@/stores/audio-display-store";
import { useSynthStore, type SynthState } from "@/stores/synth-store";
import { EnvelopePanel } from "./EnvelopePanel";
import { FilterPanel } from "./FilterPanel";
import { VolumePanel } from "./VolumePanel";
import { OscBankPanel } from "./OscBankPanel";
import { PianoKeyboard } from "./PianoKeyboard";
import type { PluginInstance } from "@/types/plugin";
import type { SynthPluginInstance } from "@/audio/plugins/builtin/synth-plugin";

interface SynthPluginUIProps {
  instance: PluginInstance;
}

export function SynthPluginUI({ instance }: SynthPluginUIProps) {
  const activeNotes = useAudioDisplayStore((s) => s.activeNotes);
  const prevInstanceRef = useRef<SynthPluginInstance | null>(null);

  const synthInstance = instance as unknown as SynthPluginInstance;
  const engine = synthInstance.getEngine();

  // When switching to a different instance, save old instance's state and load new one
  useEffect(() => {
    const prev = prevInstanceRef.current;
    if (prev && prev !== synthInstance) {
      // Save outgoing instance's state from the store
      prev.saveFromStore();
    }
    // Load incoming instance's state into the store
    synthInstance.loadIntoStore();
    prevInstanceRef.current = synthInstance;

    // On unmount, save the current instance's state
    return () => {
      synthInstance.saveFromStore();
    };
  }, [synthInstance]);

  // Subscribe synth store → engine
  useEffect(() => {
    if (!engine) return;

    let prev: SynthState = useSynthStore.getState();

    const unsub = useSynthStore.subscribe((state) => {
      if (
        state.attack !== prev.attack ||
        state.decay !== prev.decay ||
        state.sustain !== prev.sustain ||
        state.release !== prev.release
      ) {
        engine.setEnvelope(
          state.attack,
          state.decay,
          state.sustain,
          state.release,
        );
      }

      if (
        state.filterMode !== prev.filterMode ||
        state.filterCutoff !== prev.filterCutoff ||
        state.filterQ !== prev.filterQ
      ) {
        engine.setFilter(state.filterMode, state.filterCutoff, state.filterQ);
      }

      if (state.volume !== prev.volume) {
        engine.setVolume(state.volume);
      }

      if (state.oscConfigs !== prev.oscConfigs) {
        engine.setOscConfigs(state.oscConfigs);
      }

      // Keep per-instance params in sync
      synthInstance.saveFromStore();

      prev = state;
    });

    return unsub;
  }, [engine, synthInstance]);

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

  return (
    <div className="flex gap-2 p-2 h-full">
      <EnvelopePanel />
      <FilterPanel />
      <VolumePanel />
      <OscBankPanel />
      <div className="flex-1 min-w-0 rounded-lg overflow-hidden border border-synth-border">
        <PianoKeyboard
          activeNotes={activeNotes}
          onNoteOn={handleNoteOn}
          onNoteOff={handleNoteOff}
        />
      </div>
    </div>
  );
}
