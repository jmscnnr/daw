import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Project, Track, Clip, TrackType, PluginSlot, MidiNote } from "@/types/project";
import { createId } from "@/lib/id";
import {
  DEFAULT_BPM,
  DEFAULT_TIME_SIGNATURE,
  TRACK_COLORS,
} from "@/lib/constants";
import { SYNTH_PLUGIN_ID } from "@/audio/plugins/builtin/synth-plugin";

interface ClipLocation {
  trackId: string;
  trackIndex: number;
  clipIndex: number;
}

interface PluginSlotLocation {
  trackId: string;
  trackIndex: number;
  slotIndex: number;
}

interface ProjectIndex {
  trackIndicesById: Record<string, number>;
  clipLocationsById: Record<string, ClipLocation>;
  pluginSlotLocationsById: Record<string, PluginSlotLocation>;
}

interface ProjectState {
  project: Project;
  projectIndex: ProjectIndex;

  // Project lifecycle
  loadProject(project: Project): void;
  replaceProject(project: Project): void;
  newProject(): void;

  // Fast lookups
  getTrackById(trackId: string): Track | null;
  findClipById(clipId: string): { trackId: string; clip: Clip } | null;
  getPluginSlotById(slotId: string): { trackId: string; slot: PluginSlot } | null;

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

  // Quantization
  quantizeClipNotes(
    trackId: string,
    clipId: string,
    divisionTicks: number,
    strength: number,
    swing: number,
  ): void;

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
    audioBuffers: [],
    masterVolume: 0.8,
    masterPan: 0,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
}

function buildProjectIndex(project: Project): ProjectIndex {
  const trackIndicesById: Record<string, number> = {};
  const clipLocationsById: Record<string, ClipLocation> = {};
  const pluginSlotLocationsById: Record<string, PluginSlotLocation> = {};

  project.tracks.forEach((track, trackIndex) => {
    trackIndicesById[track.id] = trackIndex;

    track.clips.forEach((clip, clipIndex) => {
      clipLocationsById[clip.id] = {
        trackId: track.id,
        trackIndex,
        clipIndex,
      };
    });

    track.pluginChain.forEach((slot, slotIndex) => {
      pluginSlotLocationsById[slot.id] = {
        trackId: track.id,
        trackIndex,
        slotIndex,
      };
    });
  });

  return {
    trackIndicesById,
    clipLocationsById,
    pluginSlotLocationsById,
  };
}

function withIndex(project: Project): Pick<ProjectState, "project" | "projectIndex"> {
  return {
    project,
    projectIndex: buildProjectIndex(project),
  };
}

function cloneTrackAt(tracks: Track[], trackIndex: number, updater: (track: Track) => Track): Track[] {
  return tracks.map((track, index) => (index === trackIndex ? updater(track) : track));
}

function applyProjectMutation(
  project: Project,
  mutate: (draftTracks: Track[]) => Track[],
): Pick<ProjectState, "project" | "projectIndex"> {
  const nextProject: Project = {
    ...project,
    tracks: mutate(project.tracks),
    modifiedAt: Date.now(),
  };
  return withIndex(nextProject);
}

