"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Undo2, Redo2 } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { useCommandHistory } from "@/stores/command-history";
import { useUIStore } from "@/stores/ui-store";
import { useTransportStore } from "@/stores/transport-store";
import { saveProject } from "@/lib/project-db";
import { bounceProject } from "@/audio/engine/offline-renderer";
import { CreateTrackCommand, SetProjectNameCommand } from "@/commands/track-commands";

// ── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: false;
}

interface MenuSeparator {
  separator: true;
}

type MenuEntry = MenuItem | MenuSeparator;

interface MenuDefinition {
  label: string;
  items: MenuEntry[];
}

// ── Props ────────────────────────────────────────────────────────────────────

interface MenuBarProps {
  onNewProject: () => void;
  onOpenProjects: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function MenuBar({ onNewProject, onOpenProjects }: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const projectName = useProjectStore((s) => s.project.name);
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const canUndo = useCommandHistory((s) => s.canUndo);
  const canRedo = useCommandHistory((s) => s.canRedo);
  const undo = useCommandHistory((s) => s.undo);
  const redo = useCommandHistory((s) => s.redo);
  const snapEnabled = useUIStore((s) => s.snapEnabled);
  const toggleSnap = useUIStore((s) => s.toggleSnap);
  const bottomPanelVisible = useUIStore((s) => s.bottomPanelVisible);
  const toggleBottomPanel = useUIStore((s) => s.toggleBottomPanel);
  const bottomPanelMode = useUIStore((s) => s.bottomPanelMode);
  const setBottomPanelMode = useUIStore((s) => s.setBottomPanelMode);
  const transportState = useTransportStore((s) => s.state);

  // Sync browser title with project name
  useEffect(() => {
    document.title = `${projectName} — DAW`;
  }, [projectName]);

  const handleSave = useCallback(async () => {
    const project = useProjectStore.getState().project;
    await saveProject(project);
  }, []);

  const handleExportWAV = useCallback(async () => {
    const project = useProjectStore.getState().project;
    const blob = await bounceProject(project, new Map());
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleRename = useCallback(() => {
    const current = useProjectStore.getState().project.name;
    const name = window.prompt("Project name:", current);
    if (name && name.trim() && name.trim() !== current) {
      useCommandHistory.getState().execute(new SetProjectNameCommand(name.trim()));
    }
  }, []);

  const handleAddTrack = useCallback((type: "midi" | "audio") => {
    useCommandHistory.getState().execute(new CreateTrackCommand(type));
  }, []);

  const menus: MenuDefinition[] = [
    {
      label: "File",
      items: [
        { label: "New Project", shortcut: "Ctrl+N", action: onNewProject },
        { label: "Open Project…", shortcut: "Ctrl+O", action: onOpenProjects },
        { separator: true },
        { label: "Save", shortcut: "Ctrl+S", action: handleSave },
        { label: "Rename Project…", action: handleRename },
        { separator: true },
        { label: "Export as WAV", shortcut: "Ctrl+Shift+E", action: handleExportWAV },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", shortcut: "Ctrl+Z", action: undo, disabled: !canUndo },
        { label: "Redo", shortcut: "Ctrl+Shift+Z", action: redo, disabled: !canRedo },
        { separator: true },
        {
          label: snapEnabled ? "Disable Snap" : "Enable Snap",
          action: toggleSnap,
        },
      ],
    },
    {
      label: "Track",
      items: [
        { label: "Add MIDI Track", action: () => handleAddTrack("midi") },
        { label: "Add Audio Track", action: () => handleAddTrack("audio") },
      ],
    },
    {
      label: "View",
      items: [
        {
          label: bottomPanelVisible ? "Hide Bottom Panel" : "Show Bottom Panel",
          action: toggleBottomPanel,
        },
        { separator: true },
        {
          label: "Instrument",
          action: () => { if (!bottomPanelVisible) toggleBottomPanel(); setBottomPanelMode("plugin"); },
          disabled: bottomPanelVisible && bottomPanelMode === "plugin",
        },
        {
          label: "Editor",
          action: () => { if (!bottomPanelVisible) toggleBottomPanel(); setBottomPanelMode("editor"); },
          disabled: bottomPanelVisible && bottomPanelMode === "editor",
        },
        {
          label: "Mixer",
          action: () => { if (!bottomPanelVisible) toggleBottomPanel(); setBottomPanelMode("mixer"); },
          disabled: bottomPanelVisible && bottomPanelMode === "mixer",
        },
      ],
    },
    {
      label: "Transport",
      items: [
        {
          label: transportState === "playing" ? "Pause" : "Play",
          shortcut: "Space",
          action: () => {
            const t = useTransportStore.getState();
            t.state === "playing" ? t.pause() : t.play();
          },
        },
        {
          label: "Stop",
          action: () => useTransportStore.getState().stop(),
        },
        { separator: true },
        {
          label: "Toggle Loop",
          action: () => useTransportStore.getState().toggleLoop(),
        },
      ],
    },
  ];

  // Close on outside click
  useEffect(() => {
    if (!openMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
        setHovering(false);
      }
    };
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [openMenu]);

  // Close on Escape
  useEffect(() => {
    if (!openMenu) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setHovering(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [openMenu]);

  const handleMenuClick = (label: string) => {
    if (openMenu === label) {
      setOpenMenu(null);
      setHovering(false);
    } else {
      setOpenMenu(label);
      setHovering(true);
    }
  };

  const handleMenuEnter = (label: string) => {
    if (hovering && openMenu) {
      setOpenMenu(label);
    }
  };

  const handleItemClick = (item: MenuItem) => {
    if (item.disabled) return;
    item.action?.();
    setOpenMenu(null);
    setHovering(false);
  };

  return (
    <div ref={barRef} className="relative flex shrink-0 items-center bg-synth-bg/80 border-b border-synth-border">
      {menus.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            onClick={() => handleMenuClick(menu.label)}
            onPointerEnter={() => handleMenuEnter(menu.label)}
            className={`px-3 py-1.5 text-xs transition-colors ${
              openMenu === menu.label
                ? "bg-synth-surface text-synth-text"
                : "text-synth-muted hover:bg-synth-surface/50 hover:text-synth-text"
            }`}
          >
            {menu.label}
          </button>

          {openMenu === menu.label && (
            <div className="absolute left-0 top-full z-50 min-w-[200px] border border-synth-border bg-synth-bg py-1 shadow-xl">
              {menu.items.map((item, i) =>
                item.separator ? (
                  <div key={i} className="mx-2 my-1 h-px bg-synth-border" />
                ) : (
                  <button
                    key={item.label}
                    onClick={() => handleItemClick(item)}
                    disabled={item.disabled}
                    className="flex w-full items-center justify-between px-4 py-1.5 text-left text-xs transition-colors hover:bg-synth-accent/20 hover:text-synth-text disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <span className={item.disabled ? "text-synth-muted" : "text-synth-text"}>
                      {item.label}
                    </span>
                    {item.shortcut && (
                      <span className="ml-6 text-[10px] text-synth-muted">
                        {item.shortcut}
                      </span>
                    )}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}

      {/* Right side: undo/redo + project name */}
      <div className="ml-auto flex items-center gap-2 px-3">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="rounded p-1 text-synth-muted transition-colors hover:bg-synth-surface hover:text-synth-text disabled:opacity-30"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={13} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="rounded p-1 text-synth-muted transition-colors hover:bg-synth-surface hover:text-synth-text disabled:opacity-30"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 size={13} />
        </button>

        <div className="mx-1 h-4 w-px bg-synth-border" />

        {editingName ? (
          <input
            ref={nameInputRef}
            defaultValue={projectName}
            autoFocus
            className="bg-synth-bg text-xs text-synth-text border border-synth-border rounded px-2 py-0.5 outline-none focus:border-synth-accent"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== projectName) {
                useCommandHistory.getState().execute(new SetProjectNameCommand(v));
              }
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
            className="text-xs text-synth-muted cursor-pointer hover:text-synth-text transition-colors"
            onDoubleClick={() => setEditingName(true)}
            title="Double-click to rename"
          >
            {projectName}
          </div>
        )}
      </div>
    </div>
  );
}
