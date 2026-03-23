"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AudioEngine } from "@/audio/engine/audio-engine";
import { TransportScheduler } from "@/audio/engine/transport-scheduler";
import { useProjectStore } from "@/stores/project-store";
import { useTransportStore } from "@/stores/transport-store";
import { useUIStore } from "@/stores/ui-store";
import { createPluginInstance } from "@/audio/plugins/plugin-host";
import { useMeterStore } from "@/stores/meter-store";
import type { PluginInstance } from "@/types/plugin";

// Ensure builtin plugins are registered
import "@/audio/plugins/builtin/synth-plugin";

export interface DAWEngineHandle {
  audioEngine: AudioEngine;
  scheduler: TransportScheduler;
  pluginInstances: Map<string, PluginInstance>; // slotId → instance
}

export function useDAWEngine(enabled: boolean) {
  const [handle, setHandle] = useState<DAWEngineHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<DAWEngineHandle | null>(null);
  const [, setPluginVersion] = useState(0);
  const bumpPluginVersion = () => setPluginVersion((v) => v + 1);

  // Initialize audio engine
  useEffect(() => {
    if (!enabled) return;

    let disposed = false;

    async function setup() {
      try {
        const audioEngine = new AudioEngine();
        await audioEngine.init();
        await audioEngine.loadWorkletModules();

        const scheduler = new TransportScheduler(audioEngine);
        const pluginInstances = new Map<string, PluginInstance>();

        const h: DAWEngineHandle = {
          audioEngine,
          scheduler,
          pluginInstances,
        };

        if (!disposed) {
          handleRef.current = h;
          setHandle(h);
        } else {
          audioEngine.dispose();
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
        handleRef.current.scheduler.dispose();
        handleRef.current.audioEngine.dispose();
        handleRef.current = null;
      }
      setHandle(null);
    };
  }, [enabled]);

  // Sync project store → audio engine (tracks, mixer params)
  useEffect(() => {
    if (!handle) return;

    const { audioEngine, pluginInstances } = handle;

    // Bootstrap tracks that already exist before the subscription
    const initialTracks = useProjectStore.getState().project.tracks;
    for (const track of initialTracks) {
      audioEngine.createTrackChain(track.id);
      useUIStore.getState().setSelectedTrack(track.id);
      for (const slot of track.pluginChain) {
        if (!pluginInstances.has(slot.id)) {
          const chain = audioEngine.getTrackChain(track.id);
          if (chain) {
            void createPluginInstance(slot.pluginId, audioEngine.context).then(
              (instance) => {
                // Restore saved state from the project
                if (slot.state && Object.keys(slot.state).length > 0) {
                  instance.setState(slot.state);
                }
                pluginInstances.set(slot.id, instance);
                chain.addPlugin(instance);
                bumpPluginVersion();
              },
            );
          }
        }
      }
    }

    const unsub = useProjectStore.subscribe((state, prevState) => {
      const { tracks } = state.project;
      const prevTracks = prevState.project.tracks;

      // Detect added tracks
      for (const track of tracks) {
        const existed = prevTracks.find((t) => t.id === track.id);
        if (!existed) {
          // Create track chain
          audioEngine.createTrackChain(track.id);
          useUIStore.getState().setSelectedTrack(track.id);
        }
      }

      // Detect plugin slot changes (added/removed)
      for (const track of tracks) {
        const prev = prevTracks.find((t) => t.id === track.id);
        if (!prev) continue;

        const chain = audioEngine.getTrackChain(track.id);
        if (!chain) continue;

        // Detect added plugin slots
        for (const slot of track.pluginChain) {
          const existed = prev.pluginChain.find((s) => s.id === slot.id);
          if (!existed && !pluginInstances.has(slot.id)) {
            void createPluginInstance(
              slot.pluginId,
              audioEngine.context,
            ).then((instance) => {
              pluginInstances.set(slot.id, instance);
              chain.addPlugin(instance);
              bumpPluginVersion();
            });
          }
        }

        // Detect removed plugin slots
        for (const prevSlot of prev.pluginChain) {
          const stillExists = track.pluginChain.find((s) => s.id === prevSlot.id);
          if (!stillExists) {
            const instance = pluginInstances.get(prevSlot.id);
            if (instance) {
              const pluginIndex = chain.getPlugins().indexOf(instance);
              if (pluginIndex >= 0) {
                chain.removePlugin(pluginIndex);
              } else {
                instance.dispose();
              }
              pluginInstances.delete(prevSlot.id);
            }
          }
        }
      }

      // Detect removed tracks
      for (const prevTrack of prevTracks) {
        const stillExists = tracks.find((t) => t.id === prevTrack.id);
        if (!stillExists) {
          // Clean up plugin instances
          for (const slot of prevTrack.pluginChain) {
            const instance = pluginInstances.get(slot.id);
            if (instance) {
              instance.dispose();
              pluginInstances.delete(slot.id);
            }
          }
          audioEngine.removeTrackChain(prevTrack.id);
        }
      }

      // Sync mixer params
      for (const track of tracks) {
        const prev = prevTracks.find((t) => t.id === track.id);
        if (!prev) continue;
        const chain = audioEngine.getTrackChain(track.id);
        if (!chain) continue;

        if (track.volume !== prev.volume) chain.setVolume(track.volume);
        if (track.pan !== prev.pan) chain.setPan(track.pan);
        if (track.mute !== prev.mute) chain.setMute(track.mute);

        // Solo: mute all non-solo tracks when any track is soloed
        const anySoloed = tracks.some((t) => t.solo);
        if (anySoloed) {
          chain.setMute(!track.solo);
        } else if (track.mute !== prev.mute || track.solo !== prev.solo) {
          chain.setMute(track.mute);
        }
      }

      // Master volume & pan
      if (state.project.masterVolume !== prevState.project.masterVolume) {
        audioEngine.setMasterVolume(state.project.masterVolume);
      }
      if (state.project.masterPan !== prevState.project.masterPan) {
        audioEngine.setMasterPan(state.project.masterPan);
      }
    });

    return unsub;
  }, [handle]);

  // Sync transport store → scheduler
  useEffect(() => {
    if (!handle) return;

    const { scheduler, audioEngine } = handle;

    // Set up track info supplier for clip playback
    scheduler.setTrackInfoSupplier(() => {
      const { tracks } = useProjectStore.getState().project;
      return tracks.map((track) => ({
        trackId: track.id,
        clips: track.clips,
        chain: audioEngine.getTrackChain(track.id)!,
        muted: track.mute,
      })).filter((info) => info.chain != null);
    });

    // Position updates from scheduler → transport store
    scheduler.setPositionCallback((ticks) => {
      useTransportStore.getState().updatePosition(ticks);
    });

    // Sync BPM
    scheduler.setBPM(useProjectStore.getState().project.bpm);

    const unsubProject = useProjectStore.subscribe((state, prevState) => {
      if (state.project.bpm !== prevState.project.bpm) {
        scheduler.setBPM(state.project.bpm);
      }
    });

    const unsubTransport = useTransportStore.subscribe((state, prevState) => {
      if (state.state !== prevState.state) {
        if (state.state === "playing") {
          scheduler.start(state.positionTicks);
        } else if (state.state === "stopped") {
          scheduler.stop();
        } else if (state.state === "paused") {
          scheduler.pause();
        }
      }

      if (state.loopEnabled !== prevState.loopEnabled || state.loopRegion !== prevState.loopRegion) {
        scheduler.setLoop(
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

  // Centralized metering loop — feeds all track + master levels into meter store
  useEffect(() => {
    if (!handle) return;
    const { audioEngine } = handle;
    let raf = 0;

    const update = () => {
      const { tracks } = useProjectStore.getState().project;
      const store = useMeterStore.getState();
      for (const track of tracks) {
        const chain = audioEngine.getTrackChain(track.id);
        if (chain) {
          store.setLevel(track.id, chain.getPeakDb());
        }
      }
      store.setMasterLevel(audioEngine.getMasterPeakDb());
      raf = requestAnimationFrame(update);
    };

    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [handle]);

  // Persist plugin instance state into project slot state (for save/load)
  useEffect(() => {
    if (!handle) return;
    const { pluginInstances } = handle;

    const interval = setInterval(() => {
      const store = useProjectStore.getState();
      for (const track of store.project.tracks) {
        for (const slot of track.pluginChain) {
          const instance = pluginInstances.get(slot.id);
          if (instance) {
            const instanceState = instance.getState();
            // Only update if state actually changed
            const current = slot.state;
            const changed = Object.keys(instanceState).some(
              (k) => JSON.stringify(instanceState[k]) !== JSON.stringify(current[k]),
            );
            if (changed) {
              store.updatePluginSlotState(track.id, slot.id, instanceState);
            }
          }
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [handle]);

  // Get plugin instance for a given track (first plugin slot)
  const getTrackPlugin = useCallback(
    (trackId: string): PluginInstance | null => {
      if (!handle) return null;
      const track = useProjectStore
        .getState()
        .project.tracks.find((t) => t.id === trackId);
      if (!track || track.pluginChain.length === 0) return null;
      return handle.pluginInstances.get(track.pluginChain[0]!.id) ?? null;
    },
    [handle],
  );

  // Assign a plugin to a track (replaces existing instrument)
  const assignPlugin = useCallback(
    (trackId: string, pluginId: string) => {
      if (!handle) return;
      const store = useProjectStore.getState();
      const track = store.project.tracks.find((t) => t.id === trackId);
      if (!track) return;

      // Remove existing instrument plugins
      for (const slot of [...track.pluginChain]) {
        store.removePluginSlot(trackId, slot.id);
      }

      // Add the new plugin slot — the store subscription above will detect
      // the new slot and instantiate it
      store.addPluginSlot(trackId, pluginId);
    },
    [handle],
  );

  // Remove all plugins from a track
  const removeTrackPlugin = useCallback(
    (trackId: string) => {
      if (!handle) return;
      const store = useProjectStore.getState();
      const track = store.project.tracks.find((t) => t.id === trackId);
      if (!track) return;

      for (const slot of [...track.pluginChain]) {
        store.removePluginSlot(trackId, slot.id);
      }
    },
    [handle],
  );

  return { handle, error, getTrackPlugin, assignPlugin, removeTrackPlugin };
}
