"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Toolbar } from "./Toolbar";
import { PanelLayout } from "./PanelLayout";
import { ArrangementView } from "@/components/arrangement/ArrangementView";
import { MixerView } from "@/components/mixer/MixerView";
import { PluginPanel } from "@/components/plugins/PluginPanel";
import { PianoRollPanel } from "@/components/piano-roll/PianoRollPanel";
import { useDAWEngine, type DAWEngineHandle } from "@/hooks/use-daw-engine";
import { useUIStore } from "@/stores/ui-store";
import { useCommandHistory } from "@/stores/command-history";
import { useKeyboard } from "@/hooks/use-keyboard";
import { useProjectStore } from "@/stores/project-store";
import { setSynthPluginUI } from "@/audio/plugins/builtin/synth-plugin";
import { SynthPluginUI } from "@/components/synth/SynthPluginUI";
import { PluginActionsContext } from "@/hooks/use-plugin-actions";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useTransportStore } from "@/stores/transport-store";
import { useRecordingStore } from "@/stores/recording-store";
import { ReplaceTrackPluginCommand, ClearTrackPluginsCommand } from "@/commands/plugin-commands";
import { cloneProject, createProjectSnapshotCommand } from "@/commands/project-command-base";
import { LandingScreen } from "./LandingScreen";
import type { MidiEvent } from "@/types/plugin";

// Register the synth plugin UI component
setSynthPluginUI(SynthPluginUI);

/**
 * Add a recorded note to the current recording clip and grow the clip if needed.
 */
function commitRecordedNote(
  active: { note: number; velocity: number; startTick: number },
  endTick: number,
) {
  const recState = useRecordingStore.getState();
  if (!recState.recordClipId || !recState.recordTrackId) {
    console.log("[REC] commitRecordedNote ABORTED: clipId=", recState.recordClipId, "trackId=", recState.recordTrackId);
    return;
  }

  const relStart = active.startTick - recState.recordStartTick;
  const duration = Math.max(1, endTick - active.startTick);
  const noteData = {
    note: active.note,
    velocity: active.velocity,
    startTick: relStart,
    durationTicks: duration,
  };

  useProjectStore.getState().addNoteToClip(
    recState.recordTrackId,
    recState.recordClipId,
    noteData,
  );

  const noteEnd = relStart + duration;
  const store = useProjectStore.getState();
  const track = store.project.tracks.find((t) => t.id === recState.recordTrackId);
  const clip = track?.clips.find((c) => c.id === recState.recordClipId);
  if (clip && noteEnd > clip.durationTicks) {
    store.resizeClip(recState.recordTrackId!, recState.recordClipId!, noteEnd);
  }
}

