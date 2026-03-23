"use client";

import { useEffect, useState } from "react";
import { SynthEngine } from "@/audio/engine";
import { useSynthStore, type SynthState } from "@/stores/synth-store";

interface AudioEngineResult {
  engine: SynthEngine | null;
  error: string | null;
}

export function useAudioEngine(enabled: boolean): AudioEngineResult {
  const [engine, setEngine] = useState<SynthEngine | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize engine when enabled
  useEffect(() => {
    if (!enabled) return;

    const eng = new SynthEngine();
    eng.init().then(() => {
      setEngine(eng);

      // Send initial state
      const state = useSynthStore.getState();
      eng.setEnvelope(state.attack, state.decay, state.sustain, state.release);
      eng.setFilter(state.filterMode, state.filterCutoff, state.filterQ);
      eng.setVolume(state.volume);
      eng.setOscConfigs(state.oscConfigs);
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Unknown audio error";
      console.error("Failed to initialize audio engine:", message);
      setError(message);
    });

    return () => {
      eng.dispose();
      setEngine(null);
    };
  }, [enabled]);

  // Subscribe to synth store changes and forward to worklet
  useEffect(() => {
    if (!engine) return;

    let prev: SynthState = useSynthStore.getState();

    const unsub = useSynthStore.subscribe((state) => {
      // Envelope
      if (
        state.attack !== prev.attack ||
        state.decay !== prev.decay ||
        state.sustain !== prev.sustain ||
        state.release !== prev.release
      ) {
        engine.setEnvelope(state.attack, state.decay, state.sustain, state.release);
      }

      // Filter
      if (
        state.filterMode !== prev.filterMode ||
        state.filterCutoff !== prev.filterCutoff ||
        state.filterQ !== prev.filterQ
      ) {
        engine.setFilter(state.filterMode, state.filterCutoff, state.filterQ);
      }

      // Volume
      if (state.volume !== prev.volume) {
        engine.setVolume(state.volume);
      }

      // Osc configs
      if (state.oscConfigs !== prev.oscConfigs) {
        engine.setOscConfigs(state.oscConfigs);
      }

      prev = state;
    });

    return () => unsub();
  }, [engine]);

  return { engine, error };
}
