"use client";

import { useState, useCallback } from "react";
import type { PluginInstance, ParameterDescriptor } from "@/types/plugin";

interface FaustPluginUIProps {
  instance: PluginInstance;
}

/**
 * Auto-generated UI for Faust plugins based on parameter descriptors.
 * Renders a slider for each parameter.
 */
export function FaustPluginUI({ instance }: FaustPluginUIProps) {
  const params = instance.descriptor.parameterDescriptors;

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="text-sm font-medium text-synth-text mb-1">
        {instance.descriptor.name}
      </div>
      {params.length === 0 ? (
        <div className="text-xs text-synth-muted">No parameters</div>
      ) : (
        params.map((param) => (
          <ParameterSlider
            key={param.id}
            param={param}
            value={instance.getParameterValue(param.id)}
            onChange={(value) => instance.setParameterValue(param.id, value)}
          />
        ))
      )}
    </div>
  );
}

interface ParameterSliderProps {
  param: ParameterDescriptor;
  value: number;
  onChange: (value: number) => void;
}

function ParameterSlider({ param, value, onChange }: ParameterSliderProps) {
  const [localValue, setLocalValue] = useState(value);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      setLocalValue(v);
      onChange(v);
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-synth-muted w-24 shrink-0 truncate" title={param.name}>
        {param.name}
      </label>
      <input
        type="range"
        min={param.min}
        max={param.max}
        step={(param.max - param.min) / 200}
        value={localValue}
        onChange={handleChange}
        className="flex-1 h-1 accent-synth-accent"
      />
      <span className="text-xs text-synth-muted w-12 text-right tabular-nums">
        {localValue.toFixed(param.mapping === "discrete" ? 0 : 2)}
        {param.unit && <span className="ml-0.5">{param.unit}</span>}
      </span>
    </div>
  );
}
