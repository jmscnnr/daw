"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Clock, Trash2, Volume2, FolderOpen } from "lucide-react";
import { listProjects, loadProject, deleteProject } from "@/lib/project-db";
import type { ProjectMeta } from "@/lib/project-db";
import { useProjectStore } from "@/stores/project-store";

interface LandingScreenProps {
  onOpen: () => void;
}

export function LandingScreen({ onOpen }: LandingScreenProps) {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const newProject = useProjectStore((s) => s.newProject);
  const loadProjectIntoStore = useProjectStore((s) => s.loadProject);

  const refresh = useCallback(() => {
    listProjects()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleNew = () => {
    newProject();
    onOpen();
  };

  const handleOpen = async (id: string) => {
    const project = await loadProject(id);
    if (project) {
      loadProjectIntoStore(project);
      onOpen();
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteProject(id);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-synth-bg">
      <div className="w-full max-w-lg px-6">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <Volume2 size={28} className="text-synth-accent" />
            <h1 className="text-2xl font-bold text-synth-text">DAW</h1>
          </div>
          <p className="text-sm text-synth-muted">Web-based digital audio workstation</p>
        </div>

        {/* New Project */}
        <button
          onClick={handleNew}
          className="mb-6 flex w-full items-center gap-3 rounded-lg border border-synth-border bg-synth-surface px-5 py-4 text-synth-text transition-colors hover:border-synth-accent hover:bg-synth-panel"
        >
          <Plus size={20} className="text-synth-accent" />
          <div className="text-left">
            <div className="text-sm font-medium">New Project</div>
            <div className="text-xs text-synth-muted">Start with an empty project</div>
          </div>
        </button>

        {/* Recent Projects */}
        {!loading && projects.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-synth-muted">
              <Clock size={12} />
              Recent Projects
            </div>
            <div className="flex flex-col gap-1">
              {projects.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpen(p.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleOpen(p.id); }}
                  className="group flex cursor-pointer items-center gap-3 rounded-lg border border-synth-border bg-synth-surface px-4 py-3 text-left transition-colors hover:border-synth-accent/50 hover:bg-synth-panel"
                >
                  <FolderOpen size={16} className="shrink-0 text-synth-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-synth-text">{p.name}</div>
                    <div className="text-xs text-synth-muted">
                      {p.trackCount} track{p.trackCount !== 1 ? "s" : ""} · {formatDate(p.modifiedAt)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, p.id)}
                    className="shrink-0 rounded p-1 text-synth-muted opacity-0 transition-all hover:bg-red-900/40 hover:text-red-400 group-hover:opacity-100"
                    title="Delete project"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center text-sm text-synth-muted">Loading projects...</div>
        )}
      </div>
    </div>
  );
}
