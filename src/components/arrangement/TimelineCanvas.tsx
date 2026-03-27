"use client";

import { useRef, useEffect, useCallback } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useTransportStore } from "@/stores/transport-store";
import { useUIStore } from "@/stores/ui-store";
import { useCommandHistory } from "@/stores/command-history";
import { AddClipCommand, SplitClipCommand } from "@/commands/clip-commands";
import { cloneProject, createProjectSnapshotCommand } from "@/commands/project-command-base";
import { PPQ } from "@/lib/constants";
import type { Project } from "@/types/project";
import { TRACK_HEIGHT } from "./TrackHeader";

const RULER_HEIGHT = 28;

type DragMode =
  | { type: "scrub" }
  | { type: "clip"; clipId: string; trackId: string; offsetTick: number }
  | { type: "clip-resize"; clipId: string; trackId: string; minDuration: number }
  | { type: "loop-region"; anchorTick: number }
  | { type: "loop-adjust"; edge: "start" | "end" }
  | null;

const RESIZE_HANDLE_PX = 6;

type TimelineProjectSlice = {
  bpm: number;
  timeSignatureNumerator: number;
  tracks: Array<{
    id: string;
    color: string;
    clips: Project["tracks"][number]["clips"];
  }>;
};

type TimelineUISlice = {
  horizontalZoom: number;
  scrollX: number;
  scrollY: number;
  selectedClipIds: string[];
};

type TimelineTransportSlice = {
  state: ReturnType<typeof useTransportStore.getState>["state"];
  positionTicks: number;
  loopEnabled: boolean;
  loopRegion: ReturnType<typeof useTransportStore.getState>["loopRegion"];
};

function selectTimelineProjectSlice(state: { project: Project }): TimelineProjectSlice {
  return {
    bpm: state.project.bpm,
    timeSignatureNumerator: state.project.timeSignature.numerator,
    tracks: state.project.tracks.map((track) => ({
      id: track.id,
      color: track.color,
      clips: track.clips,
    })),
  };
}

function areTimelineProjectSlicesEqual(
  previous: TimelineProjectSlice,
  next: TimelineProjectSlice,
): boolean {
  if (
    previous.bpm !== next.bpm ||
    previous.timeSignatureNumerator !== next.timeSignatureNumerator ||
    previous.tracks.length !== next.tracks.length
  ) {
    return false;
  }

  return previous.tracks.every((track, index) => {
    const nextTrack = next.tracks[index];
    return (
      nextTrack !== undefined &&
      track.id === nextTrack.id &&
      track.color === nextTrack.color &&
      track.clips === nextTrack.clips
    );
  });
}

function selectTimelineUISlice(state: ReturnType<typeof useUIStore.getState>): TimelineUISlice {
  return {
    horizontalZoom: state.horizontalZoom,
    scrollX: state.scrollX,
    scrollY: state.scrollY,
    selectedClipIds: state.selectedClipIds,
  };
}

function areTimelineUISlicesEqual(previous: TimelineUISlice, next: TimelineUISlice): boolean {
  return (
    previous.horizontalZoom === next.horizontalZoom &&
    previous.scrollX === next.scrollX &&
    previous.scrollY === next.scrollY &&
    previous.selectedClipIds.length === next.selectedClipIds.length &&
    previous.selectedClipIds.every((clipId, index) => clipId === next.selectedClipIds[index])
  );
}

function selectTimelineTransportSlice(
  state: ReturnType<typeof useTransportStore.getState>,
): TimelineTransportSlice {
  return {
    state: state.state,
    positionTicks: state.positionTicks,
    loopEnabled: state.loopEnabled,
    loopRegion: state.loopRegion,
  };
}

function areTimelineTransportSlicesEqual(
  previous: TimelineTransportSlice,
  next: TimelineTransportSlice,
): boolean {
  return (
    previous.state === next.state &&
    previous.positionTicks === next.positionTicks &&
    previous.loopEnabled === next.loopEnabled &&
    previous.loopRegion?.startTick === next.loopRegion?.startTick &&
    previous.loopRegion?.endTick === next.loopRegion?.endTick
  );
}

