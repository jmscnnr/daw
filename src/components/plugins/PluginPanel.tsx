"use client";

import type { PluginInstance } from "@/types/plugin";

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

  const UIComponent = plugin.getUIComponent();
  if (UIComponent) {
    return (
      <div className="h-full overflow-auto p-2">
        <UIComponent instance={plugin} />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center text-sm text-synth-muted">
      {plugin.descriptor.name} — no UI available
    </div>
  );
}
