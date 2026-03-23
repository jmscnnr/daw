"use client";

import { TransportControls } from "./TransportControls";
import { useProjectStore } from "@/stores/project-store";
import { useCommandHistory } from "@/stores/command-history";
import { useUIStore } from "@/stores/ui-store";
import { useRef, useState } from "react";
import { Magnet, Undo2, Redo2, ChevronDown } from "lucide-react";
import { ProjectModal } from "./ProjectModal";
import { WaveformCanvas } from "@/components/synth/WaveformCanvas";

export function Toolbar() {
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const projectName = useProjectStore((s) => s.project.name);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const canUndo = useCommandHistory((s) => s.canUndo);
  const canRedo = useCommandHistory((s) => s.canRedo);
  const undo = useCommandHistory((s) => s.undo);
  const redo = useCommandHistory((s) => s.redo);
  const snapEnabled = useUIStore((s) => s.snapEnabled);
  const toggleSnap = useUIStore((s) => s.toggleSnap);

  return (
    <div className="flex items-center justify-between border-b border-synth-border bg-daw-toolbar-bg px-3 py-2">
      {/* Left: Transport */}
      <TransportControls />

      {/* Center: Project name + menu */}
      <div className="flex items-center gap-1">
        {editingName ? (
          <input
            ref={nameInputRef}
            defaultValue={projectName}
            autoFocus
            className="bg-synth-bg text-sm text-synth-text border border-synth-border rounded px-2 py-0.5 text-center outline-none focus:border-synth-accent"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) setProjectName(v);
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                (e.target as HTMLInputElement).value = projectName;
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        ) : (
          <div
            className="text-sm text-synth-muted cursor-pointer hover:text-synth-text"
            onDoubleClick={() => setEditingName(true)}
            title="Double-click to rename"
          >
            {projectName}
          </div>
        )}
        <button
          onClick={() => setProjectModalOpen(true)}
          className="rounded p-0.5 text-synth-muted transition-colors hover:bg-synth-panel hover:text-synth-text"
          title="Projects"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      <ProjectModal open={projectModalOpen} onClose={() => setProjectModalOpen(false)} />

      {/* Right: Snap + Undo/Redo */}
      <div className="flex items-center gap-2">
        {/* Snap toggle */}
        <button
          onClick={toggleSnap}
          className={`flex items-center rounded border px-2 py-1 text-xs transition-colors ${
            snapEnabled
              ? "border-synth-accent bg-synth-accent/20 text-synth-accent"
              : "border-synth-border bg-synth-surface text-synth-muted hover:bg-synth-panel"
          }`}
          title="Snap to grid"
        >
          <Magnet size={12} className="mr-1" />
          Snap
        </button>

        <div className="mx-1 h-5 w-px bg-synth-border" />

        {/* Waveform */}
        <WaveformCanvas className="relative h-6 w-28 rounded overflow-hidden border border-synth-border" />

        <div className="mx-1 h-5 w-px bg-synth-border" />

        {/* Undo/Redo */}
        <button
          onClick={undo}
          disabled={!canUndo}
          className="flex items-center rounded border border-synth-border bg-synth-surface px-2 py-1 text-xs text-synth-muted transition-colors hover:bg-synth-panel disabled:opacity-30"
          title="Undo"
        >
          <Undo2 size={12} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="flex items-center rounded border border-synth-border bg-synth-surface px-2 py-1 text-xs text-synth-muted transition-colors hover:bg-synth-panel disabled:opacity-30"
          title="Redo"
        >
          <Redo2 size={12} />
        </button>
      </div>
    </div>
  );
}