export const useProjectStore = create<ProjectState>()(subscribeWithSelector((set, get) => ({
  ...withIndex(createDefaultProject()),

  loadProject(project) {
    set(withIndex(project));
  },

  replaceProject(project) {
    set(withIndex(project));
  },

  newProject() {
    set(withIndex(createDefaultProject()));
  },

  getTrackById(trackId) {
    const { project, projectIndex } = get();
    const trackIndex = projectIndex.trackIndicesById[trackId];
    return trackIndex === undefined ? null : project.tracks[trackIndex] ?? null;
  },

  findClipById(clipId) {
    const { project, projectIndex } = get();
    const location = projectIndex.clipLocationsById[clipId];
    if (!location) return null;

    const track = project.tracks[location.trackIndex];
    const clip = track?.clips[location.clipIndex];
    if (!track || !clip) return null;

    return { trackId: track.id, clip };
  },

  getPluginSlotById(slotId) {
    const { project, projectIndex } = get();
    const location = projectIndex.pluginSlotLocationsById[slotId];
    if (!location) return null;

    const track = project.tracks[location.trackIndex];
    const slot = track?.pluginChain[location.slotIndex];
    if (!track || !slot) return null;

    return { trackId: track.id, slot };
  },

  addTrack(type, name) {
    const id = createId();
    const { project } = get();
    const colorIndex = project.tracks.length % TRACK_COLORS.length;
    const track: Track = {
      id,
      name: name ?? `${type === "midi" ? "MIDI" : "Audio"} ${project.tracks.length + 1}`,
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

    set(withIndex({
      ...project,
      tracks: [...project.tracks, track],
      modifiedAt: Date.now(),
    }));

    return id;
  },

  removeTrack(trackId) {
    set((state) => {
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (trackIndex === undefined) return state;

      const tracks = state.project.tracks.filter((_, index) => index !== trackIndex);
      return withIndex({
        ...state.project,
        tracks,
        modifiedAt: Date.now(),
      });
    });
  },

  renameTrack(trackId, name) {
    set((state) => {
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (trackIndex === undefined) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({ ...track, name })),
      );
    });
  },

  setTrackColor(trackId, color) {
    set((state) => {
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (trackIndex === undefined) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({ ...track, color })),
      );
    });
  },

  reorderTrack(trackId, newIndex) {
    set((state) => {
      const currentIndex = state.projectIndex.trackIndicesById[trackId];
      if (currentIndex === undefined) return state;

      const clampedIndex = Math.max(0, Math.min(state.project.tracks.length - 1, newIndex));
      if (currentIndex === clampedIndex) return state;

      const tracks = [...state.project.tracks];
      const [track] = tracks.splice(currentIndex, 1);
      if (!track) return state;
      tracks.splice(clampedIndex, 0, track);

      return withIndex({
        ...state.project,
        tracks,
        modifiedAt: Date.now(),
      });
    });
  },

  setTrackVolume(trackId, volume) {
    set((state) => {
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (trackIndex === undefined) return state;
      if (state.project.tracks[trackIndex]?.volume === volume) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({ ...track, volume })),
      );
    });
  },

  setTrackPan(trackId, pan) {
    set((state) => {
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (trackIndex === undefined) return state;
      if (state.project.tracks[trackIndex]?.pan === pan) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({ ...track, pan })),
      );
    });
  },

  toggleTrackMute(trackId) {
    set((state) => {
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (trackIndex === undefined) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({ ...track, mute: !track.mute })),
      );
    });
  },

  toggleTrackSolo(trackId) {
    set((state) => {
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (trackIndex === undefined) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({ ...track, solo: !track.solo })),
      );
    });
  },

  toggleTrackArm(trackId) {
    set((state) => {
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (trackIndex === undefined) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({ ...track, armed: !track.armed })),
      );
    });
  },

  addPluginSlot(trackId, pluginId) {
    const slotId = createId();
    const slot: PluginSlot = {
      id: slotId,
      pluginId,
      state: {},
      bypassed: false,
    };

    set((state) => {
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (trackIndex === undefined) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({
          ...track,
          pluginChain: [...track.pluginChain, slot],
        })),
      );
    });

    return slotId;
  },

  removePluginSlot(trackId, slotId) {
    set((state) => {
      const location = state.projectIndex.pluginSlotLocationsById[slotId];
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (!location || trackIndex === undefined || location.trackId !== trackId) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({
          ...track,
          pluginChain: track.pluginChain.filter((slot) => slot.id !== slotId),
        })),
      );
    });
  },

  updatePluginSlotState(trackId, slotId, stateUpdate) {
    set((state) => {
      const location = state.projectIndex.pluginSlotLocationsById[slotId];
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (!location || trackIndex === undefined || location.trackId !== trackId) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({
          ...track,
          pluginChain: track.pluginChain.map((slot) =>
            slot.id === slotId ? { ...slot, state: stateUpdate } : slot,
          ),
        })),
      );
    });
  },

  addClip(trackId, clip) {
    const id = createId();
    const fullClip: Clip = { ...clip, id, trackId };

    set((state) => {
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (trackIndex === undefined) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({
          ...track,
          clips: [...track.clips, fullClip],
        })),
      );
    });

    return id;
  },

  removeClip(trackId, clipId) {
    set((state) => {
      const location = state.projectIndex.clipLocationsById[clipId];
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (!location || trackIndex === undefined || location.trackId !== trackId) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({
          ...track,
          clips: track.clips.filter((clip) => clip.id !== clipId),
        })),
      );
    });
  },

  moveClip(clipId, newStartTick, newTrackId) {
    set((state) => {
      const location = state.projectIndex.clipLocationsById[clipId];
      if (!location) return state;

      const sourceTrack = state.project.tracks[location.trackIndex];
      const clip = sourceTrack?.clips[location.clipIndex];
      if (!sourceTrack || !clip) return state;

      const targetTrackId = newTrackId ?? sourceTrack.id;
      const targetTrackIndex = state.projectIndex.trackIndicesById[targetTrackId];
      if (targetTrackIndex === undefined) return state;

      if (targetTrackId === sourceTrack.id) {
        return applyProjectMutation(state.project, (tracks) =>
          cloneTrackAt(tracks, location.trackIndex, (track) => ({
            ...track,
            clips: track.clips.map((candidate) =>
              candidate.id === clipId
                ? { ...candidate, startTick: newStartTick, trackId: targetTrackId }
                : candidate,
            ),
          })),
        );
      }

      const movedClip: Clip = {
        ...clip,
        startTick: newStartTick,
        trackId: targetTrackId,
      };

      return applyProjectMutation(state.project, (tracks) =>
        tracks.map((track, index) => {
          if (index === location.trackIndex) {
            return {
              ...track,
              clips: track.clips.filter((candidate) => candidate.id !== clipId),
            };
          }
          if (index === targetTrackIndex) {
            return {
              ...track,
              clips: [...track.clips, movedClip],
            };
          }
          return track;
        }),
      );
    });
  },

  addNoteToClip(trackId, clipId, note) {
    set((state) => {
      const location = state.projectIndex.clipLocationsById[clipId];
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (!location || trackIndex === undefined || location.trackId !== trackId) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId || clip.content.type !== "midi") return clip;
            return {
              ...clip,
              content: { ...clip.content, notes: [...clip.content.notes, note] },
            };
          }),
        })),
      );
    });
  },

  removeNoteFromClip(trackId, clipId, noteIndex) {
    set((state) => {
      const location = state.projectIndex.clipLocationsById[clipId];
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (!location || trackIndex === undefined || location.trackId !== trackId) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId || clip.content.type !== "midi") return clip;
            return {
              ...clip,
              content: {
                ...clip.content,
                notes: clip.content.notes.filter((_, index) => index !== noteIndex),
              },
            };
          }),
        })),
      );
    });
  },

  updateNoteInClip(trackId, clipId, noteIndex, noteUpdate) {
    set((state) => {
      const location = state.projectIndex.clipLocationsById[clipId];
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (!location || trackIndex === undefined || location.trackId !== trackId) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId || clip.content.type !== "midi") return clip;
            return {
              ...clip,
              content: {
                ...clip.content,
                notes: clip.content.notes.map((note, index) =>
                  index === noteIndex ? { ...note, ...noteUpdate } : note,
                ),
              },
            };
          }),
        })),
      );
    });
  },

  resizeClip(trackId, clipId, durationTicks) {
    set((state) => {
      const location = state.projectIndex.clipLocationsById[clipId];
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (!location || trackIndex === undefined || location.trackId !== trackId) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId ? { ...clip, durationTicks } : clip,
          ),
        })),
      );
    });
  },

  splitClip(trackId, clipId, splitTick) {
    const state = get();
    const location = state.projectIndex.clipLocationsById[clipId];
    const trackIndex = state.projectIndex.trackIndicesById[trackId];
    if (!location || trackIndex === undefined || location.trackId !== trackId) return null;

    const track = state.project.tracks[trackIndex];
    const clip = track?.clips[location.clipIndex];
    if (!track || !clip) return null;

    const relTick = splitTick - clip.startTick;
    if (relTick <= 0 || relTick >= clip.durationTicks) return null;

    const rightId = createId();

    let leftContent = clip.content;
    let rightContent = clip.content;

    if (clip.content.type === "midi") {
      const leftNotes: MidiNote[] = [];
      const rightNotes: MidiNote[] = [];

      for (const note of clip.content.notes) {
        if (note.startTick < relTick) {
          leftNotes.push({
            ...note,
            durationTicks: Math.min(note.durationTicks, relTick - note.startTick),
          });
        }
        if (note.startTick + note.durationTicks > relTick) {
          if (note.startTick >= relTick) {
            rightNotes.push({ ...note, startTick: note.startTick - relTick });
          } else {
            rightNotes.push({
              ...note,
              startTick: 0,
              durationTicks: note.startTick + note.durationTicks - relTick,
            });
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

    set((currentState) =>
      applyProjectMutation(currentState.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (candidateTrack) => ({
          ...candidateTrack,
          clips: candidateTrack.clips.flatMap((candidateClip) => {
            if (candidateClip.id !== clipId) return [candidateClip];
            return [leftClip, rightClip];
          }),
        })),
      ),
    );

    return rightId;
  },

  quantizeClipNotes(trackId, clipId, divisionTicks, strength, swing) {
    set((state) => {
      const location = state.projectIndex.clipLocationsById[clipId];
      const trackIndex = state.projectIndex.trackIndicesById[trackId];
      if (!location || trackIndex === undefined || location.trackId !== trackId) return state;

      return applyProjectMutation(state.project, (tracks) =>
        cloneTrackAt(tracks, trackIndex, (track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId || clip.content.type !== "midi") return clip;

            const quantized = clip.content.notes.map((note) => {
              // Find the nearest grid line index
              const gridIndex = Math.round(note.startTick / divisionTicks);
              let gridTick = gridIndex * divisionTicks;

              // Apply swing: shift every other grid line forward
              // Swing of 0 = no shift, swing of 1 = shift by full division
              if (gridIndex % 2 === 1 && swing > 0) {
                gridTick += Math.round(divisionTicks * swing * 0.5);
              }

              // Apply strength: lerp between original position and grid position
              const quantizedStart = Math.round(
                note.startTick + (gridTick - note.startTick) * strength,
              );

              return { ...note, startTick: Math.max(0, quantizedStart) };
            });

            return {
              ...clip,
              content: { ...clip.content, notes: quantized },
            };
          }),
        })),
      );
    });
  },

  setProjectName(name) {
    set((state) => withIndex({
      ...state.project,
      name,
      modifiedAt: Date.now(),
    }));
  },

  setBPM(bpm) {
    set((state) => withIndex({
      ...state.project,
      bpm,
      modifiedAt: Date.now(),
    }));
  },

  setMasterVolume(volume) {
    set((state) => withIndex({
      ...state.project,
      masterVolume: volume,
      modifiedAt: Date.now(),
    }));
  },

  setMasterPan(pan) {
    set((state) => withIndex({
      ...state.project,
      masterPan: pan,
      modifiedAt: Date.now(),
    }));
  },
})));