export function DAWShell() {
  const [projectChosen, setProjectChosen] = useState(false);
  const { handle, error, getTrackPlugin } = useDAWEngine(projectChosen);
  const executeCommand = useCommandHistory((s) => s.execute);
  const commitCommand = useCommandHistory((s) => s.commit);
  const recordingProjectRef = useRef<ReturnType<typeof cloneProject> | null>(null);

  // Keep a ref to the handle so note handlers never go stale
  const handleRef = useRef<DAWEngineHandle | null>(null);
  handleRef.current = handle;

  useAutoSave();

  const bottomPanelMode = useUIStore((s) => s.bottomPanelMode);
  const selectedTrackId = useUIStore((s) => s.selectedTrackId);
  const selectedPlugin = selectedTrackId ? getTrackPlugin(selectedTrackId) : null;

  const handleProjectOpen = useCallback(() => {
    setProjectChosen(true);
  }, []);

  // Resolve the target track for MIDI input (armed > selected)
  const resolveTargetTrack = useCallback(() => {
    const tracks = useProjectStore.getState().project.tracks;
    return (
      tracks.find((t) => t.armed) ??
      tracks.find((t) => t.id === useUIStore.getState().selectedTrackId) ??
      null
    );
  }, []);

  // Wire keyboard to armed track's plugin + recording
  const handleNoteOn = useCallback(
    (midi: number) => {
      const transportState = useTransportStore.getState();
      const recState = useRecordingStore.getState();
      console.log("[REC] noteOn", midi, {
        recording: transportState.recording,
        transportState: transportState.state,
        recordTrackId: recState.recordTrackId,
        recordClipId: recState.recordClipId,
        recordStartTimeMs: recState.recordStartTimeMs,
      });

      // Capture into recording store first — independent of audio engine
      if (transportState.recording) {
        const tick = recState.getCurrentTick();
        console.log("[REC] noteOn tick=", tick);
        useRecordingStore.getState().noteOn(midi, 1.0, tick);
      }

      const h = handleRef.current;
      if (!h) { console.log("[REC] noteOn: no handle"); return; }
      const target = resolveTargetTrack();
      if (!target) { console.log("[REC] noteOn: no target track"); return; }

      h.engine.sendMidiToTrack(target.id, {
        type: "noteOn",
        note: midi,
        velocity: 1.0,
        time: h.engine.ctx.currentTime,
      });
    },
    [resolveTargetTrack],
  );

  const handleNoteOff = useCallback(
    (midi: number) => {
      const transportState = useTransportStore.getState();
      const recState = useRecordingStore.getState();
      console.log("[REC] noteOff", midi, {
        recording: transportState.recording,
        recordTrackId: recState.recordTrackId,
        recordClipId: recState.recordClipId,
      });

      // Commit recorded note first — independent of audio engine
      if (transportState.recording) {
        const tick = useRecordingStore.getState().getCurrentTick();
        const active = useRecordingStore.getState().noteOff(midi);
        console.log("[REC] noteOff tick=", tick, "active=", active);
        if (active) {
          commitRecordedNote(active, tick);
          console.log("[REC] committed note", active.note, "relStart=", active.startTick - recState.recordStartTick, "dur=", Math.max(1, tick - active.startTick));
        }
      }

      const h = handleRef.current;
      if (!h) return;
      const target = resolveTargetTrack();
      if (!target) return;

      h.engine.sendMidiToTrack(target.id, {
        type: "noteOff",
        note: midi,
        velocity: 0,
        time: h.engine.ctx.currentTime,
      });
    },
    [resolveTargetTrack],
  );

  useKeyboard(handleNoteOn, handleNoteOff);

  // Wire hardware MIDI input (via MIDIBus) to recording
  useEffect(() => {
    if (!handle) return;
    const { engine } = handle;

    engine.setMidiInputCallback((trackId, msg) => {
      if (msg.message.type !== "noteOn" && msg.message.type !== "noteOff") return;
      if (!useTransportStore.getState().recording) return;

      const recState = useRecordingStore.getState();
      if (recState.recordTrackId !== trackId) return;

      const tick = recState.getCurrentTick();

      if (msg.message.type === "noteOn" && msg.message.velocity > 0) {
        recState.noteOn(msg.message.note, msg.message.velocity, tick);
      } else {
        const active = recState.noteOff(msg.message.note);
        if (active) {
          commitRecordedNote(active, tick);
        }
      }
    });

    return () => {
      engine.setMidiInputCallback(null);
    };
  }, [handle]);

  // Handle recording start/stop
  useEffect(() => {
    if (!handle) return;

    const initRecording = () => {
      console.log("[REC] initRecording called");
      recordingProjectRef.current ??= cloneProject(useProjectStore.getState().project);
      const startTick = useTransportStore.getState().positionTicks;
      const target = resolveTargetTrack();
      console.log("[REC] initRecording target=", target?.id, "startTick=", startTick);
      if (!target) { console.log("[REC] initRecording: NO TARGET, aborting"); return; }

      // Find existing clip at current position, or create one
      let targetClipId: string | null = null;
      let clipStartTick = startTick;

      for (const clip of target.clips) {
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
        targetClipId = useProjectStore.getState().addClip(target.id, {
          name: "Recorded",
          startTick,
          durationTicks: 1,
          content: { type: "midi", notes: [] },
        });
        clipStartTick = startTick;
      }

      const bpm = useProjectStore.getState().project.bpm;
      console.log("[REC] startRecording trackId=", target.id, "clipId=", targetClipId, "clipStartTick=", clipStartTick, "bpm=", bpm);
      useRecordingStore.getState().startRecording(target.id, targetClipId, clipStartTick, bpm);
      console.log("[REC] recording store after start:", useRecordingStore.getState().recordTrackId, useRecordingStore.getState().recordClipId, useRecordingStore.getState().recordStartTimeMs);
    };

    const finalizeRecording = () => {
      console.log("[REC] finalizeRecording called");
      const recState = useRecordingStore.getState();
      console.log("[REC] finalizeRecording state:", recState.recordTrackId, recState.recordClipId, "activeNotes size:", recState.activeNotes.size);
      const tick = recState.getCurrentTick();
      const held = recState.finalizeHeld();

      if (recState.recordClipId && recState.recordTrackId) {
        for (const active of held) {
          commitRecordedNote(active, tick);
        }
      }

      useRecordingStore.getState().reset();

      const before = recordingProjectRef.current;
      recordingProjectRef.current = null;
      if (before) {
        const after = cloneProject(useProjectStore.getState().project);
        if (before.modifiedAt !== after.modifiedAt) {
          commitCommand(createProjectSnapshotCommand("Record MIDI", before, after));
        }
      }
    };

    // Grow the recording clip to match the playhead position
    const unsubPosition = useTransportStore.subscribe(
      (s) => s.positionTicks,
      (positionTicks) => {
        const recState = useRecordingStore.getState();
        if (!recState.recordClipId || !recState.recordTrackId) return;
        const elapsed = positionTicks - recState.recordStartTick;
        if (elapsed <= 0) return;
        const store = useProjectStore.getState();
        const track = store.project.tracks.find((t) => t.id === recState.recordTrackId);
        const clip = track?.clips.find((c) => c.id === recState.recordClipId);
        if (clip && elapsed > clip.durationTicks) {
          store.resizeClip(recState.recordTrackId!, recState.recordClipId!, elapsed);
        }
      },
    );

    const unsub = useTransportStore.subscribe((state, prev) => {
      const isRecordingNow = state.recording && state.state === "playing";
      const wasRecordingBefore = prev.recording && prev.state === "playing";

      if (isRecordingNow !== wasRecordingBefore) {
        console.log("[REC] transport subscription fired:", {
          isRecordingNow, wasRecordingBefore,
          state: state.state, prevState: prev.state,
          recording: state.recording, prevRecording: prev.recording,
        });
      }

      // Started recording: either from stopped, or armed mid-playback
      if (isRecordingNow && !wasRecordingBefore) {
        initRecording();
      }

      // Stopped recording: either toggled off, or transport stopped
      if (wasRecordingBefore && !isRecordingNow) {
        finalizeRecording();
      }
    });

    // If already recording when this effect mounts (e.g. handle just became available),
    // initialize recording now
    const { recording, state } = useTransportStore.getState();
    if (recording && state === "playing" && !useRecordingStore.getState().recordTrackId) {
      initRecording();
    }

    return () => {
      unsub();
      unsubPosition();
    };
  }, [handle, commitCommand, resolveTargetTrack]);

  const sendMidiToTrack = useCallback(
    (trackId: string, event: MidiEvent) => {
      if (!handle) return;
      handle.engine.sendMidiToTrack(trackId, event);
    },
    [handle],
  );

  const pluginActions = useMemo(
    () => ({
      assignPlugin: (trackId: string, pluginId: string) => {
        executeCommand(new ReplaceTrackPluginCommand(trackId, pluginId));
      },
      removeTrackPlugin: (trackId: string) => {
        executeCommand(new ClearTrackPluginsCommand(trackId));
      },
      sendMidiToTrack,
      commitPluginState: (slotId: string, state: Record<string, unknown>) => {
        const slotRef = useProjectStore.getState().getPluginSlotById(slotId);
        if (!slotRef) return;
        useProjectStore.getState().updatePluginSlotState(slotRef.trackId, slotId, state);
      },
      noteOn: handleNoteOn,
      noteOff: handleNoteOff,
    }),
    [executeCommand, sendMidiToTrack, handleNoteOn, handleNoteOff],
  );

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

        <Toolbar selectedPlugin={selectedPlugin} />

        <PanelLayout
          top={<ArrangementView />}
          bottom={bottomContent}
        />
      </div>
    </PluginActionsContext>
  );
}
