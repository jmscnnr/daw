"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { TrackHeaderList } from "./TrackHeaderList";
import { TimelineCanvas } from "./TimelineCanvas";
import { useCommandHistory } from "@/stores/command-history";
import { useUIStore } from "@/stores/ui-store";
import { useProjectStore } from "@/stores/project-store";
import { CreateTrackCommand } from "@/commands/track-commands";
import { PPQ } from "@/lib/constants";

/** Total timeline length in bars for scrollbar calculation */
const TOTAL_BARS = 200;

const RULER_HEIGHT = 28;
const SCROLLBAR_HEIGHT = 14;

export function ArrangementView() {
  const scrollX = useUIStore((s) => s.scrollX);
  const horizontalZoom = useUIStore((s) => s.horizontalZoom);
  const scrollY = useUIStore((s) => s.scrollY);
  const timeSignature = useProjectStore((s) => s.project.timeSignature);
  const executeCommand = useCommandHistory((s) => s.execute);
  const [containerWidth, setContainerWidth] = useState(800);

  const ticksPerBar = PPQ * timeSignature.numerator;
  const totalTicks = TOTAL_BARS * ticksPerBar;
  const pixelsPerTick = horizontalZoom / PPQ;

  // Horizontal scrollbar change
  const handleHScrollChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      useUIStore.getState().setScrollX(parseFloat(e.target.value));
    },
    [],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const visibleTicks = containerWidth / pixelsPerTick;
  const maxScroll = Math.max(0, totalTicks - visibleTicks);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);
    setContainerWidth(container.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Main area: track headers + timeline */}
      <div className="flex flex-1 min-h-0">
        {/* Track headers (left column) */}
        <div className="w-[240px] shrink-0 border-r border-synth-border flex flex-col">
          {/* Ruler spacer */}
          <div
            className="shrink-0 border-b border-synth-border bg-daw-toolbar-bg"
            style={{ height: RULER_HEIGHT }}
          />
          {/* Track headers — offset by scrollY, clipped to area below ruler */}
          <div className="flex-1 overflow-hidden">
            <div style={{ transform: `translateY(${-scrollY}px)` }}>
              <TrackHeaderList noRulerSpacer noAddButton />
            </div>
          </div>
          {/* Add track button — pinned at bottom */}
          <div className="shrink-0 border-t border-synth-border p-2">
            <button
              onClick={() => executeCommand(new CreateTrackCommand("midi"))}
              className="w-full rounded border border-synth-border bg-synth-surface px-2 py-1 text-xs text-synth-muted transition-colors hover:bg-synth-panel hover:text-synth-text"
            >
              + Add Track
            </button>
          </div>
        </div>

        {/* Timeline (right, fills remaining space) */}
        <div ref={containerRef} className="flex-1 overflow-hidden">
          <TimelineCanvas />
        </div>
      </div>

      {/* Horizontal scrollbar */}
      <div
        className="shrink-0 flex items-center bg-synth-surface border-t border-synth-border"
        style={{ height: SCROLLBAR_HEIGHT }}
      >
        {/* Spacer to align with track headers */}
        <div className="w-[240px] shrink-0" />
        <input
          type="range"
          min={0}
          max={maxScroll}
          step={ticksPerBar / 4}
          value={Math.min(scrollX, maxScroll)}
          onChange={handleHScrollChange}
          className="timeline-scrollbar flex-1 h-[10px] cursor-pointer"
        />
      </div>
    </div>
  );
}
