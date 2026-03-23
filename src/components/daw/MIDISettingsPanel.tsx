"use client";

import { useState, useEffect, useCallback } from "react";
import type { HardwareMIDISource, MIDIDeviceInfo } from "@/audio/midi/hardware-source";
import { Usb } from "lucide-react";

interface MIDISettingsPanelProps {
  hardwareMidi: HardwareMIDISource | null;
}

export function MIDISettingsPanel({ hardwareMidi }: MIDISettingsPanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [inputs, setInputs] = useState<MIDIDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MIDIDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshDevices = useCallback(() => {
    if (!hardwareMidi) return;
    setInputs(hardwareMidi.getInputDevices());
    setOutputs(hardwareMidi.getOutputDevices());
  }, [hardwareMidi]);

  const handleToggle = useCallback(async () => {
    if (!hardwareMidi) return;

    try {
      if (enabled) {
        hardwareMidi.disable();
        setEnabled(false);
        setInputs([]);
        setOutputs([]);
      } else {
        await hardwareMidi.enable();
        setEnabled(true);
        refreshDevices();
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to access MIDI devices");
    }
  }, [hardwareMidi, enabled, refreshDevices]);

  // Refresh device list periodically when enabled
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(refreshDevices, 2000);
    return () => clearInterval(interval);
  }, [enabled, refreshDevices]);

  return (
    <div className="rounded-lg border border-synth-border bg-synth-surface p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-synth-text flex items-center gap-1.5">
          <Usb size={14} />
          MIDI Devices
        </h3>
        <button
          onClick={handleToggle}
          className={`rounded px-2 py-0.5 text-xs transition-colors ${
            enabled
              ? "bg-synth-accent/20 text-synth-accent border border-synth-accent"
              : "bg-synth-panel text-synth-muted border border-synth-border hover:bg-synth-surface"
          }`}
        >
          {enabled ? "Disable" : "Enable"}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 mb-2">{error}</div>
      )}

      {enabled && (
        <div className="space-y-2">
          <div>
            <div className="text-xs text-synth-muted mb-1">Inputs</div>
            {inputs.length === 0 ? (
              <div className="text-xs text-synth-muted/50">No inputs detected</div>
            ) : (
              <ul className="space-y-0.5">
                {inputs.map((d) => (
                  <li key={d.id} className="text-xs text-synth-text">
                    {d.name}
                    {d.manufacturer && (
                      <span className="text-synth-muted ml-1">({d.manufacturer})</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="text-xs text-synth-muted mb-1">Outputs</div>
            {outputs.length === 0 ? (
              <div className="text-xs text-synth-muted/50">No outputs detected</div>
            ) : (
              <ul className="space-y-0.5">
                {outputs.map((d) => (
                  <li key={d.id} className="text-xs text-synth-text">
                    {d.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
