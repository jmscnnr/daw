"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { DAWEngine } from "@/audio/engine/daw-engine";
import { useProjectStore } from "@/stores/project-store";
import { useTransportStore } from "@/stores/transport-store";
import { useUIStore } from "@/stores/ui-store";
import type { PluginInstance } from "@/types/plugin";

// Ensure builtin plugins are registered
import "@/audio/plugins/builtin/synth-plugin";

export interface DAWEngineHandle {
  engine: DAWEngine;
}

export function useDAWEngine(enabled: boolean) {
  const [handle, setHandle] = useState<DAWEngineHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<DAWEngineHandle | null>(null);
  const [, setPluginVersion] = useState(0);
  const bumpPluginVersion = () => setPluginVersion((v) => v + 1);

  // Initialize DAW engine
  useEffect(() => {
    if (!enabled) return;

    let disposed = false;

    async function setup() {
      try {
        const engine = await DAWEngine.create();

        const h: DAWEngineHandle = { engine };

        if (!disposed) {
          handleRef.current = h;
          setHandle(h);
        } else {
          engine.dispose();
        }
      } catch (err) {
        if (!disposed) {
          setError(
            err instanceof Error ? err.message : "Failed to initialize audio",
          );
        }
      }
    }

    void setup();

    return () => {
      disposed = true;
      if (handleRef.current) {
        handleRef.current.engine.dispose();
        handleRef.current = null;
      }
      setHandle(null);
    };
  }, [enabled]);

  // Sync project store → engine (tracks, plugins, mixer params)
  useEffect(() => {
    if (!handle) return;

    const { engine } = handle;

    const isSlotStillPresent = (trackId: string, slotId: string): boolean => {
      const track = useProjectStore.getState().getTrackById(trackId);
      return track?.pluginChain.some((slot) => slot.id === slotId) ?? false;
    };

    // Bootstrap existing tracks
    const initialTracks = useProjectStore.getState().project.tracks;
    for (const track of initialTracks) {
      engine.addTrack(track.id);
      useUIStore.getState().setSelectedTrack(track.id);
      for (const slot of track.pluginChain) {
        if (!engine.getPlugin(slot.id)) {
          void engine.loadPlugin(track.id, slot.pluginId, slot.id, 0).then(
            (instance) => {
              if (!isSlotStillPresent(track.id, slot.id)) {
                engine.removePluginBySlot(track.id, slot.id);
                return;
              }
              if (slot.state && Object.keys(slot.state).length > 0) {
                instance.setState(slot.state);
              }
              bumpPluginVersion();
            },
          ).catch((err) => {
            console.error(`Failed to load plugin ${slot.pluginId} on track ${track.id}:`, err);
          });
        }
      }
    }

    const unsub = useProjectStore.subscribe((state, prevState) => {
      const { tracks } = state.project;
      const prevTracks = prevState.project.tracks;

      // Added tracks
      for (const track of tracks) {
        if (!prevTracks.find((t) => t.id === track.id)) {
          engine.addTrack(track.id);
          useUIStore.getState().setSelectedTrack(track.id);
        }
      }

      // Plugin changes
      for (const track of tracks) {
        const prev = prevTracks.find((t) => t.id === track.id);
        if (!prev) continue;

        for (const slot of track.pluginChain) {
          const existed = prev.pluginChain.find((s) => s.id === slot.id);
          if (!existed && !engine.getPlugin(slot.id)) {
            void engine.loadPlugin(track.id, slot.pluginId, slot.id, 0).then(
              (instance) => {
                if (!isSlotStillPresent(track.id, slot.id)) {
                  engine.removePluginBySlot(track.id, slot.id);
                  return;
                }
                if (slot.state && Object.keys(slot.state).length > 0) {
                  instance.setState(slot.state);
                }
                bumpPluginVersion();
              },
            ).catch((err) => {
              console.error(`Failed to load plugin ${slot.pluginId}:`, err);
            });
          }
        }

        for (const prevSlot of prev.pluginChain) {
          if (!track.pluginChain.find((s) => s.id === prevSlot.id)) {
            engine.removePluginBySlot(track.id, prevSlot.id);
          }
        }
      }

      // Removed tracks
      for (const prevTrack of prevTracks) {
        if (!tracks.find((t) => t.id === prevTrack.id)) {
          engine.removeTrack(prevTrack.id);
        }
      }

      // Mixer params
      const anySoloed = tracks.some((t) => t.solo);
      for (const track of tracks) {
        const prev = prevTracks.find((t) => t.id === track.id);
        if (!prev) continue;

        if (track.volume !== prev.volume) engine.graph.setVolume(track.id, track.volume);
        if (track.pan !== prev.pan) engine.graph.setPan(track.id, track.pan);
        if (track.mute !== prev.mute) engine.graph.setMute(track.id, track.mute);

        if (anySoloed) {
          engine.graph.setMute(track.id, !track.solo);
        } else if (track.mute !== prev.mute || track.solo !== prev.solo) {
          engine.graph.setMute(track.id, track.mute);
        }
      }

      // Master volume & pan
      const master = engine.graph.getMasterNode();
      if (state.project.masterVolume !== prevState.project.masterVolume) {
        engine.graph.setVolume(master.id, state.project.masterVolume);
      }
      if (state.project.masterPan !== prevState.project.masterPan) {
        engine.graph.setPan(master.id, state.project.masterPan);
      }
    });

    return unsub;
  }, [handle]);

  // Sync transport store → transport (worklet-based)
  useEffect(() => {
    if (!handle) return;

    const { engine } = handle;
    const { transport } = engine;

    transport.setTrackInfoSupplier(() => {
      const { tracks } = useProjectStore.getState().project;
      return tracks.map((track) => ({
        trackId: track.id,
        clips: track.clips,
        muted: track.mute,
      }));
    });

    transport.setPositionCallback((ticks) => {
      useTransportStore.getState().updatePosition(ticks);
    });

    transport.setBPM(useProjectStore.getState().project.bpm);

    const unsubProject = useProjectStore.subscribe((state, prevState) => {
      if (state.project.bpm !== prevState.project.bpm) {
        transport.setBPM(state.project.bpm);
      }
    });

    const unsubTransport = useTransportStore.subscribe((state, prevState) => {
      if (state.state !== prevState.state) {
        if (state.state === "playing") {
          transport.play(state.positionTicks);
        } else if (state.state === "stopped") {
          transport.stop();
        } else if (state.state === "paused") {
          transport.pause();
        }
      }

      if (state.loopEnabled !== prevState.loopEnabled || state.loopRegion !== prevState.loopRegion) {
        transport.setLoop(
          state.loopEnabled,
          state.loopRegion?.startTick,
          state.loopRegion?.endTick,
        );
      }
    });

    return () => {
      unsubProject();
      unsubTransport();
    };
  }, [handle]);

  // No RAF metering loop — MeterCollector pushes levels from worklet messages

  // Persist plugin state
  useEffect(() => {
    if (!handle) return;
    const { engine } = handle;

    const interval = setInterval(() => {
      const store = useProjectStore.getState();
      for (const track of store.project.tracks) {
        for (const slot of track.pluginChain) {
          const instance = engine.getPlugin(slot.id);
          if (instance) {
            const instanceState = instance.getState();
            const current = slot.state;
            const changed = Object.keys(instanceState).some(
              (k) => JSON.stringify(instanceState[k]) !== JSON.stringify(current[k]),
            );
            if (changed) {
              const slotRef = store.getPluginSlotById(slot.id);
              if (slotRef) {
                store.updatePluginSlotState(slotRef.trackId, slot.id, instanceState);
              }
            }
          }
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [handle]);

  const getTrackPlugin = useCallback(
    (trackId: string): PluginInstance | null => {
      if (!handle) return null;
      const track = useProjectStore.getState().getTrackById(trackId);
      if (!track || track.pluginChain.length === 0) return null;
      return handle.engine.getPlugin(track.pluginChain[0]!.id) ?? null;
    },
    [handle],
  );

  return { handle, error, getTrackPlugin };
}