function renderTimeline(canvas: HTMLCanvasElement, container: HTMLDivElement) {
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
  const { positionTicks } = useTransportStore.getState();
  const { horizontalZoom, scrollX, scrollY, selectedClipIds } = useUIStore.getState();

  const pixelsPerTick = horizontalZoom / PPQ;
  const beatsPerBar = project.timeSignature.numerator;
  const ticksPerBeat = PPQ;
  const ticksPerBar = ticksPerBeat * beatsPerBar;
  const bpm = project.bpm;

  // Helper: convert tick to time string (m:ss.t)
  const tickToTimeStr = (tick: number): string => {
    const seconds = (tick / PPQ) * (60 / bpm);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs.toFixed(1)}`;
  };

  // Clear
  ctx.fillStyle = "#1c1c28";
  ctx.fillRect(0, 0, width, height);

  // --- Time Ruler ---
  ctx.fillStyle = "#222233";
  ctx.fillRect(0, 0, width, RULER_HEIGHT);

  const startTick = scrollX;
  const endTick = scrollX + width / pixelsPerTick;

  const firstBar = Math.floor(startTick / ticksPerBar);
  const lastBar = Math.ceil(endTick / ticksPerBar);

  for (let bar = firstBar; bar <= lastBar; bar++) {
    for (let beat = 0; beat < beatsPerBar; beat++) {
      const tick = bar * ticksPerBar + beat * ticksPerBeat;
      const x = (tick - scrollX) * pixelsPerTick;
      if (x < 0 || x > width) continue;

      if (beat === 0) {
        ctx.strokeStyle = "#594d5e";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        // Bar number
        ctx.fillStyle = "#b0a8b8";
        ctx.font = "10px monospace";
        ctx.fillText(`${bar + 1}`, x + 3, 12);

        // Time label
        ctx.fillStyle = "#7a7484";
        ctx.font = "8px monospace";
        ctx.fillText(tickToTimeStr(tick), x + 3, 23);
      } else {
        ctx.strokeStyle = "#3a3440";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, RULER_HEIGHT);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }
  }

  ctx.strokeStyle = "#3a3440";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RULER_HEIGHT);
  ctx.lineTo(width, RULER_HEIGHT);
  ctx.stroke();

  // --- Track Lanes (clipped below ruler) ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, RULER_HEIGHT, width, height - RULER_HEIGHT);
  ctx.clip();

  const tracks = project.tracks;
  for (let i = 0; i < tracks.length; i++) {
    const y = RULER_HEIGHT + i * TRACK_HEIGHT - scrollY;
    if (y + TRACK_HEIGHT < RULER_HEIGHT) continue; // above viewport
    if (y > height) break;

    if (i % 2 === 1) {
      ctx.fillStyle = "rgba(255,255,255,0.015)";
      ctx.fillRect(0, y, width, TRACK_HEIGHT);
    }

    ctx.strokeStyle = "#2a2a35";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y + TRACK_HEIGHT);
    ctx.lineTo(width, y + TRACK_HEIGHT);
    ctx.stroke();

    const track = tracks[i]!;
    for (const clip of track.clips) {
      const clipX = (clip.startTick - scrollX) * pixelsPerTick;
      const clipW = clip.durationTicks * pixelsPerTick;

      if (clipX + clipW < 0 || clipX > width) continue;

      const clipColor = clip.color ?? track.color;

      ctx.fillStyle = clipColor + "40";
      ctx.fillRect(clipX, y + 2, clipW, TRACK_HEIGHT - 4);

      const isClipSelected = selectedClipIds.includes(clip.id);
      ctx.strokeStyle = isClipSelected ? "#ffffff" : clipColor + "80";
      ctx.lineWidth = isClipSelected ? 2 : 1;
      ctx.strokeRect(clipX, y + 2, clipW, TRACK_HEIGHT - 4);

      // Resize handle on right edge
      ctx.fillStyle = clipColor + "60";
      ctx.fillRect(clipX + clipW - RESIZE_HANDLE_PX, y + 2, RESIZE_HANDLE_PX, TRACK_HEIGHT - 4);

      ctx.fillStyle = "#ddd";
      ctx.font = "9px monospace";
      ctx.save();
      ctx.beginPath();
      ctx.rect(clipX + 2, y + 2, clipW - 4, TRACK_HEIGHT - 4);
      ctx.clip();
      ctx.fillText(clip.name, clipX + 4, y + 14);
      ctx.restore();

      if (clip.content.type === "midi" && clip.content.notes.length > 0) {
        const notes = clip.content.notes;
        let minNote = 127,
          maxNote = 0;
        for (const n of notes) {
          if (n.note < minNote) minNote = n.note;
          if (n.note > maxNote) maxNote = n.note;
        }
        const noteRange = Math.max(maxNote - minNote, 1);
        const noteAreaY = y + 18;
        const noteAreaH = TRACK_HEIGHT - 22;

        for (const n of notes) {
          const nx = clipX + (n.startTick / clip.durationTicks) * clipW;
          const nw = Math.max(
            (n.durationTicks / clip.durationTicks) * clipW,
            1,
          );
          const ny =
            noteAreaY + ((maxNote - n.note) / noteRange) * (noteAreaH - 2);
          ctx.fillStyle = clipColor + "cc";
          ctx.fillRect(nx, ny, nw, 2);
        }
      }
    }
  }

  ctx.restore(); // end track lanes clip

  // --- Loop Region ---
  const { loopEnabled, loopRegion } = useTransportStore.getState();
  if (loopEnabled && loopRegion) {
    const loopStartX = (loopRegion.startTick - scrollX) * pixelsPerTick;
    const loopEndX = (loopRegion.endTick - scrollX) * pixelsPerTick;
    const loopW = loopEndX - loopStartX;

    // Ruler highlight
    ctx.fillStyle = "rgba(80, 160, 255, 0.35)";
    ctx.fillRect(loopStartX, 0, loopW, RULER_HEIGHT);

    // Track area overlay
    ctx.fillStyle = "rgba(80, 160, 255, 0.06)";
    ctx.fillRect(loopStartX, RULER_HEIGHT, loopW, height - RULER_HEIGHT);

    // Loop boundary lines
    ctx.strokeStyle = "rgba(80, 160, 255, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(loopStartX, 0);
    ctx.lineTo(loopStartX, height);
    ctx.moveTo(loopEndX, 0);
    ctx.lineTo(loopEndX, height);
    ctx.stroke();

    // Loop start/end markers on ruler
    ctx.fillStyle = "rgba(80, 160, 255, 0.9)";
    // Left marker (triangle pointing right)
    ctx.beginPath();
    ctx.moveTo(loopStartX, 0);
    ctx.lineTo(loopStartX + 6, 0);
    ctx.lineTo(loopStartX, 8);
    ctx.closePath();
    ctx.fill();
    // Right marker (triangle pointing left)
    ctx.beginPath();
    ctx.moveTo(loopEndX, 0);
    ctx.lineTo(loopEndX - 6, 0);
    ctx.lineTo(loopEndX, 8);
    ctx.closePath();
    ctx.fill();
  }

  // --- Playhead ---
  const playheadX = (positionTicks - scrollX) * pixelsPerTick;
  if (playheadX >= 0 && playheadX <= width) {
    ctx.strokeStyle = "#e04040";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    ctx.fillStyle = "#e04040";
    ctx.beginPath();
    ctx.moveTo(playheadX - 5, 0);
    ctx.lineTo(playheadX + 5, 0);
    ctx.lineTo(playheadX, 8);
    ctx.closePath();
    ctx.fill();
  }
}

export function TimelineCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const dragStartProjectRef = useRef<Project | null>(null);
  const executeCommand = useCommandHistory((s) => s.execute);
  const commitCommand = useCommandHistory((s) => s.commit);

  // Use a ref for the animation loop to avoid self-reference issues
  const animateRef = useRef<() => void>(() => {});

  const dragRef = useRef<DragMode>(null);

  // Helpers
  const getTickFromX = useCallback((x: number) => {
    const { horizontalZoom, scrollX } = useUIStore.getState();
    const pixelsPerTick = horizontalZoom / PPQ;
    return scrollX + x / pixelsPerTick;
  }, []);

  const snapTick = useCallback((tick: number) => {
    const { snapEnabled } = useUIStore.getState();
    if (!snapEnabled) return tick;
    const ticksPerBeat = PPQ;
    // Snap to beat
    return Math.round(tick / ticksPerBeat) * ticksPerBeat;
  }, []);

  const findClipAt = useCallback((clickTick: number, trackIndex: number) => {
    const { project } = useProjectStore.getState();
    if (trackIndex < 0 || trackIndex >= project.tracks.length) return null;
    const track = project.tracks[trackIndex]!;
    for (const clip of track.clips) {
      if (clickTick >= clip.startTick && clickTick <= clip.startTick + clip.durationTicks) {
        return { clip, track };
      }
    }
    return null;
  }, []);

  // Double-click to create a clip or open existing one for editing
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (y < RULER_HEIGHT) return;

    const { project } = useProjectStore.getState();
    const beatsPerBar = project.timeSignature.numerator;
    const ticksPerBar = PPQ * beatsPerBar;

    const trackIndex = Math.floor((y - RULER_HEIGHT + useUIStore.getState().scrollY) / TRACK_HEIGHT);
    if (trackIndex < 0 || trackIndex >= project.tracks.length) return;

    const track = project.tracks[trackIndex]!;
    if (track.type !== "midi") return;

    const clickTick = getTickFromX(x);

    // Existing clip → open in piano roll
    const hit = findClipAt(clickTick, trackIndex);
    if (hit) {
      useUIStore.getState().setEditingClip(hit.clip.id);
      useUIStore.getState().setSelectedTrack(hit.track.id);
      return;
    }

    // Create new 1-bar MIDI clip snapped to bar
    const barStart = Math.floor(clickTick / ticksPerBar) * ticksPerBar;

    const overlaps = track.clips.some(
      (c) =>
        barStart < c.startTick + c.durationTicks &&
        barStart + ticksPerBar > c.startTick,
    );
    if (overlaps) return;

    const command = new AddClipCommand(track.id, {
      name: `${track.name} clip`,
      startTick: barStart,
      durationTicks: ticksPerBar,
      content: { type: "midi", notes: [] },
    });
    executeCommand(command);
    const clipId = command.getClipId();
    if (!clipId) return;

    useUIStore.getState().setSelectedTrack(track.id);
    useUIStore.getState().setEditingClip(clipId);
  }, [executeCommand, getTickFromX, findClipAt]);

  // Pointer down: start scrubbing playhead or dragging a clip
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clickTick = getTickFromX(x);

    // Ruler area
    if (y < RULER_HEIGHT) {
      // Right-click drag → set loop region
      if (e.button === 2) {
        const snapped = snapTick(clickTick);
        dragRef.current = { type: "loop-region", anchorTick: Math.max(0, Math.round(snapped)) };
        useTransportStore.getState().setLoopRegion(
          Math.max(0, Math.round(snapped)),
          Math.max(0, Math.round(snapped)),
        );
        container.setPointerCapture(e.pointerId);
        return;
      }

      // Left-click near loop boundary → adjust that boundary
      const { loopEnabled, loopRegion } = useTransportStore.getState();
      if (loopEnabled && loopRegion) {
        const { horizontalZoom, scrollX } = useUIStore.getState();
        const ppt = horizontalZoom / PPQ;
        const loopStartX = (loopRegion.startTick - scrollX) * ppt;
        const loopEndX = (loopRegion.endTick - scrollX) * ppt;
        const GRAB_TOLERANCE = 8;

        if (Math.abs(x - loopStartX) < GRAB_TOLERANCE) {
          container.style.cursor = "ew-resize";
          dragRef.current = { type: "loop-adjust", edge: "start" };
          container.setPointerCapture(e.pointerId);
          return;
        }
        if (Math.abs(x - loopEndX) < GRAB_TOLERANCE) {
          container.style.cursor = "ew-resize";
          dragRef.current = { type: "loop-adjust", edge: "end" };
          container.setPointerCapture(e.pointerId);
          return;
        }
      }

      // Left-click → scrub playhead
      dragRef.current = { type: "scrub" };
      const snapped = snapTick(clickTick);
      useTransportStore.getState().setPosition(Math.max(0, Math.round(snapped)));
      container.setPointerCapture(e.pointerId);
      return;
    }

    // Track lane area
    const { project } = useProjectStore.getState();
    const trackIndex = Math.floor((y - RULER_HEIGHT + useUIStore.getState().scrollY) / TRACK_HEIGHT);
    if (trackIndex < 0 || trackIndex >= project.tracks.length) return;

    const track = project.tracks[trackIndex]!;
    useUIStore.getState().setSelectedTrack(track.id);

    // Check if clicking on a clip
    const hit = findClipAt(clickTick, trackIndex);
    if (hit) {
      useUIStore.getState().setSelectedClips([hit.clip.id]);

      // Check if near right edge → resize
      const { horizontalZoom } = useUIStore.getState();
      const pixelsPerTick = horizontalZoom / PPQ;
      const clipRightX = (hit.clip.startTick + hit.clip.durationTicks - useUIStore.getState().scrollX) * pixelsPerTick;
      const nearRightEdge = Math.abs(x - clipRightX) < RESIZE_HANDLE_PX + 2;

      if (nearRightEdge) {
        dragStartProjectRef.current = cloneProject(useProjectStore.getState().project);
        container.style.cursor = "ew-resize";
        dragRef.current = {
          type: "clip-resize",
          clipId: hit.clip.id,
          trackId: hit.track.id,
          minDuration: PPQ,
        };
      } else {
        dragStartProjectRef.current = cloneProject(useProjectStore.getState().project);
        container.style.cursor = "grabbing";
        const offsetTick = clickTick - hit.clip.startTick;
        dragRef.current = {
          type: "clip",
          clipId: hit.clip.id,
          trackId: hit.track.id,
          offsetTick,
        };
      }
      container.setPointerCapture(e.pointerId);
      return;
    }

    // Clicked empty space → deselect clips
    useUIStore.getState().setSelectedClips([]);
  }, [getTickFromX, snapTick, findClipAt]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Update cursor based on hover position (only when not dragging)
    if (!dragRef.current) {
      const { project } = useProjectStore.getState();
      const { horizontalZoom, scrollX } = useUIStore.getState();
      const pixelsPerTick = horizontalZoom / PPQ;
      const trackIndex = Math.floor((y - RULER_HEIGHT + useUIStore.getState().scrollY) / TRACK_HEIGHT);

      let cursor = "default";
      if (y < RULER_HEIGHT) {
        cursor = "col-resize";
        // Show resize cursor near loop boundaries
        const { loopEnabled, loopRegion } = useTransportStore.getState();
        if (loopEnabled && loopRegion) {
          const loopStartX = (loopRegion.startTick - scrollX) * pixelsPerTick;
          const loopEndX = (loopRegion.endTick - scrollX) * pixelsPerTick;
          if (Math.abs(x - loopStartX) < 8 || Math.abs(x - loopEndX) < 8) {
            cursor = "ew-resize";
          }
        }
      } else if (trackIndex >= 0 && trackIndex < project.tracks.length) {
        const hoverTick = scrollX + x / pixelsPerTick;
        const track = project.tracks[trackIndex]!;
        for (const clip of track.clips) {
          if (hoverTick >= clip.startTick && hoverTick <= clip.startTick + clip.durationTicks) {
            const clipRightX = (clip.startTick + clip.durationTicks - scrollX) * pixelsPerTick;
            if (Math.abs(x - clipRightX) < RESIZE_HANDLE_PX + 2) {
              cursor = "ew-resize";
            } else {
              cursor = "grab";
            }
            break;
          }
        }
      }
      container.style.cursor = cursor;
      return;
    }

    const rawTick = getTickFromX(x);

    if (dragRef.current.type === "loop-region") {
      const snapped = Math.max(0, Math.round(snapTick(rawTick)));
      const anchor = dragRef.current.anchorTick;
      const start = Math.min(anchor, snapped);
      const end = Math.max(anchor, snapped);
      useTransportStore.getState().setLoopRegion(start, end);
    } else if (dragRef.current.type === "loop-adjust") {
      const snapped = Math.max(0, Math.round(snapTick(rawTick)));
      const { loopRegion } = useTransportStore.getState();
      if (loopRegion) {
        if (dragRef.current.edge === "start") {
          const newStart = Math.min(snapped, loopRegion.endTick - PPQ);
          useTransportStore.getState().setLoopRegion(Math.max(0, newStart), loopRegion.endTick);
        } else {
          const newEnd = Math.max(snapped, loopRegion.startTick + PPQ);
          useTransportStore.getState().setLoopRegion(loopRegion.startTick, newEnd);
        }
      }
    } else if (dragRef.current.type === "scrub") {
      const snapped = snapTick(rawTick);
      useTransportStore.getState().setPosition(Math.max(0, Math.round(snapped)));
    } else if (dragRef.current.type === "clip-resize") {
      const d = dragRef.current;
      const { project } = useProjectStore.getState();
      const track = project.tracks.find((t) => t.id === d.trackId);
      const clip = track?.clips.find((c) => c.id === d.clipId);
      if (!clip) return;

      const snappedEnd = snapTick(rawTick);
      let newDuration = snappedEnd - clip.startTick;
      newDuration = Math.max(d.minDuration, newDuration);
      useProjectStore.getState().resizeClip(d.trackId, d.clipId, Math.round(newDuration));
    } else if (dragRef.current.type === "clip") {
      const d = dragRef.current;
      let newStart = rawTick - d.offsetTick;
      newStart = Math.max(0, snapTick(newStart));

      // Determine target track from y position
      const { project } = useProjectStore.getState();
      const trackIndex = Math.max(
        0,
        Math.min(
          project.tracks.length - 1,
          Math.floor((y - RULER_HEIGHT + useUIStore.getState().scrollY) / TRACK_HEIGHT),
        ),
      );
      const targetTrack = project.tracks[trackIndex]!;

      // Only move to same-type tracks
      const sourceTrack = project.tracks.find((t) => t.id === d.trackId);
      if (sourceTrack && targetTrack.type === sourceTrack.type) {
        useProjectStore.getState().moveClip(d.clipId, Math.round(newStart), targetTrack.id);
        d.trackId = targetTrack.id;
      } else {
        useProjectStore.getState().moveClip(d.clipId, Math.round(newStart));
      }
    }
  }, [getTickFromX, snapTick]);

  const handlePointerUp = useCallback(() => {
    if (dragRef.current?.type === "clip" || dragRef.current?.type === "clip-resize") {
      const before = dragStartProjectRef.current;
      dragStartProjectRef.current = null;

      if (before) {
        const after = cloneProject(useProjectStore.getState().project);
        if (before.modifiedAt !== after.modifiedAt) {
          commitCommand(
            createProjectSnapshotCommand(
              dragRef.current.type === "clip" ? "Move Clip" : "Resize Clip",
              before,
              after,
            ),
          );
        }
      }
    }

    if (dragRef.current?.type === "loop-region") {
      const { loopRegion, loopEnabled } = useTransportStore.getState();
      if (loopRegion && loopRegion.endTick > loopRegion.startTick) {
        // Auto-enable loop when a region is dragged
        if (!loopEnabled) useTransportStore.getState().toggleLoop();
      }
    }
    dragRef.current = null;
    const container = containerRef.current;
    if (container) container.style.cursor = "default";
  }, [commitCommand]);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      renderTimeline(canvas, container);
    };

    animateRef.current = () => {
      draw();
      const { state } = useTransportStore.getState();
      if (state === "playing") {
        rafRef.current = requestAnimationFrame(animateRef.current);
      }
    };

    // Resize observer
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    draw();

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if an input/textarea is focused
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // Delete selected clips on Delete/Backspace
      if (e.key === "Delete" || e.key === "Backspace") {
        const { selectedClipIds } = useUIStore.getState();
        if (selectedClipIds.length === 0) return;

        e.preventDefault();
        const before = cloneProject(useProjectStore.getState().project);
        const { project } = useProjectStore.getState();
        const store = useProjectStore.getState();

        for (const clipId of selectedClipIds) {
          if (useUIStore.getState().editingClipId === clipId) {
            useUIStore.getState().setEditingClip(null);
          }
          for (const track of project.tracks) {
            if (track.clips.some((c) => c.id === clipId)) {
              store.removeClip(track.id, clipId);
              break;
            }
          }
        }
        useUIStore.getState().setSelectedClips([]);
        const after = cloneProject(useProjectStore.getState().project);
        commitCommand(createProjectSnapshotCommand("Delete Clip", before, after));
        return;
      }

      // Split selected clip at playhead with S
      if (e.key === "s" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const { selectedClipIds } = useUIStore.getState();
        if (selectedClipIds.length !== 1) return;

        const clipId = selectedClipIds[0]!;
        const { positionTicks } = useTransportStore.getState();
        const { project } = useProjectStore.getState();

        for (const track of project.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            e.preventDefault();
            const command = new SplitClipCommand(track.id, clipId, positionTicks);
            executeCommand(command);
            const rightId = command.getRightClipId();
            if (rightId) {
              useUIStore.getState().setSelectedClips([rightId]);
            }
            break;
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Store subscriptions
    const unsubs = [
      useProjectStore.subscribe(selectTimelineProjectSlice, () => draw(), {
        equalityFn: areTimelineProjectSlicesEqual,
      }),
      useTransportStore.subscribe(selectTimelineTransportSlice, (state, prev) => {
        if (state.state === "playing" && prev.state !== "playing") {
          // Transitioning to playing — kick off the RAF animation loop
          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(animateRef.current);
        } else if (state.state === "playing") {
          // Already playing — RAF loop handles redraws, nothing to do
        } else {
          // Not playing — cancel any RAF loop and draw once for the final state
          cancelAnimationFrame(rafRef.current);
          if (
            prev.state !== state.state ||
            prev.positionTicks !== state.positionTicks ||
            prev.loopEnabled !== state.loopEnabled ||
            prev.loopRegion?.startTick !== state.loopRegion?.startTick ||
            prev.loopRegion?.endTick !== state.loopRegion?.endTick
          ) {
            draw();
          }
        }
      }, {
        equalityFn: areTimelineTransportSlicesEqual,
      }),
      useUIStore.subscribe(selectTimelineUISlice, () => draw(), {
        equalityFn: areTimelineUISlicesEqual,
      }),
    ];

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      observer.disconnect();
      cancelAnimationFrame(rafRef.current);
      unsubs.forEach((u) => u());
    };
  }, [commitCommand, executeCommand]);

  // Wheel handler: zoom (default), Shift → horizontal scroll, Ctrl → vertical scroll
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const ui = useUIStore.getState();

    if (e.shiftKey) {
      // Horizontal scroll with Shift+wheel
      const { horizontalZoom, scrollX } = ui;
      const pixelsPerTick = horizontalZoom / PPQ;
      const tickDelta = e.deltaY / pixelsPerTick;
      ui.setScrollX(scrollX + tickDelta);
    } else if (e.ctrlKey || e.metaKey) {
      // Vertical scroll with Ctrl/Cmd+wheel
      ui.setScrollY(ui.scrollY + e.deltaY);
    } else {
      // Default: horizontal zoom, handle trackpad deltaX as horizontal scroll
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const { horizontalZoom, scrollX } = ui;
        const pixelsPerTick = horizontalZoom / PPQ;
        const tickDelta = e.deltaX / pixelsPerTick;
        ui.setScrollX(scrollX + tickDelta);
      } else {
        const zoomDelta = e.deltaY > 0 ? -4 : 4;
        ui.setHorizontalZoom(ui.horizontalZoom + zoomDelta);
      }
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="h-full w-full pointer-events-none" />
    </div>
  );
}
