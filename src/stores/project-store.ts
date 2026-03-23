import { create } from "zustand";
import type { Project, Track, Clip, TrackType, PluginSlot, MidiNote } from "@/types/project";
import { createId } from "@/lib/id";
import {
  DEFAULT_BPM,
  DEFAULT_TIME_SIGNATURE,
  TRACK_COLORS,
} from "@/lib/constants";
import { SYNTH_PLUGIN_ID } from "@/audio/plugins/builtin/synth-plugin";

interface ProjectState {
  project: Project;

  // Project lifecycle
  loadProject(project: Project): void;
  newProject(): void;

  // Track CRUD
  addTrack(type: TrackType, name?: string): string;
  removeTrack(trackId: string): void;
  renameTrack(trackId: string, name: string): void;
  setTrackColor(trackId: string, color: string): void;
  reorderTrack(trackId: string, newIndex: number): void;

  // Track mixer params
  setTrackVolume(trackId: string, volume: number): void;
  setTrackPan(trackId: string, pan: number): void;
  toggleTrackMute(trackId: string): void;
  toggleTrackSolo(trackId: string): void;
  toggleTrackArm(trackId: string): void;

  // Plugin slots
  addPluginSlot(trackId: string, pluginId: string): string;
  removePluginSlot(trackId: string, slotId: string): void;
  updatePluginSlotState(
    trackId: string,
    slotId: string,
    state: Record<string, unknown>,
  ): void;

  // Clip CRUD
  addClip(trackId: string, clip: Omit<Clip, "id" | "trackId">): string;
  removeClip(trackId: string, clipId: string): void;
  moveClip(
    clipId: string,
    newStartTick: number,
    newTrackId?: string,
  ): void;

  // MIDI note editing
  addNoteToClip(trackId: string, clipId: string, note: MidiNote): void;
  removeNoteFromClip(trackId: string, clipId: string, noteIndex: number): void;
  updateNoteInClip(trackId: string, clipId: string, noteIndex: number, note: Partial<MidiNote>): void;
  resizeClip(trackId: string, clipId: string, durationTicks: number): void;
  splitClip(trackId: string, clipId: string, splitTick: number): string | null;

  // Project metadata
  setProjectName(name: string): void;
  setBPM(bpm: number): void;
  setMasterVolume(volume: number): void;
  setMasterPan(pan: number): void;
}

