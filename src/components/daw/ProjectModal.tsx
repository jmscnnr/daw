"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Plus, FolderOpen, Trash2, X, Clock, Save } from "lucide-react";
import { listProjects, loadProject, deleteProject, saveProject } from "@/lib/project-db";
import type { ProjectMeta } from "@/lib/project-db";
import { useProjectStore } from "@/stores/project-store";

interface ProjectModalProps {
  open: boolean;
  onClose: () => void;
}

export function ProjectModal({ open, onClose }: ProjectModalProps) {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const currentId = useProjectStore((s) => s.project.id);
  const currentProject = useProjectStore((s) => s.project);
  const loadProjectIntoStore = useProjectStore((s) => s.loadProject);
  const newProject = useProjectStore((s) => s.newProject);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");

  const refresh = useCallback(() => {
    listProjects().then(setProjects).catch(console.error);
  }, []);

  useEffect(() => {
    if (open) {
      refresh();
      setNaming(false);
      setNewName("");
    }
  }, [open, refresh]);

  const handleNewClick = () => {
    setNaming(true);
    setNewName("");
  };

  const handleNewConfirm = async () => {
    await saveProject(currentProject);
    newProject();
    const name = newName.trim();
    if (name) setProjectName(name);
    setNaming(false);
    onClose();
  };

  const handleNewCancel = () => {
    setNaming(false);
    setNewName("");
  };

  const handleOpen = async (id: string) => {
    if (id === currentId) {
      onClose();
      return;
    }
    // Save current project first
    await saveProject(currentProject);
    const project = await loadProject(id);
    if (project) {
      loadProjectIntoStore(project);
      onClose();
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (id === currentId) return; // Can't delete active project
    await deleteProject(id);
    refresh();
  };

  const handleSave = async () => {
    await saveProject(currentProject);
    refresh();
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  };

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-synth-border bg-synth-bg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-synth-border px-4 py-3">
          <h2 className="text-sm font-medium text-synth-text">Projects</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-synth-muted transition-colors hover:bg-synth-panel hover:text-synth-text"
          >
            <X size={16} />
          </button>
        </div>

        {/* Actions */}
        <div className="border-b border-synth-border px-4 py-3">
          {naming ? (
            <div>
              <label className="mb-1.5 block text-xs text-synth-muted">Project name</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNewConfirm();
                  if (e.key === "Escape") handleNewCancel();
                }}
                placeholder="Untitled Project"
                className="mb-2 w-full rounded border border-synth-border bg-synth-bg px-3 py-1.5 text-sm text-synth-text placeholder:text-synth-muted focus:border-synth-accent focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleNewConfirm}
                  className="rounded bg-synth-accent px-3 py-1 text-xs font-medium text-synth-bg transition-opacity hover:opacity-90"
                >
                  Create
                </button>
                <button
                  onClick={handleNewCancel}
                  className="rounded border border-synth-border px-3 py-1 text-xs text-synth-muted transition-colors hover:text-synth-text"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleNewClick}
                className="flex items-center gap-2 rounded border border-synth-border bg-synth-surface px-3 py-1.5 text-xs text-synth-text transition-colors hover:border-synth-accent hover:bg-synth-panel"
              >
                <Plus size={14} />
                New Project
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 rounded border border-synth-border bg-synth-surface px-3 py-1.5 text-xs text-synth-text transition-colors hover:border-synth-accent hover:bg-synth-panel"
              >
                <Save size={14} />
                Save Now
              </button>
            </div>
          )}
        </div>

        {/* Project List */}
        <div className="max-h-80 overflow-y-auto px-4 py-2">
          {projects.length === 0 ? (
            <div className="py-6 text-center text-sm text-synth-muted">
              No saved projects yet
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="mb-1 flex items-center gap-1 text-[10px] text-synth-muted">
                <Clock size={10} />
                Recent
              </div>
              {projects.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpen(p.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleOpen(p.id); }}
                  className={`group flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-left transition-colors ${
                    p.id === currentId
                      ? "border border-synth-accent/40 bg-synth-accent/10"
                      : "border border-transparent hover:bg-synth-panel"
                  }`}
                >
                  <FolderOpen
                    size={14}
                    className={
                      p.id === currentId ? "text-synth-accent" : "text-synth-muted"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-synth-text">{p.name}</div>
                    <div className="text-xs text-synth-muted">
                      {p.trackCount} track{p.trackCount !== 1 ? "s" : ""} ·{" "}
                      {formatDate(p.modifiedAt)}
                    </div>
                  </div>
                  {p.id !== currentId && (
                    <button
                      onClick={(e) => handleDelete(e, p.id)}
                      className="shrink-0 rounded p-1 text-synth-muted opacity-0 transition-all hover:bg-red-900/40 hover:text-red-400 group-hover:opacity-100"
                      title="Delete project"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  {p.id === currentId && (
                    <span className="text-[10px] text-synth-accent">Active</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
