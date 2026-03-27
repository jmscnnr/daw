"use client";

import { useCallback, useRef } from "react";
import { useUIStore, type BottomPanelMode } from "@/stores/ui-store";
import { SlidersHorizontal, PencilLine, Piano, ChevronDown, ChevronUp } from "lucide-react";

const tabs: { mode: BottomPanelMode; label: string; icon: typeof SlidersHorizontal }[] = [
  { mode: "plugin", label: "Instrument", icon: Piano },
  { mode: "editor", label: "Editor", icon: PencilLine },
  { mode: "mixer", label: "Mixer", icon: SlidersHorizontal },
];

const defaultArrangementHeight = 60;

interface PanelLayoutProps {
  top: React.ReactNode;
  bottom: React.ReactNode;
}

export function PanelLayout({ top, bottom }: PanelLayoutProps) {
  const arrangementHeight = useUIStore((s) => s.arrangementHeightPercent);
  const setArrangementHeight = useUIStore((s) => s.setArrangementHeight);
  const bottomPanelMode = useUIStore((s) => s.bottomPanelMode);
  const setBottomPanelMode = useUIStore((s) => s.setBottomPanelMode);
  const bottomPanelVisible = useUIStore((s) => s.bottomPanelVisible);
  const toggleBottomPanel = useUIStore((s) => s.toggleBottomPanel);
  const containerRef = useRef<HTMLDivElement>(null);

  const isCollapsed = !bottomPanelVisible || bottomPanelMode === "none";

  const handleTabClick = useCallback(
    (mode: BottomPanelMode) => {
      const s = useUIStore.getState();
      if (!s.bottomPanelVisible) {
        s.toggleBottomPanel();
        s.setBottomPanelMode(mode);
        s.setArrangementHeight(defaultArrangementHeight);
      } else if (s.bottomPanelMode === mode) {
        s.setBottomPanelMode("none");
      } else {
        s.setBottomPanelMode(mode);
      }
    },
    [],
  );

  const collapseThreshold = 90;
  const expandHysteresis = 5;

  const handleDividerPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const store = useUIStore.getState();
      const collapsed = { current: !store.bottomPanelVisible || store.bottomPanelMode === "none" };

      const onPointerMove = (ev: PointerEvent) => {
        const percent = ((ev.clientY - containerRect.top) / containerRect.height) * 100;

        if (!collapsed.current && percent >= collapseThreshold) {
          collapsed.current = true;
          const s = useUIStore.getState();
          if (s.bottomPanelVisible) s.toggleBottomPanel();
        } else if (collapsed.current && percent <= collapseThreshold - expandHysteresis) {
          collapsed.current = false;
          const s = useUIStore.getState();
          if (!s.bottomPanelVisible) s.toggleBottomPanel();
          s.setArrangementHeight(percent);
        } else if (!collapsed.current) {
          useUIStore.getState().setArrangementHeight(percent);
        }
      };

      const onPointerUp = () => {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [],
  );

  const tabBar = (
    <div className="flex shrink-0 items-center gap-px border-t border-synth-border bg-daw-toolbar-bg px-2">
      {tabs.map(({ mode, label, icon: Icon }) => (
        <button
          key={mode}
          onClick={() => handleTabClick(mode)}
          className={`flex items-center px-3 py-1.5 text-xs transition-colors ${
            !isCollapsed && bottomPanelMode === mode
              ? "border-t-2 border-synth-accent text-synth-accent bg-synth-bg"
              : "border-t-2 border-transparent text-synth-muted hover:text-synth-text hover:bg-synth-surface"
          }`}
        >
          <Icon size={12} className="mr-1.5" />
          {label}
        </button>
      ))}
      <button
        onClick={toggleBottomPanel}
        className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs text-synth-muted hover:text-synth-text hover:bg-synth-surface transition-colors"
        title={bottomPanelVisible ? "Hide bottom panel" : "Show bottom panel"}
      >
        <span className="text-[10px] uppercase tracking-wide">{bottomPanelVisible ? "Hide" : "Show"}</span>
        {bottomPanelVisible ? <ChevronDown size={16} strokeWidth={2.5} /> : <ChevronUp size={16} strokeWidth={2.5} />}
      </button>
    </div>
  );

  const collapsedDivider = (
    <div
      onPointerDown={handleDividerPointerDown}
      className="h-1 shrink-0 cursor-row-resize bg-daw-divider transition-colors hover:bg-synth-accent"
    />
  );

  if (!bottomPanelVisible) {
    return (
      <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">{top}</div>
        {collapsedDivider}
        {tabBar}
      </div>
    );
  }

  if (bottomPanelMode === "none") {
    return (
      <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">{top}</div>
        {collapsedDivider}
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
