"use client";

import { useProjectStore } from "@/stores/project-store";
import { ChannelStrip } from "./ChannelStrip";
import { MasterStrip } from "./MasterStrip";

export function MixerView() {
  const tracks = useProjectStore((s) => s.project.tracks);

  return (
    <div className="flex h-full bg-[#181818]">
      {/* Track channel strips */}
      <div className="flex flex-1 overflow-x-auto">
        {tracks.map((track, i) => (
          <ChannelStrip key={track.id} track={track} index={i} />
        ))}
        {tracks.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-[#555]">
            No tracks
          </div>
        )}
      </div>

      {/* Master strip */}
      <div className="border-l border-[#333]">
        <MasterStrip />
      </div>
    </div>
  );
}
