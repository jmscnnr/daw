"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { EnvelopePanel } from "./EnvelopePanel";
import { FilterPanel } from "./FilterPanel";
import { VolumePanel } from "./VolumePanel";
import { OscBankPanel } from "./OscBankPanel";
import { PianoKeyboard } from "@/components/midi/PianoKeyboard";
import { usePluginActions } from "@/hooks/use-plugin-actions";
import type { PluginInstance } from "@/types/plugin";
import type {
  SynthPluginInstance,
  SynthPluginParams,
} from "@/audio/plugins/builtin/synth-plugin";

interface SynthPluginUIProps {
  instance: PluginInstance;
}

function cloneParams(params: SynthPluginParams): SynthPluginParams {
  return {
    ...params,
    oscConfigs: params.oscConfigs.map((config) => ({ ...config })),
  };
}

export function SynthPluginUI({ instance }: SynthPluginUIProps) {
  const synthInstance = instance as SynthPluginInstance;
  const engine = synthInstance.getEngine();
  const [params, setParams] = useState<SynthPluginParams>(() =>
    cloneParams(synthInstance.params),
  );
  const activeNotes = useSyncExternalStore(
    synthInstance.subscribeToAudioDisplay.bind(synthInstance),
    () => synthInstance.getAudioDisplayState().activeNotes,
    () => synthInstance.getAudioDisplayState().activeNotes,
  );

  const updateParams = useCallback(
    (updater: (current: SynthPluginParams) => SynthPluginParams) => {
      setParams((current) => {
        const next = updater(current);
        synthInstance.updateParams(next);
        return next;
      });
    },
    [synthInstance],
  );

  const handleEnvelopeChange = useCallback(
    (
      partial: Partial<
        Pick<SynthPluginParams, "attack" | "decay" | "sustain" | "release">
      >,
    ) => {
      updateParams((current) => ({ ...current, ...partial }));
    },
    [updateParams],
  );

  const handleFilterChange = useCallback(
    (
      partial: Partial<
        Pick<SynthPluginParams, "filterMode" | "filterCutoff" | "filterQ">
      >,
    ) => {
      updateParams((current) => ({ ...current, ...partial }));
    },
    [updateParams],
  );

  const handleVolumeChange = useCallback(
    (volume: number) => {
      updateParams((current) => ({ ...current, volume }));
    },
    [updateParams],
  );

  const handleOscChange = useCallback(
    (
      index: number,
      partial: Partial<SynthPluginParams["oscConfigs"][number]>,
    ) => {
      updateParams((current) => ({
        ...current,
        oscConfigs: current.oscConfigs.map((config, configIndex) =>
          configIndex === index ? { ...config, ...partial } : config,
        ),
      }));
    },
    [updateParams],
  );

  const handleAddOsc = useCallback(() => {
    updateParams((current) => ({
      ...current,
      oscConfigs: [
        ...current.oscConfigs,
        { shape: "saw", octave: 0, fine: 0, level: 1.0 },
      ],
    }));
  }, [updateParams]);

  const handleRemoveOsc = useCallback(
    (index: number) => {
      updateParams((current) => {
        if (current.oscConfigs.length <= 1) {
          return current;
        }

        return {
          ...current,
          oscConfigs: current.oscConfigs.filter(
            (_, oscIndex) => oscIndex !== index,
          ),
        };
      });
    },
    [updateParams],
  );

  const { noteOn, noteOff } = usePluginActions();

  const handleNoteOn = useCallback(
    (midi: number) => {
      noteOn(midi);
    },
    [noteOn],
  );

  const handleNoteOff = useCallback(
    (midi: number) => {
      noteOff(midi);
    },
    [noteOff],
  );

  return (
    <div className="flex h-full gap-2 p-2">
      <EnvelopePanel
        attack={params.attack}
        decay={params.decay}
        sustain={params.sustain}
        release={params.release}
        onChange={handleEnvelopeChange}
      />
      <FilterPanel
        filterMode={params.filterMode}
        filterCutoff={params.filterCutoff}
        filterQ={params.filterQ}
        onChange={handleFilterChange}
      />
      <VolumePanel volume={params.volume} onChange={handleVolumeChange} />
      <OscBankPanel
        oscConfigs={params.oscConfigs}
        onChange={handleOscChange}
        onAdd={handleAddOsc}
        onRemove={handleRemoveOsc}
      />
      <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-synth-border">
        <PianoKeyboard
          activeNotes={activeNotes}
          onNoteOn={handleNoteOn}
          onNoteOff={handleNoteOff}
        />
      </div>
    </div>
  );
}
