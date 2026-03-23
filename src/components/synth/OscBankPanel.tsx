"use client";

import { memo, useCallback } from "react";
import { useSynthStore } from "@/stores/synth-store";
import type { OscConfig } from "@/audio/types";
import { OscillatorRow } from "./OscillatorRow";
import { Plus } from "lucide-react";

export const OscBankPanel = memo(function OscBankPanel() {
  const oscConfigs = useSynthStore((s) => s.oscConfigs);
  const updateOscConfig = useSynthStore((s) => s.updateOscConfig);
  const addOsc = useSynthStore((s) => s.addOsc);
  const removeOsc = useSynthStore((s) => s.removeOsc);

  const handleChange = useCallback(
    (index: number, partial: Partial<OscConfig>) => {
      updateOscConfig(index, partial);
    },
    [updateOscConfig],
  );

  return (
    <div className="bg-synth-panel rounded-lg p-2 border border-synth-border flex flex-col min-w-0">
      <h3 className="text-[10px] text-synth-muted mb-1 uppercase tracking-wider">Oscillators</h3>
      <div className="flex-1 overflow-y-auto min-h-0" aria-live="polite">
        {oscConfigs.map((config, i) => (
          <OscillatorRow
            key={i}
            index={i}
            config={config}
            canRemove={oscConfigs.length > 1}
            onChange={handleChange}
            onRemove={removeOsc}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={addOsc}
        className="mt-2 w-full flex items-center justify-center gap-1 text-xs text-synth-accent border border-synth-border rounded py-1 hover:bg-synth-surface transition-colors"
      >
        <Plus size={12} />
        Add Oscillator
      </button>
    </div>
  );
});
