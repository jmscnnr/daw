"use client";

import { useCallback, useRef } from "react";
import { useUIStore, type BottomPanelMode } from "@/stores/ui-store";
import { SlidersHorizontal, PencilLine, Piano } from "lucide-react";

const tabs: { mode: BottomPanelMode; label: string; icon: typeof SlidersHorizontal }[] = [
  { mode: "plugin", label: "Instrument", icon: Piano },
  { mode: "editor", label: "Editor", icon: PencilLine },
  { mode: "mixer", label: "Mixer", icon: SlidersHorizontal },
];

interface PanelLayoutProps {
  top: React.ReactNode;
  bottom: React.ReactNode;
}

export function PanelLayout({ top, bottom }: PanelLayoutProps) {
  const arrangementHeight = useUIStore((s) => s.arrangementHeightPercent);
  const setArrangementHeight = useUIStore((s) => s.setArrangementHeight);
  const bottomPanelMode = useUIStore((s) => s.bottomPanelMode);
  const setBottomPanelMode = useUIStore((s) => s.setBottomPanelMode);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTabClick = useCallback(
    (mode: BottomPanelMode) => {
      setBottomPanelMode(bottomPanelMode === mode ? "none" : mode);
    },
    [bottomPanelMode, setBottomPanelMode],
  );

  const handleDividerPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const startY = e.clientY;
      const startHeight = arrangementHeight;
      const containerRect = container.getBoundingClientRect();

      const onPointerMove = (ev: PointerEvent) => {
        const deltaY = ev.clientY - startY;
        const deltaPercent = (deltaY / containerRect.height) * 100;
        setArrangementHeight(startHeight + deltaPercent);
      };

      const onPointerUp = () => {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [arrangementHeight, setArrangementHeight],
  );

  const tabBar = (
    <div className="flex shrink-0 items-center gap-px border-t border-synth-border bg-daw-toolbar-bg px-2">
      {tabs.map(({ mode, label, icon: Icon }) => (
        <button
          key={mode}
          onClick={() => handleTabClick(mode)}
          className={`flex items-center px-3 py-1.5 text-xs transition-colors ${
            bottomPanelMode === mode
              ? "border-t-2 border-synth-accent text-synth-accent bg-synth-bg"
              : "border-t-2 border-transparent text-synth-muted hover:text-synth-text hover:bg-synth-surface"
          }`}
        >
          <Icon size={12} className="mr-1.5" />
          {label}
        </button>
      ))}
    </div>
  );

  if (bottomPanelMode === "none") {
    return (
      <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">{top}</div>
        {tabBar}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden">
      {/* Top panel (arrangement) */}
      <div
        className="overflow-hidden"
        style={{ height: `${arrangementHeight}%` }}
      >
        {top}
      </div>

      {/* Divider */}
      <div
        onPointerDown={handleDividerPointerDown}
        className="h-1 shrink-0 cursor-row-resize bg-daw-divider transition-colors hover:bg-synth-accent"
      />

      {/* Tab bar */}
      {tabBar}

      {/* Bottom panel content */}
      <div className="flex-1 overflow-hidden">{bottom}</div>
    </div>
  );
}
