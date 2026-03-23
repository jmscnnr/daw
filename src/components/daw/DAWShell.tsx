"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Toolbar } from "./Toolbar";
import { PanelLayout } from "./PanelLayout";
import { ArrangementView } from "@/components/arrangement/ArrangementView";
import { MixerView } from "@/components/mixer/MixerView";
import { PluginPanel } from "@/components/plugins/PluginPanel";
import { PianoRollPanel } from "@/components/piano-roll/PianoRollPanel";
import { useDAWEngine } from "@/hooks/use-daw-engine";
import { useUIStore } from "@/stores/ui-store";
import { useKeyboard } from "@/hooks/use-keyboard";
import { useProjectStore } from "@/stores/project-store";
import { setSynthPluginUI } from "@/audio/plugins/builtin/synth-plugin";
import { SynthPluginUI } from "@/components/synth/SynthPluginUI";
import { PluginActionsContext } from "@/hooks/use-plugin-actions";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useTransportStore } from "@/stores/transport-store";
import { useRecordingStore } from "@/stores/recording-store";
import { LandingScreen } from "./LandingScreen";
import type { MidiEvent } from "@/types/plugin";

// Register the synth plugin UI component
setSynthPluginUI(SynthPluginUI);

export function DAWShell() {
  const [projectChosen, setProjectChosen] = useState(false);
  const { handle, error, getTrackPlugin, assignPlugin, removeTrackPlugin } = useDAWEngine(projectChosen);

  useAutoSave();

  const bottomPanelMode = useUIStore((s) => s.bottomPanelMode);
  const selectedTrackId = useUIStore((s) => s.selectedTrackId);

  const handleProjectOpen = useCallback(() => {
    setProjectChosen(true);
  }, []);

  // Wire keyboard to armed track's plugin + recording
  const handleNoteOn = useCallback(
    (midi: number) => {
      if (!handle) return;
      const tracks = useProjectStore.getState().project.tracks;
      const armedTrack = tracks.find((t) => t.armed) ??
        tracks.find((t) => t.id === selectedTrackId);
      if (!armedTrack) return;

      const chain = handle.audioEngine.getTrackChain(armedTrack.id);
      chain?.sendMidiEvent({
        type: "noteOn",
        note: midi,
        velocity: 1.0,
        time: handle.audioEngine.currentTime,
      });

      // Record the note-on if recording
      if (useTransportStore.getState().recording) {
        const tick = handle.scheduler.getCurrentTick();
        useRecordingStore.getState().noteOn(midi, 1.0, tick);
      }
    },
    [handle, selectedTrackId],
  );

  const handleNoteOff = useCallback(
    (midi: number) => {
      if (!handle) return;
      const tracks = useProjectStore.getState().project.tracks;
      const armedTrack = tracks.find((t) => t.armed) ??
        tracks.find((t) => t.id === selectedTrackId);
      if (!armedTrack) return;

      const chain = handle.audioEngine.getTrackChain(armedTrack.id);
      chain?.sendMidiEvent({
        type: "noteOff",
        note: midi,
        velocity: 0,
        time: handle.audioEngine.currentTime,
      });

      // Record note-off: immediately add completed note to clip
      if (useTransportStore.getState().recording) {
        const tick = handle.scheduler.getCurrentTick();
        const recState = useRecordingStore.getState();
        const active = recState.noteOff(midi, tick);
        if (active && recState.recordClipId && recState.recordTrackId) {
          const clipStartTick = recState.recordStartTick;
          const relStart = active.startTick - clipStartTick;
          const duration = Math.max(1, tick - active.startTick);
          useProjectStore.getState().addNoteToClip(
            recState.recordTrackId,
            recState.recordClipId,
            { note: active.note, velocity: active.velocity, startTick: relStart, durationTicks: duration },
          );
          // Expand clip duration to cover this note
          const noteEnd = relStart + duration;
          const store = useProjectStore.getState();
          const track = store.project.tracks.find((t) => t.id === recState.recordTrackId);
          const clip = track?.clips.find((c) => c.id === recState.recordClipId);
          if (clip && noteEnd > clip.durationTicks) {
            store.resizeClip(recState.recordTrackId!, recState.recordClipId!, noteEnd);
          }
        }
      }
    },
    [handle, selectedTrackId],
  );

  useKeyboard(handleNoteOn, handleNoteOff);

  // Handle recording start/stop
  useEffect(() => {
    const unsub = useTransportStore.subscribe((state, prev) => {
      // Recording just started
      const justStartedRecording =
        state.recording && state.state === "playing" &&
        !(prev.recording && prev.state === "playing");

      if (justStartedRecording && handle) {
        const startTick = handle.scheduler.getCurrentTick();
        const tracks = useProjectStore.getState().project.tracks;
        const armedTrack = tracks.find((t) => t.armed) ??
          tracks.find((t) => t.id === useUIStore.getState().selectedTrackId);

        if (armedTrack) {
          // Find an existing clip that overlaps the current position, or create a new one
          let targetClipId: string | null = null;
          let clipStartTick = startTick;

          for (const clip of armedTrack.clips) {
            if (
              clip.content.type === "midi" &&
              clip.startTick <= startTick &&
              clip.startTick + clip.durationTicks >= startTick
            ) {
              targetClipId = clip.id;
              clipStartTick = clip.startTick;
              break;
            }
          }

          if (!targetClipId) {
            // Create a new clip at current position (minimum 1 tick, will grow)
            targetClipId = useProjectStore.getState().addClip(armedTrack.id, {
              name: "Recorded",
              startTick,
              durationTicks: 1,
              content: { type: "midi", notes: [] },
            });
            clipStartTick = startTick;
          }

          useRecordingStore.getState().startRecording(armedTrack.id, targetClipId, clipStartTick);
        }
      }

      // Recording just stopped
      const wasRecording = prev.recording && prev.state === "playing";
      const stoppedRecording = !state.recording || state.state === "stopped";

      if (wasRecording && stoppedRecording && handle) {
        const tick = handle.scheduler.getCurrentTick();
        const recState = useRecordingStore.getState();
        const held = recState.finalizeHeld(tick);

        // Close any still-held notes
        if (recState.recordClipId && recState.recordTrackId) {
          for (const active of held) {
            const relStart = active.startTick - recState.recordStartTick;
            const duration = Math.max(1, tick - active.startTick);
            useProjectStore.getState().addNoteToClip(
              recState.recordTrackId,
              recState.recordClipId,
              { note: active.note, velocity: active.velocity, startTick: relStart, durationTicks: duration },
            );
            const noteEnd = relStart + duration;
            const store = useProjectStore.getState();
            const track = store.project.tracks.find((t) => t.id === recState.recordTrackId);
            const clip = track?.clips.find((c) => c.id === recState.recordClipId);
            if (clip && noteEnd > clip.durationTicks) {
              store.resizeClip(recState.recordTrackId!, recState.recordClipId!, noteEnd);
            }
          }
        }

        useRecordingStore.getState().reset();
      }
    });

    return unsub;
  }, [handle]);

  const sendMidiToTrack = useCallback(
    (trackId: string, event: MidiEvent) => {
      if (!handle) return;
      const chain = handle.audioEngine.getTrackChain(trackId);
      chain?.sendMidiEvent(event);
    },
    [handle],
  );

  const pluginActions = useMemo(
    () => ({ assignPlugin, removeTrackPlugin, sendMidiToTrack }),
    [assignPlugin, removeTrackPlugin, sendMidiToTrack],
  );

  // Determine bottom panel content
  let bottomContent: React.ReactNode = null;
  if (bottomPanelMode === "mixer") {
    bottomContent = <MixerView />;
  } else if (bottomPanelMode === "editor") {
    bottomContent = <PianoRollPanel />;
  } else if (bottomPanelMode === "plugin") {
    bottomContent = (
      <PluginPanel
        trackId={selectedTrackId}
        getTrackPlugin={getTrackPlugin}
      />
    );
  }

  if (!projectChosen) {
    return <LandingScreen onOpen={handleProjectOpen} />;
  }

  return (
    <PluginActionsContext value={pluginActions}>
      <div className="flex h-screen flex-col bg-synth-bg">
        {error && (
          <div className="bg-red-900/50 border border-red-500 px-3 py-2 text-sm text-red-200">
            <strong>Audio Error:</strong> {error}
          </div>
        )}

        <Toolbar />

        <PanelLayout
          top={<ArrangementView />}
          bottom={bottomContent}
        />
      </div>
    </PluginActionsContext>
  );
}
