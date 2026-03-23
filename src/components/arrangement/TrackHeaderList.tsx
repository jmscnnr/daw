"use client";

import { useProjectStore } from "@/stores/project-store";
import { TrackHeader } from "./TrackHeader";
import { useCallback } from "react";
import { Plus } from "lucide-react";

interface TrackHeaderListProps {
  noRulerSpacer?: boolean;
  noAddButton?: boolean;
}

export function TrackHeaderList({ noRulerSpacer, noAddButton }: TrackHeaderListProps) {
  const tracks = useProjectStore((s) => s.project.tracks);
  const addTrack = useProjectStore((s) => s.addTrack);

  const handleAddTrack = useCallback(() => {
    addTrack("midi");
  }, [addTrack]);

  return (
    <div className="flex h-full flex-col">
      {!noRulerSpacer && (
        <div className="h-7 shrink-0 border-b border-synth-border bg-daw-toolbar-bg" />
      )}

      {/* Track headers */}
      <div className="flex-1">
        {tracks.map((track, i) => (
          <TrackHeader key={track.id} track={track} index={i} />
        ))}
      </div>

      {/* Add track button */}
      {!noAddButton && (
        <div className="shrink-0 border-t border-synth-border p-2">
          <button
            onClick={handleAddTrack}
            className="flex items-center justify-center gap-1 w-full rounded border border-synth-border bg-synth-surface px-2 py-1 text-xs text-synth-muted transition-colors hover:bg-synth-panel hover:text-synth-text"
          >
            <Plus size={12} />
            Add Track
          </button>
        </div>
      )}
    </div>
  );
}
