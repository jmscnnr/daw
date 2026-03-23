"use client";

import type { PluginInstance } from "@/types/plugin";
import { SYNTH_PLUGIN_ID } from "@/audio/plugins/builtin/synth-plugin";
import { SynthPluginUI } from "@/components/synth/SynthPluginUI";

interface PluginPanelProps {
  trackId: string | null;
  getTrackPlugin: (trackId: string) => PluginInstance | null;
}

export function PluginPanel({ trackId, getTrackPlugin }: PluginPanelProps) {
  if (!trackId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-synth-muted">
        Select a track to view its plugin
      </div>
    );
  }

  const plugin = getTrackPlugin(trackId);
  if (!plugin) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-synth-muted">
        No plugin on this track — assign one from the track header
      </div>
    );
  }

  if (plugin.descriptor.id === SYNTH_PLUGIN_ID) {
    return (
      <div className="h-full overflow-auto p-2">
        <SynthPluginUI
          key={`${trackId}:${plugin.descriptor.id}`}
          instance={plugin}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center text-sm text-synth-muted">
      {plugin.descriptor.name} — no UI available
    </div>
  );
}
