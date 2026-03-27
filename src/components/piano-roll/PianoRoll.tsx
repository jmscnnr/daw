"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useUIStore } from "@/stores/ui-store";
import { usePluginActions } from "@/hooks/use-plugin-actions";
import { PPQ } from "@/lib/constants";
import type { Clip, MidiNote } from "@/types/project";

const KEY_WIDTH = 48;
const NOTE_HEIGHT = 14;
const MIN_NOTE = 36; // C2
const MAX_NOTE = 96; // C7
const TOTAL_KEYS = MAX_NOTE - MIN_NOTE;
const HEADER_HEIGHT = 24;

const GRID_DIVISIONS = [
  { label: "1/4", ticks: PPQ },
  { label: "1/8", ticks: PPQ / 2 },
  { label: "1/8T", ticks: PPQ / 3 },
  { label: "1/16", ticks: PPQ / 4 },
  { label: "1/16T", ticks: PPQ / 6 },
  { label: "1/32", ticks: PPQ / 8 },
] as const;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function isBlackKey(note: number): boolean {
  const n = note % 12;
  return n === 1 || n === 3 || n === 6 || n === 8 || n === 10;
}

function noteName(note: number): string {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

interface PianoRollProps {
  clip: Clip;
  trackId: string;
}

export function PianoRoll({ clip, trackId }: PianoRollProps) {
  const isMidiClip = clip.content.type === "midi";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const keysCanvasRef = useRef<HTMLCanvasElement>(null);
  const keysContainerRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState((TOTAL_KEYS * NOTE_HEIGHT) / 2 - 150);
  const [zoom, setZoom] = useState(80); // pixels per beat
  const [gridDivisionIndex, setGridDivisionIndex] = useState(3); // default 1/16
  const [quantizeStrength, setQuantizeStrength] = useState(100);
  const [quantizeSwing, setQuantizeSwing] = useState(0);
  const [showQuantize, setShowQuantize] = useState(false);
  const dragRef = useRef<{
    type: "draw" | "move" | "resize";
    noteIndex?: number;
    startNote: number;
    startTick: number;
    currentTick: number;
    active: boolean;
  } | null>(null);

  const addNote = useProjectStore((s) => s.addNoteToClip);
  const removeNote = useProjectStore((s) => s.removeNoteFromClip);
  const updateNote = useProjectStore((s) => s.updateNoteInClip);
  const quantizeNotes = useProjectStore((s) => s.quantizeClipNotes);
  const { sendMidiToTrack } = usePluginActions();
  const previewNoteRef = useRef<number | null>(null);
  const gridPreviewNoteRef = useRef<number | null>(null);

  // Preview: play a note through the track's instrument
  const previewNoteOn = useCallback(
    (note: number) => {
      // Stop previous preview if pitch changed
      if (gridPreviewNoteRef.current !== null && gridPreviewNoteRef.current !== note) {
        sendMidiToTrack(trackId, { type: "noteOff", note: gridPreviewNoteRef.current, velocity: 0, time: 0 });
      }
      gridPreviewNoteRef.current = note;
      sendMidiToTrack(trackId, { type: "noteOn", note, velocity: 0.8, time: 0 });
    },
    [trackId, sendMidiToTrack],
  );

  const previewNoteOff = useCallback(() => {
    if (gridPreviewNoteRef.current !== null) {
      sendMidiToTrack(trackId, { type: "noteOff", note: gridPreviewNoteRef.current, velocity: 0, time: 0 });
      gridPreviewNoteRef.current = null;
    }
  }, [trackId, sendMidiToTrack]);

  const pixelsPerTick = zoom / PPQ;
  const quantizeTicks = GRID_DIVISIONS[gridDivisionIndex]!.ticks;

  const snapToGrid = useCallback(
    (tick: number) => Math.round(tick / quantizeTicks) * quantizeTicks,
    [quantizeTicks],
  );

  const yForNote = useCallback(
    (note: number) => HEADER_HEIGHT + (MAX_NOTE - note - 1) * NOTE_HEIGHT - scrollY,
    [scrollY],
  );

  const noteForY = useCallback(
    (y: number) => MAX_NOTE - 1 - Math.floor((y - HEADER_HEIGHT + scrollY) / NOTE_HEIGHT),
    [scrollY],
  );

  // x is relative to the grid container (keys are separate)
  const tickForX = useCallback((x: number) => x / pixelsPerTick, [pixelsPerTick]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const { project } = useProjectStore.getState();
    const beatsPerBar = project.timeSignature.numerator;
    const ticksPerBeat = PPQ;
    const ticksPerBar = ticksPerBeat * beatsPerBar;

    const track = project.tracks.find((t) => t.id === trackId);
    const currentClip = track?.clips.find((c) => c.id === clip.id);
    const currentNotes = currentClip?.content.type === "midi" ? currentClip.content.notes : [];
    const currentDuration = currentClip?.durationTicks ?? clip.durationTicks;
    const currentGridWidth = currentDuration * pixelsPerTick;
    const clipColor = currentClip?.color ?? track?.color ?? "#5cabff";

    // Background
    ctx.fillStyle = "#1a1a26";
    ctx.fillRect(0, 0, width, height);

    // Header / beat ruler
    ctx.fillStyle = "#222233";
    ctx.fillRect(0, 0, width, HEADER_HEIGHT);

    // Beat/bar markers
    for (let tick = 0; tick <= currentDuration; tick += ticksPerBeat) {
      const x = tick * pixelsPerTick;
      if (x > width) break;

      const isBar = tick % ticksPerBar === 0;
      ctx.strokeStyle = isBar ? "#594d5e" : "#3a3440";
      ctx.lineWidth = isBar ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      if (isBar) {
        const barNum = Math.floor(tick / ticksPerBar) + 1;
        ctx.fillStyle = "#b0a8b8";
        ctx.font = "10px monospace";
        ctx.fillText(`${barNum}`, x + 3, 14);
      }
    }

    // Header separator
    ctx.strokeStyle = "#3a3440";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_HEIGHT);
    ctx.lineTo(width, HEADER_HEIGHT);
    ctx.stroke();

    // Piano key rows (horizontal stripes)
    for (let note = MIN_NOTE; note < MAX_NOTE; note++) {
      const y = yForNote(note);
      if (y + NOTE_HEIGHT < HEADER_HEIGHT || y > height) continue;

      const black = isBlackKey(note);
      ctx.fillStyle = black ? "#1e1e2a" : "#24243a";
      ctx.fillRect(0, y, width, NOTE_HEIGHT);

      ctx.strokeStyle = note % 12 === 0 ? "#444460" : "#2a2a38";
      ctx.lineWidth = note % 12 === 0 ? 0.8 : 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + NOTE_HEIGHT);
      ctx.lineTo(width, y + NOTE_HEIGHT);
      ctx.stroke();
    }

    // 16th note grid lines
    for (let tick = 0; tick <= currentDuration; tick += quantizeTicks) {
      const x = tick * pixelsPerTick;
      if (x > width) break;
      if (tick % ticksPerBeat === 0) continue; // already drawn

      ctx.strokeStyle = "#2a2a38";
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(x, HEADER_HEIGHT);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw MIDI notes
    for (let i = 0; i < currentNotes.length; i++) {
      const n = currentNotes[i]!;
      const nx = n.startTick * pixelsPerTick;
      const ny = yForNote(n.note);
      const nw = Math.max(n.durationTicks * pixelsPerTick, 2);

      if (ny + NOTE_HEIGHT < HEADER_HEIGHT || ny > height) continue;
      if (nx + nw < 0 || nx > width) continue;

      // Note body
      ctx.fillStyle = clipColor + "cc";
      ctx.fillRect(nx, ny + 1, nw, NOTE_HEIGHT - 2);

      // Note border
      ctx.strokeStyle = clipColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(nx, ny + 1, nw, NOTE_HEIGHT - 2);

      // Velocity indicator
      const velAlpha = Math.round(n.velocity * 255).toString(16).padStart(2, "0");
      ctx.fillStyle = `#ffffff${velAlpha}`;
      ctx.fillRect(nx, ny + 1, 2, NOTE_HEIGHT - 2);

      // Resize handle on right edge
      ctx.fillStyle = clipColor;
      ctx.fillRect(nx + nw - 3, ny + 1, 3, NOTE_HEIGHT - 2);
    }

    // Draw preview note while drawing
    if (dragRef.current?.type === "draw" && dragRef.current.active) {
      const d = dragRef.current;
      const drawStart = Math.min(d.startTick, d.currentTick);
      const drawEnd = Math.max(d.startTick, d.currentTick);
      const duration = Math.max(drawEnd - drawStart, quantizeTicks);
      const px = drawStart * pixelsPerTick;
      const py = yForNote(d.startNote);
      const pw = duration * pixelsPerTick;

      ctx.fillStyle = clipColor + "80";
      ctx.fillRect(px, py + 1, pw, NOTE_HEIGHT - 2);
      ctx.strokeStyle = clipColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py + 1, pw, NOTE_HEIGHT - 2);
    }

    // Right boundary of clip
    ctx.strokeStyle = "#ff6b6b80";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(currentGridWidth, HEADER_HEIGHT);
    ctx.lineTo(currentGridWidth, height);
    ctx.stroke();

    // Render piano keys on separate canvas
    const keysCanvas = keysCanvasRef.current;
    const keysContainer = keysContainerRef.current;
    if (keysCanvas && keysContainer) {
      const kRect = keysContainer.getBoundingClientRect();
      keysCanvas.width = KEY_WIDTH * dpr;
      keysCanvas.height = kRect.height * dpr;
      keysCanvas.style.width = `${KEY_WIDTH}px`;
      keysCanvas.style.height = `${kRect.height}px`;

      const kctx = keysCanvas.getContext("2d");
      if (kctx) {
        kctx.scale(dpr, dpr);

        kctx.fillStyle = "#181825";
        kctx.fillRect(0, 0, KEY_WIDTH, kRect.height);

        // Header area
        kctx.fillStyle = "#222233";
        kctx.fillRect(0, 0, KEY_WIDTH, HEADER_HEIGHT);

        for (let note = MIN_NOTE; note < MAX_NOTE; note++) {
          const y = yForNote(note);
          if (y + NOTE_HEIGHT < HEADER_HEIGHT || y > kRect.height) continue;

          const black = isBlackKey(note);
          kctx.fillStyle = black ? "#282838" : "#363650";
          kctx.fillRect(0, y, KEY_WIDTH, NOTE_HEIGHT);

          kctx.strokeStyle = "#1a1a28";
          kctx.lineWidth = 0.5;
          kctx.beginPath();
          kctx.moveTo(0, y + NOTE_HEIGHT);
          kctx.lineTo(KEY_WIDTH, y + NOTE_HEIGHT);
          kctx.stroke();

          if (!black) {
            kctx.fillStyle = note % 12 === 0 ? "#b0a8b8" : "#666680";
            kctx.font = "9px monospace";
            kctx.fillText(noteName(note), 4, y + NOTE_HEIGHT - 3);
          }
        }

        // Right border
        kctx.strokeStyle = "#3a3440";
        kctx.lineWidth = 1;
        kctx.beginPath();
        kctx.moveTo(KEY_WIDTH - 0.5, 0);
        kctx.lineTo(KEY_WIDTH - 0.5, kRect.height);
        kctx.stroke();
      }
    }
  }, [clip.durationTicks, clip.id, pixelsPerTick, quantizeTicks, trackId, yForNote]);

  useEffect(() => {
    render();

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => render());
    observer.observe(container);
    const unsub = useProjectStore.subscribe(() => render());

    return () => {
      observer.disconnect();
      unsub();
    };
  }, [render]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (y < HEADER_HEIGHT) return;

      const note = noteForY(y);
      if (note < MIN_NOTE || note >= MAX_NOTE) return;

      const rawTick = tickForX(x);
      const tick = snapToGrid(rawTick);

      // Check if we clicked on an existing note
      const { project } = useProjectStore.getState();
      const track = project.tracks.find((t) => t.id === trackId);
      const currentClip = track?.clips.find((c) => c.id === clip.id);
      const currentNotes =
        currentClip?.content.type === "midi" ? currentClip.content.notes : [];

      for (let i = 0; i < currentNotes.length; i++) {
        const n = currentNotes[i]!;
        if (
          note === n.note &&
          rawTick >= n.startTick &&
          rawTick <= n.startTick + n.durationTicks
        ) {
          // Right-click or ctrl+click to delete
          if (e.button === 2 || e.ctrlKey) {
            e.preventDefault();
            removeNote(trackId, clip.id, i);
            render();
            return;
          }

          previewNoteOn(n.note);

          // Check if near right edge for resize
          const noteRightX = (n.startTick + n.durationTicks) * pixelsPerTick;
          if (Math.abs(x - noteRightX) < 8) {
            dragRef.current = {
              type: "resize",
              noteIndex: i,
              startNote: n.note,
              startTick: n.startTick,
              currentTick: tick,
              active: true,
            };
          } else {
            dragRef.current = {
              type: "move",
              noteIndex: i,
              startNote: n.note,
              startTick: n.startTick,
              currentTick: tick,
              active: true,
            };
          }
          container.setPointerCapture(e.pointerId);
          return;
        }
      }

      // Drawing a new note — reject if starting beyond clip bounds
      const clipDuration = currentClip?.durationTicks ?? clip.durationTicks;
      if (e.button === 0 && tick >= 0 && tick < clipDuration) {
        previewNoteOn(note);
        dragRef.current = {
          type: "draw",
          startNote: note,
          startTick: tick,
          currentTick: Math.min(tick + quantizeTicks, clipDuration),
          active: true,
        };
        container.setPointerCapture(e.pointerId);
      }
    },
    [
      trackId,
      clip.id,
      clip.durationTicks,
      render,
      removeNote,
      pixelsPerTick,
      quantizeTicks,
      previewNoteOn,
      noteForY,
      snapToGrid,
      tickForX,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const container = containerRef.current;
      if (!container || !dragRef.current?.active) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const rawTick = tickForX(x);
      const tick = snapToGrid(rawTick);
      const note = noteForY(y);

      const d = dragRef.current;

      // Get clip duration for clamping
      const { project } = useProjectStore.getState();
      const track = project.tracks.find((t) => t.id === trackId);
      const currentClip = track?.clips.find((c) => c.id === clip.id);
      const clipDuration = currentClip?.durationTicks ?? clip.durationTicks;

      if (d.type === "draw") {
        d.currentTick = Math.max(0, Math.min(tick, clipDuration));
        render();
      } else if (d.type === "resize" && d.noteIndex !== undefined) {
        const currentNotes =
          currentClip?.content.type === "midi" ? currentClip.content.notes : [];
        const n = currentNotes[d.noteIndex];
        if (!n) return;
        const maxDuration = clipDuration - n.startTick;
        const newDuration = Math.max(quantizeTicks, Math.min(snapToGrid(rawTick) - d.startTick, maxDuration));
        updateNote(trackId, clip.id, d.noteIndex, { durationTicks: newDuration });
      } else if (d.type === "move" && d.noteIndex !== undefined) {
        const tickDelta = tick - d.currentTick;
        const noteDelta = note - d.startNote;

        const currentNotes =
          currentClip?.content.type === "midi" ? currentClip.content.notes : [];
        const n = currentNotes[d.noteIndex];
        if (!n) return;

        let newStart = Math.max(0, n.startTick + tickDelta);
        // Clamp so note doesn't extend past clip end
        newStart = Math.min(newStart, clipDuration - n.durationTicks);
        newStart = Math.max(0, newStart);
        const newNote = Math.max(MIN_NOTE, Math.min(MAX_NOTE - 1, n.note + noteDelta));

        // Preview pitch change
        if (newNote !== n.note) {
          previewNoteOn(newNote);
        }

        updateNote(trackId, clip.id, d.noteIndex, {
          startTick: newStart,
          note: newNote,
        });

        d.currentTick = tick;
        d.startNote = note;
      }
    },
    [
      trackId,
      clip.id,
      clip.durationTicks,
      render,
      updateNote,
      quantizeTicks,
      previewNoteOn,
      noteForY,
      snapToGrid,
      tickForX,
    ],
  );

  const handlePointerUp = useCallback(
    () => {
      const d = dragRef.current;
      if (!d?.active) return;

      if (d.type === "draw") {
        // Get current clip duration for clamping
        const { project } = useProjectStore.getState();
        const track = project.tracks.find((t) => t.id === trackId);
        const currentClip = track?.clips.find((c) => c.id === clip.id);
        const clipDuration = currentClip?.durationTicks ?? clip.durationTicks;

        const drawStart = Math.max(0, Math.min(d.startTick, d.currentTick));
        const drawEnd = Math.min(Math.max(d.startTick, d.currentTick), clipDuration);
        const duration = Math.max(drawEnd - drawStart, quantizeTicks);

        // Only add if the note fits within clip bounds
        if (drawStart >= 0 && drawStart + duration <= clipDuration) {
          const newNote: MidiNote = {
            note: d.startNote,
            velocity: 0.8,
            startTick: drawStart,
            durationTicks: duration,
          };
          addNote(trackId, clip.id, newNote);
        }
      }

      previewNoteOff();
      dragRef.current = null;
      render();
    },
    [trackId, clip.id, clip.durationTicks, addNote, render, quantizeTicks, previewNoteOff],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        setZoom((z) => Math.max(20, Math.min(300, z + delta)));
      } else {
        setScrollY((s) =>
          Math.max(0, Math.min(TOTAL_KEYS * NOTE_HEIGHT - 200, s + e.deltaY)),
        );
      }
    },
    [],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Piano key preview handlers — clicking keys plays the instrument
  const handleKeyPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const container = keysContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const note = noteForY(y);
      if (note < MIN_NOTE || note >= MAX_NOTE) return;

      previewNoteRef.current = note;
      sendMidiToTrack(trackId, {
        type: "noteOn",
        note,
        velocity: 0.8,
        time: 0,
      });
      container.setPointerCapture(e.pointerId);
    },
    [trackId, sendMidiToTrack, noteForY],
  );

  const handleKeyPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (previewNoteRef.current === null) return;
      const container = keysContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const note = noteForY(y);

      if (note !== previewNoteRef.current && note >= MIN_NOTE && note < MAX_NOTE) {
        // Note off for the old note
        sendMidiToTrack(trackId, {
          type: "noteOff",
          note: previewNoteRef.current,
          velocity: 0,
          time: 0,
        });
        // Note on for the new note
        previewNoteRef.current = note;
        sendMidiToTrack(trackId, {
          type: "noteOn",
          note,
          velocity: 0.8,
          time: 0,
        });
      }
    },
    [trackId, sendMidiToTrack, noteForY],
  );

  const handleKeyPointerUp = useCallback(
    () => {
      if (previewNoteRef.current !== null) {
        sendMidiToTrack(trackId, {
          type: "noteOff",
          note: previewNoteRef.current,
          velocity: 0,
          time: 0,
        });
        previewNoteRef.current = null;
      }
    },
    [trackId, sendMidiToTrack],
  );

  if (!isMidiClip) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-synth-muted">
        Not a MIDI clip
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-synth-bg">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-synth-border px-3 py-1 shrink-0">
        <span className="text-xs text-synth-muted">
          Editing: <span className="text-synth-text">{clip.name}</span>
        </span>
        <div className="flex items-center gap-1 ml-2">
          <span className="text-[10px] text-synth-muted">Grid:</span>
          <select
            value={gridDivisionIndex}
            onChange={(e) => setGridDivisionIndex(Number(e.target.value))}
            className="h-5 rounded border border-synth-border bg-synth-surface px-1 text-[10px] text-synth-text"
          >
            {GRID_DIVISIONS.map((d, i) => (
              <option key={d.label} value={i}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowQuantize((v) => !v)}
          className={`rounded border px-2 py-0.5 text-[10px] ${
            showQuantize
              ? "border-synth-accent bg-synth-accent/20 text-synth-accent"
              : "border-synth-border bg-synth-surface text-synth-muted hover:text-synth-text"
          }`}
        >
          Quantize
        </button>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] text-synth-muted">Zoom:</span>
          <input
            type="range"
            min={20}
            max={300}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1 w-20"
          />
        </div>
        <button
          onClick={() => useUIStore.getState().setEditingClip(null)}
          className="rounded border border-synth-border bg-synth-surface px-2 py-0.5 text-[10px] text-synth-muted hover:text-synth-text"
        >
          Close
        </button>
      </div>

      {/* Quantize panel */}
      {showQuantize && (
        <div className="flex items-center gap-4 border-b border-synth-border bg-synth-surface/50 px-3 py-1.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-synth-muted">Strength:</span>
            <input
              type="range"
              min={0}
              max={100}
              value={quantizeStrength}
              onChange={(e) => setQuantizeStrength(Number(e.target.value))}
              className="h-1 w-20"
            />
            <span className="text-[10px] text-synth-text w-7 text-right">{quantizeStrength}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-synth-muted">Swing:</span>
            <input
              type="range"
              min={0}
              max={100}
              value={quantizeSwing}
              onChange={(e) => setQuantizeSwing(Number(e.target.value))}
              className="h-1 w-20"
            />
            <span className="text-[10px] text-synth-text w-7 text-right">{quantizeSwing}%</span>
          </div>
          <button
            onClick={() =>
              quantizeNotes(
                trackId,
                clip.id,
                quantizeTicks,
                quantizeStrength / 100,
                quantizeSwing / 100,
              )
            }
            className="rounded border border-synth-accent bg-synth-accent/20 px-3 py-0.5 text-[10px] text-synth-accent hover:bg-synth-accent/30"
          >
            Apply
          </button>
        </div>
      )}

      {/* Piano roll area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Piano keys — click to preview notes */}
        <div
          ref={keysContainerRef}
          className="shrink-0 overflow-hidden cursor-pointer"
          style={{ width: KEY_WIDTH }}
          onPointerDown={handleKeyPointerDown}
          onPointerMove={handleKeyPointerMove}
          onPointerUp={handleKeyPointerUp}
          onPointerCancel={handleKeyPointerUp}
        >
          <canvas ref={keysCanvasRef} className="pointer-events-none" />
        </div>

        {/* Note grid */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden cursor-crosshair"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
        >
          <canvas ref={canvasRef} className="pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