function createDefaultProject(): Project {
  const trackId = createId();
  return {
    id: createId(),
    name: "Untitled Project",
    bpm: DEFAULT_BPM,
    timeSignature: { ...DEFAULT_TIME_SIGNATURE },
    tracks: [
      {
        id: trackId,
        name: "Synth 1",
        type: "midi",
        color: TRACK_COLORS[0]!,
        clips: [],
        pluginChain: [
          { id: createId(), pluginId: SYNTH_PLUGIN_ID, state: {}, bypassed: false },
        ],
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
        armed: false,
      },
    ],
    masterVolume: 0.8,
    masterPan: 0,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
}

function updateTrack(
  tracks: Track[],
  trackId: string,
  updater: (track: Track) => Track,
): Track[] {
  return tracks.map((t) => (t.id === trackId ? updater(t) : t));
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  project: createDefaultProject(),

  loadProject(project) {
    set({ project });
  },

  newProject() {
    set({ project: createDefaultProject() });
  },

  addTrack(type, name) {
    const id = createId();
    const { tracks } = get().project;
    const colorIndex = tracks.length % TRACK_COLORS.length;
    const track: Track = {
      id,
      name: name ?? `${type === "midi" ? "MIDI" : "Audio"} ${tracks.length + 1}`,
      type,
      color: TRACK_COLORS[colorIndex]!,
      clips: [],
      pluginChain: [],
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      armed: false,
    };
    set((s) => ({
      project: {
        ...s.project,
        tracks: [...s.project.tracks, track],
        modifiedAt: Date.now(),
      },
    }));
    return id;
  },

  removeTrack(trackId) {
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.filter((t) => t.id !== trackId),
        modifiedAt: Date.now(),
      },
    }));
  },

  renameTrack(trackId, name) {
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          name,
        })),
        modifiedAt: Date.now(),
      },
    }));
  },

  setTrackColor(trackId, color) {
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          color,
        })),
        modifiedAt: Date.now(),
      },
    }));
  },

  reorderTrack(trackId, newIndex) {
    set((s) => {
      const tracks = [...s.project.tracks];
      const oldIndex = tracks.findIndex((t) => t.id === trackId);
      if (oldIndex === -1) return s;
      const [track] = tracks.splice(oldIndex, 1);
      tracks.splice(newIndex, 0, track!);
      return {
        project: { ...s.project, tracks, modifiedAt: Date.now() },
      };
    });
  },

  setTrackVolume(trackId, volume) {
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          volume,
        })),
      },
    }));
  },

  setTrackPan(trackId, pan) {
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          pan,
        })),
      },
    }));
  },

  toggleTrackMute(trackId) {
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          mute: !t.mute,
        })),
      },
    }));
  },

  toggleTrackSolo(trackId) {
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          solo: !t.solo,
        })),
      },
    }));
  },

  toggleTrackArm(trackId) {
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          armed: !t.armed,
        })),
      },
    }));
  },

  addPluginSlot(trackId, pluginId) {
    const slotId = createId();
    const slot: PluginSlot = {
      id: slotId,
      pluginId,
      state: {},
      bypassed: false,
    };
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          pluginChain: [...t.pluginChain, slot],
        })),
        modifiedAt: Date.now(),
      },
    }));
    return slotId;
  },

  removePluginSlot(trackId, slotId) {
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          pluginChain: t.pluginChain.filter((p) => p.id !== slotId),
        })),
        modifiedAt: Date.now(),
      },
    }));
  },

  updatePluginSlotState(trackId, slotId, state) {
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          pluginChain: t.pluginChain.map((p) =>
            p.id === slotId ? { ...p, state } : p,
          ),
        })),
        modifiedAt: Date.now(),
      },
    }));
  },

  addClip(trackId, clip) {
    const id = createId();
    const fullClip: Clip = { ...clip, id, trackId };
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          clips: [...t.clips, fullClip],
        })),
        modifiedAt: Date.now(),
      },
    }));
    return id;
  },

  removeClip(trackId, clipId) {
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          clips: t.clips.filter((c) => c.id !== clipId),
        })),
        modifiedAt: Date.now(),
      },
    }));
  },

  moveClip(clipId, newStartTick, newTrackId) {
    set((s) => {
      let clip: Clip | undefined;
      let sourceTrackId: string | undefined;

      for (const track of s.project.tracks) {
        const found = track.clips.find((c) => c.id === clipId);
        if (found) {
          clip = found;
          sourceTrackId = track.id;
          break;
        }
      }

      if (!clip || !sourceTrackId) return s;

      const targetTrackId = newTrackId ?? sourceTrackId;
      const movedClip = {
        ...clip,
        startTick: newStartTick,
        trackId: targetTrackId,
      };

      let tracks = s.project.tracks;

      // Remove from source
      tracks = updateTrack(tracks, sourceTrackId, (t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== clipId),
      }));

      // Add to target
      tracks = updateTrack(tracks, targetTrackId, (t) => ({
        ...t,
        clips: [...t.clips, movedClip],
      }));

      return {
        project: { ...s.project, tracks, modifiedAt: Date.now() },
      };
    });
  },

  addNoteToClip(trackId, clipId, note) {
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          clips: t.clips.map((c) => {
            if (c.id !== clipId || c.content.type !== "midi") return c;
            return {
              ...c,
              content: { ...c.content, notes: [...c.content.notes, note] },
            };
          }),
        })),
        modifiedAt: Date.now(),
      },
    }));
  },

  removeNoteFromClip(trackId, clipId, noteIndex) {
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          clips: t.clips.map((c) => {
            if (c.id !== clipId || c.content.type !== "midi") return c;
            return {
              ...c,
              content: {
                ...c.content,
                notes: c.content.notes.filter((_, i) => i !== noteIndex),
              },
            };
          }),
        })),
        modifiedAt: Date.now(),
      },
    }));
  },

  updateNoteInClip(trackId, clipId, noteIndex, noteUpdate) {
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          clips: t.clips.map((c) => {
            if (c.id !== clipId || c.content.type !== "midi") return c;
            return {
              ...c,
              content: {
                ...c.content,
                notes: c.content.notes.map((n, i) =>
                  i === noteIndex ? { ...n, ...noteUpdate } : n,
                ),
              },
            };
          }),
        })),
        modifiedAt: Date.now(),
      },
    }));
  },

  resizeClip(trackId, clipId, durationTicks) {
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, durationTicks } : c,
          ),
        })),
        modifiedAt: Date.now(),
      },
    }));
  },

  splitClip(trackId, clipId, splitTick) {
    const { project } = get();
    const track = project.tracks.find((t) => t.id === trackId);
    const clip = track?.clips.find((c) => c.id === clipId);
    if (!clip) return null;

    const relTick = splitTick - clip.startTick;
    if (relTick <= 0 || relTick >= clip.durationTicks) return null;

    const rightId = createId();

    let leftContent = clip.content;
    let rightContent = clip.content;

    if (clip.content.type === "midi") {
      const leftNotes: MidiNote[] = [];
      const rightNotes: MidiNote[] = [];
      for (const n of clip.content.notes) {
        if (n.startTick < relTick) {
          leftNotes.push({
            ...n,
            durationTicks: Math.min(n.durationTicks, relTick - n.startTick),
          });
        }
        if (n.startTick + n.durationTicks > relTick) {
          if (n.startTick >= relTick) {
            rightNotes.push({ ...n, startTick: n.startTick - relTick });
          } else {
            const overlap = n.startTick + n.durationTicks - relTick;
            rightNotes.push({ ...n, startTick: 0, durationTicks: overlap });
          }
        }
      }
      leftContent = { type: "midi", notes: leftNotes };
      rightContent = { type: "midi", notes: rightNotes };
    }

    const leftClip: Clip = {
      ...clip,
      durationTicks: relTick,
      content: leftContent,
    };

    const rightClip: Clip = {
      id: rightId,
      trackId,
      name: clip.name,
      startTick: splitTick,
      durationTicks: clip.durationTicks - relTick,
      color: clip.color,
      content: rightContent,
    };

    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrack(s.project.tracks, trackId, (t) => ({
          ...t,
          clips: [...t.clips.filter((c) => c.id !== clipId), leftClip, rightClip],
        })),
        modifiedAt: Date.now(),
      },
    }));

    return rightId;
  },

  setProjectName(name) {
    set((s) => ({
      project: { ...s.project, name, modifiedAt: Date.now() },
    }));
  },

  setBPM(bpm) {
    set((s) => ({
      project: { ...s.project, bpm, modifiedAt: Date.now() },
    }));
  },

  setMasterVolume(volume) {
    set((s) => ({
      project: { ...s.project, masterVolume: volume },
    }));
  },

  setMasterPan(pan) {
    set((s) => ({
      project: { ...s.project, masterPan: pan },
    }));
  },
}));
