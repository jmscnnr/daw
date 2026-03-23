"use client";

import { useProjectStore } from "@/stores/project-store";
import { useUIStore } from "@/stores/ui-store";
import { PianoRoll } from "./PianoRoll";

export function PianoRollPanel() {
  const editingClipId = useUIStore((s) => s.editingClipId);
  const tracks = useProjectStore((s) => s.project.tracks);

  if (!editingClipId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-synth-muted">
        Double-click a track lane to create a MIDI clip, or double-click an existing clip to edit it.
      </div>
    );
  }

  // Find the clip and its track
  for (const track of tracks) {
    const clip = track.clips.find((c) => c.id === editingClipId);
    if (clip) {
      return <PianoRoll clip={clip} trackId={track.id} />;
    }
  }

  return (
    <div className="flex h-full items-center justify-center text-sm text-synth-muted">
      Clip not found. It may have been deleted.
    </div>
  );
}
