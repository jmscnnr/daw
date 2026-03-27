"use client";

import { TransportControls } from "./TransportControls";
import { useProjectStore } from "@/stores/project-store";
import { useUIStore } from "@/stores/ui-store";
import { useState, useCallback } from "react";
import { Magnet } from "lucide-react";
import { ProjectModal } from "./ProjectModal";
import { MenuBar } from "./MenuBar";
import { WaveformCanvas } from "@/components/synth/WaveformCanvas";
import { saveProject } from "@/lib/project-db";
import type { PluginInstance } from "@/types/plugin";

interface ToolbarProps {
  selectedPlugin: PluginInstance | null;
}

export function Toolbar({ selectedPlugin }: ToolbarProps) {
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [namingNewProject, setNamingNewProject] = useState(false);
  const [newName, setNewName] = useState("");
  const snapEnabled = useUIStore((s) => s.snapEnabled);
  const toggleSnap = useUIStore((s) => s.toggleSnap);

  const handleNewProject = useCallback(() => {
    setNamingNewProject(true);
    setNewName("");
  }, []);

  const handleNewProjectConfirm = useCallback(async () => {
    const name = newName.trim();
    const store = useProjectStore.getState();
    await saveProject(store.project);
    store.newProject();
    if (name) store.setProjectName(name);
    setNamingNewProject(false);
  }, [newName]);

  const handleNewProjectCancel = useCallback(() => {
    setNamingNewProject(false);
    setNewName("");
  }, []);

  return (
    <div className="border-b border-synth-border">
      {/* Menu bar row */}
      <MenuBar
        onNewProject={handleNewProject}
        onOpenProjects={() => setProjectModalOpen(true)}
      />

      {/* Toolbar row */}
      <div className="flex items-center justify-between bg-daw-toolbar-bg px-3 py-2">
        {/* Left: Transport */}
        <TransportControls />

        {/* Right: Snap + Waveform */}
        <div className="flex items-center gap-2">
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

          <WaveformCanvas
            plugin={selectedPlugin}
            className="relative h-6 w-28 rounded overflow-hidden border border-synth-border"
          />
        </div>
      </div>

      <ProjectModal open={projectModalOpen} onClose={() => setProjectModalOpen(false)} />

      {/* New project naming dialog */}
      {namingNewProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-lg border border-synth-border bg-synth-bg p-5 shadow-2xl">
            <h3 className="mb-3 text-sm font-medium text-synth-text">New Project</h3>
            <label className="mb-1.5 block text-xs text-synth-muted">Project name</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNewProjectConfirm();
                if (e.key === "Escape") handleNewProjectCancel();
              }}
              placeholder="Untitled Project"
              className="mb-4 w-full rounded border border-synth-border bg-synth-surface px-3 py-2 text-sm text-synth-text placeholder:text-synth-muted focus:border-synth-accent focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={handleNewProjectCancel}
                className="rounded border border-synth-border px-4 py-1.5 text-xs text-synth-muted transition-colors hover:text-synth-text"
              >
                Cancel
              </button>
              <button
                onClick={handleNewProjectConfirm}
                className="rounded bg-synth-accent px-4 py-1.5 text-xs font-medium text-synth-bg transition-opacity hover:opacity-90"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
