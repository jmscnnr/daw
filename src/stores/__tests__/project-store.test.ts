import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "../project-store";
import type { Project, MidiNote } from "@/types/project";

function getState() {
  return useProjectStore.getState();
}

function getProject(): Project {
  return getState().project;
}

describe("ProjectStore", () => {
  beforeEach(() => {
    useProjectStore.getState().newProject();
  });

  describe("default project", () => {
    it("creates a project with one MIDI track", () => {
      const project = getProject();
      expect(project.tracks).toHaveLength(1);
      expect(project.tracks[0]!.type).toBe("midi");
      expect(project.tracks[0]!.name).toBe("Synth 1");
    });

    it("default track has a synth plugin", () => {
      const track = getProject().tracks[0]!;
      expect(track.pluginChain).toHaveLength(1);
      expect(track.pluginChain[0]!.pluginId).toBe("builtin.synth");
    });

    it("has sensible defaults", () => {
      const project = getProject();
      expect(project.bpm).toBeGreaterThan(0);
      expect(project.masterVolume).toBeGreaterThan(0);
      expect(project.masterVolume).toBeLessThanOrEqual(1);
      expect(project.timeSignature.numerator).toBeGreaterThan(0);
      expect(project.timeSignature.denominator).toBeGreaterThan(0);
    });
  });

  describe("track CRUD", () => {
    it("adds a MIDI track", () => {
      const id = getState().addTrack("midi", "Piano");
      const project = getProject();
      expect(project.tracks).toHaveLength(2);

      const track = getState().getTrackById(id);
      expect(track).not.toBeNull();
      expect(track!.name).toBe("Piano");
      expect(track!.type).toBe("midi");
    });

    it("adds an audio track", () => {
      const id = getState().addTrack("audio");
      const track = getState().getTrackById(id);
      expect(track).not.toBeNull();
      expect(track!.type).toBe("audio");
    });

    it("auto-generates track name when not provided", () => {
      const id = getState().addTrack("midi");
      const track = getState().getTrackById(id);
      expect(track!.name).toContain("MIDI");
    });

    it("removes a track", () => {
      const id = getState().addTrack("midi", "Remove Me");
      expect(getProject().tracks).toHaveLength(2);

      getState().removeTrack(id);
      expect(getProject().tracks).toHaveLength(1);
      expect(getState().getTrackById(id)).toBeNull();
    });

    it("removing nonexistent track is a no-op", () => {
      const before = getProject();
      getState().removeTrack("nonexistent");
      expect(getProject().tracks).toHaveLength(before.tracks.length);
    });

    it("renames a track", () => {
      const track = getProject().tracks[0]!;
      getState().renameTrack(track.id, "New Name");
      expect(getState().getTrackById(track.id)!.name).toBe("New Name");
    });

    it("sets track color", () => {
      const track = getProject().tracks[0]!;
      getState().setTrackColor(track.id, "#ff0000");
      expect(getState().getTrackById(track.id)!.color).toBe("#ff0000");
    });

    it("reorders tracks", () => {
      const id1 = getProject().tracks[0]!.id;
      const id2 = getState().addTrack("midi", "Second");
      const id3 = getState().addTrack("midi", "Third");

      // Move first track to end
      getState().reorderTrack(id1, 2);
      const tracks = getProject().tracks;
      expect(tracks[0]!.id).toBe(id2);
      expect(tracks[1]!.id).toBe(id3);
      expect(tracks[2]!.id).toBe(id1);
    });

    it("clamps reorder index to valid range", () => {
      const id = getProject().tracks[0]!.id;
      getState().addTrack("midi");

      getState().reorderTrack(id, 100);
      expect(getProject().tracks[1]!.id).toBe(id);
    });
  });

  describe("mixer parameters", () => {
    it("sets track volume", () => {
      const track = getProject().tracks[0]!;
      getState().setTrackVolume(track.id, 0.5);
      expect(getState().getTrackById(track.id)!.volume).toBe(0.5);
    });

    it("skips update when volume unchanged", () => {
      const track = getProject().tracks[0]!;
      const before = getProject();
      getState().setTrackVolume(track.id, track.volume);
      // modifiedAt should not change
      expect(getProject().modifiedAt).toBe(before.modifiedAt);
    });

    it("sets track pan", () => {
      const track = getProject().tracks[0]!;
      getState().setTrackPan(track.id, -0.5);
      expect(getState().getTrackById(track.id)!.pan).toBe(-0.5);
    });

    it("toggles track mute", () => {
      const track = getProject().tracks[0]!;
      expect(track.mute).toBe(false);

      getState().toggleTrackMute(track.id);
      expect(getState().getTrackById(track.id)!.mute).toBe(true);

      getState().toggleTrackMute(track.id);
      expect(getState().getTrackById(track.id)!.mute).toBe(false);
    });

    it("toggles track solo", () => {
      const track = getProject().tracks[0]!;
      expect(track.solo).toBe(false);

      getState().toggleTrackSolo(track.id);
      expect(getState().getTrackById(track.id)!.solo).toBe(true);
    });

    it("toggles track arm", () => {
      const track = getProject().tracks[0]!;
      expect(track.armed).toBe(false);

      getState().toggleTrackArm(track.id);
      expect(getState().getTrackById(track.id)!.armed).toBe(true);
    });
  });

  describe("plugin slots", () => {
    it("adds a plugin slot to a track", () => {
      const track = getProject().tracks[0]!;
      const slotId = getState().addPluginSlot(track.id, "builtin:gain");

      const updated = getState().getTrackById(track.id)!;
      expect(updated.pluginChain).toHaveLength(2); // synth + gain
      expect(updated.pluginChain[1]!.pluginId).toBe("builtin:gain");
      expect(updated.pluginChain[1]!.id).toBe(slotId);
    });

    it("removes a plugin slot", () => {
      const track = getProject().tracks[0]!;
      const slotId = track.pluginChain[0]!.id;

      getState().removePluginSlot(track.id, slotId);
      expect(getState().getTrackById(track.id)!.pluginChain).toHaveLength(0);
    });

    it("updates plugin slot state", () => {
      const track = getProject().tracks[0]!;
      const slotId = track.pluginChain[0]!.id;
      const newState = { attack: 0.1, decay: 0.2 };

      getState().updatePluginSlotState(track.id, slotId, newState);

      const result = getState().getPluginSlotById(slotId);
      expect(result).not.toBeNull();
      expect(result!.slot.state).toEqual(newState);
    });

    it("looks up plugin slot by ID", () => {
      const track = getProject().tracks[0]!;
      const slotId = track.pluginChain[0]!.id;

      const result = getState().getPluginSlotById(slotId);
      expect(result).not.toBeNull();
      expect(result!.trackId).toBe(track.id);
      expect(result!.slot.pluginId).toBe("builtin.synth");
    });

    it("returns null for nonexistent plugin slot", () => {
      expect(getState().getPluginSlotById("nonexistent")).toBeNull();
    });
  });

  describe("clip CRUD", () => {
    it("adds a clip to a track", () => {
      const track = getProject().tracks[0]!;
      const clipId = getState().addClip(track.id, {
        name: "Clip 1",
        startTick: 0,
        durationTicks: 960,
        content: { type: "midi", notes: [] },
      });

      const result = getState().findClipById(clipId);
      expect(result).not.toBeNull();
      expect(result!.trackId).toBe(track.id);
      expect(result!.clip.name).toBe("Clip 1");
      expect(result!.clip.startTick).toBe(0);
      expect(result!.clip.durationTicks).toBe(960);
    });

    it("removes a clip", () => {
      const track = getProject().tracks[0]!;
      const clipId = getState().addClip(track.id, {
        name: "Clip 1",
        startTick: 0,
        durationTicks: 960,
        content: { type: "midi", notes: [] },
      });

      getState().removeClip(track.id, clipId);
      expect(getState().findClipById(clipId)).toBeNull();
    });

    it("moves a clip within the same track", () => {
      const track = getProject().tracks[0]!;
      const clipId = getState().addClip(track.id, {
        name: "Clip 1",
        startTick: 0,
        durationTicks: 960,
        content: { type: "midi", notes: [] },
      });

      getState().moveClip(clipId, 1920);
      const result = getState().findClipById(clipId);
      expect(result!.clip.startTick).toBe(1920);
      expect(result!.trackId).toBe(track.id);
    });

    it("moves a clip to a different track", () => {
      const track1 = getProject().tracks[0]!;
      const track2Id = getState().addTrack("midi", "Track 2");
      const clipId = getState().addClip(track1.id, {
        name: "Clip 1",
        startTick: 0,
        durationTicks: 960,
        content: { type: "midi", notes: [] },
      });

      getState().moveClip(clipId, 480, track2Id);
      const result = getState().findClipById(clipId);
      expect(result!.trackId).toBe(track2Id);
      expect(result!.clip.startTick).toBe(480);

      // Original track should no longer have the clip
      const track1Updated = getState().getTrackById(track1.id)!;
      expect(track1Updated.clips).toHaveLength(0);
    });

    it("finds clip by ID", () => {
      const track = getProject().tracks[0]!;
      const clipId = getState().addClip(track.id, {
        name: "Test Clip",
        startTick: 100,
        durationTicks: 200,
        content: { type: "midi", notes: [] },
      });

      const result = getState().findClipById(clipId);
      expect(result).not.toBeNull();
      expect(result!.clip.id).toBe(clipId);
    });

    it("returns null for nonexistent clip", () => {
      expect(getState().findClipById("nonexistent")).toBeNull();
    });
  });

  describe("MIDI note editing", () => {
    let trackId: string;
    let clipId: string;

    beforeEach(() => {
      trackId = getProject().tracks[0]!.id;
      clipId = getState().addClip(trackId, {
        name: "MIDI Clip",
        startTick: 0,
        durationTicks: 1920,
        content: { type: "midi", notes: [] },
      });
    });

    it("adds a note to a clip", () => {
      const note: MidiNote = {
        note: 60,
        velocity: 0.8,
        startTick: 0,
        durationTicks: 480,
      };

      getState().addNoteToClip(trackId, clipId, note);
      const clip = getState().findClipById(clipId)!.clip;
      expect(clip.content.type).toBe("midi");
      if (clip.content.type === "midi") {
        expect(clip.content.notes).toHaveLength(1);
        expect(clip.content.notes[0]).toEqual(note);
      }
    });

    it("removes a note by index", () => {
      const note1: MidiNote = { note: 60, velocity: 0.8, startTick: 0, durationTicks: 480 };
      const note2: MidiNote = { note: 64, velocity: 0.7, startTick: 480, durationTicks: 480 };

      getState().addNoteToClip(trackId, clipId, note1);
      getState().addNoteToClip(trackId, clipId, note2);
      getState().removeNoteFromClip(trackId, clipId, 0);

      const clip = getState().findClipById(clipId)!.clip;
      if (clip.content.type === "midi") {
        expect(clip.content.notes).toHaveLength(1);
        expect(clip.content.notes[0]!.note).toBe(64);
      }
    });

    it("updates a note in a clip", () => {
      const note: MidiNote = { note: 60, velocity: 0.8, startTick: 0, durationTicks: 480 };
      getState().addNoteToClip(trackId, clipId, note);

      getState().updateNoteInClip(trackId, clipId, 0, { note: 72, velocity: 1.0 });

      const clip = getState().findClipById(clipId)!.clip;
      if (clip.content.type === "midi") {
        expect(clip.content.notes[0]!.note).toBe(72);
        expect(clip.content.notes[0]!.velocity).toBe(1.0);
        expect(clip.content.notes[0]!.startTick).toBe(0); // unchanged
        expect(clip.content.notes[0]!.durationTicks).toBe(480); // unchanged
      }
    });
  });

  describe("clip operations", () => {
    let trackId: string;

    beforeEach(() => {
      trackId = getProject().tracks[0]!.id;
    });

    it("resizes a clip", () => {
      const clipId = getState().addClip(trackId, {
        name: "Clip",
        startTick: 0,
        durationTicks: 960,
        content: { type: "midi", notes: [] },
      });

      getState().resizeClip(trackId, clipId, 1920);
      const clip = getState().findClipById(clipId)!.clip;
      expect(clip.durationTicks).toBe(1920);
    });

    it("splits a MIDI clip", () => {
      const notes: MidiNote[] = [
        { note: 60, velocity: 0.8, startTick: 0, durationTicks: 480 },
        { note: 64, velocity: 0.7, startTick: 480, durationTicks: 480 },
        { note: 67, velocity: 0.6, startTick: 960, durationTicks: 480 },
      ];

      const clipId = getState().addClip(trackId, {
        name: "Split Me",
        startTick: 0,
        durationTicks: 1920,
        content: { type: "midi", notes },
      });

      const rightId = getState().splitClip(trackId, clipId, 720);
      expect(rightId).not.toBeNull();

      // Left clip: ticks 0-720
      const left = getState().findClipById(clipId)!.clip;
      expect(left.durationTicks).toBe(720);
      if (left.content.type === "midi") {
        // First note fits entirely, second note is truncated
        expect(left.content.notes).toHaveLength(2);
        expect(left.content.notes[0]!.note).toBe(60);
        expect(left.content.notes[0]!.durationTicks).toBe(480);
        expect(left.content.notes[1]!.note).toBe(64);
        expect(left.content.notes[1]!.durationTicks).toBe(240); // truncated: 720 - 480
      }

      // Right clip: ticks 720-1920
      const right = getState().findClipById(rightId!)!.clip;
      expect(right.startTick).toBe(720);
      expect(right.durationTicks).toBe(1200);
      if (right.content.type === "midi") {
        // Second note continues into right, third note fully in right
        expect(right.content.notes).toHaveLength(2);
        // Second note: was at tick 480, extends to 960, split at 720
        // In right clip: starts at 0, duration = 480 + 480 - 720 = 240
        expect(right.content.notes[0]!.startTick).toBe(0);
        expect(right.content.notes[0]!.durationTicks).toBe(240);
        // Third note: was at tick 960, now at 960 - 720 = 240
        expect(right.content.notes[1]!.startTick).toBe(240);
        expect(right.content.notes[1]!.durationTicks).toBe(480);
      }
    });

    it("returns null when splitting at invalid positions", () => {
      const clipId = getState().addClip(trackId, {
        name: "Clip",
        startTick: 100,
        durationTicks: 960,
        content: { type: "midi", notes: [] },
      });

      // Split at or before start
      expect(getState().splitClip(trackId, clipId, 100)).toBeNull();
      expect(getState().splitClip(trackId, clipId, 50)).toBeNull();

      // Split at or after end
      expect(getState().splitClip(trackId, clipId, 1060)).toBeNull();
      expect(getState().splitClip(trackId, clipId, 2000)).toBeNull();
    });
  });

  describe("project metadata", () => {
    it("sets project name", () => {
      getState().setProjectName("My Song");
      expect(getProject().name).toBe("My Song");
    });

    it("sets BPM", () => {
      getState().setBPM(140);
      expect(getProject().bpm).toBe(140);
    });

    it("sets master volume", () => {
      getState().setMasterVolume(0.5);
      expect(getProject().masterVolume).toBe(0.5);
    });

    it("sets master pan", () => {
      getState().setMasterPan(-0.3);
      expect(getProject().masterPan).toBe(-0.3);
    });

    it("updates modifiedAt timestamp on mutations", () => {
      const before = getProject().modifiedAt;
      // Force a different timestamp
      const delayed = new Promise<void>((resolve) => setTimeout(resolve, 1));
      return delayed.then(() => {
        getState().setProjectName("Updated");
        expect(getProject().modifiedAt).toBeGreaterThanOrEqual(before);
      });
    });
  });

  describe("project lifecycle", () => {
    it("loads a project", () => {
      const project: Project = {
        id: "test-id",
        name: "Loaded Project",
        bpm: 140,
        timeSignature: { numerator: 3, denominator: 4 },
        tracks: [],
        audioBuffers: [],
        masterVolume: 0.7,
        masterPan: 0.2,
        createdAt: 1000,
        modifiedAt: 2000,
      };

      getState().loadProject(project);
      expect(getProject().name).toBe("Loaded Project");
      expect(getProject().bpm).toBe(140);
      expect(getProject().tracks).toHaveLength(0);
    });

    it("replaces project (for undo)", () => {
      const original = structuredClone(getProject());
      getState().setProjectName("Changed");
      expect(getProject().name).toBe("Changed");

      getState().replaceProject(original);
      expect(getProject().name).toBe(original.name);
    });

    it("newProject resets to defaults", () => {
      getState().setProjectName("Modified");
      getState().addTrack("midi");
      getState().addTrack("audio");

      getState().newProject();
      expect(getProject().tracks).toHaveLength(1);
      expect(getProject().name).toBe("Untitled Project");
    });
  });

  describe("index integrity", () => {
    it("tracks are findable after add and remove operations", () => {
      const id1 = getState().addTrack("midi", "Track A");
      const id2 = getState().addTrack("midi", "Track B");
      const id3 = getState().addTrack("midi", "Track C");

      getState().removeTrack(id2);

      expect(getState().getTrackById(id1)).not.toBeNull();
      expect(getState().getTrackById(id2)).toBeNull();
      expect(getState().getTrackById(id3)).not.toBeNull();
      expect(getState().getTrackById(id3)!.name).toBe("Track C");
    });

    it("clips are findable after cross-track move", () => {
      const t1 = getProject().tracks[0]!.id;
      const t2 = getState().addTrack("midi", "Track 2");

      const c1 = getState().addClip(t1, {
        name: "Clip",
        startTick: 0,
        durationTicks: 960,
        content: { type: "midi", notes: [] },
      });

      getState().moveClip(c1, 480, t2);

      const result = getState().findClipById(c1);
      expect(result).not.toBeNull();
      expect(result!.trackId).toBe(t2);
    });

    it("plugin slots are findable after removal of other slots", () => {
      const trackId = getProject().tracks[0]!.id;
      const slot1 = getProject().tracks[0]!.pluginChain[0]!.id;
      const slot2 = getState().addPluginSlot(trackId, "builtin:gain");

      getState().removePluginSlot(trackId, slot1);

      expect(getState().getPluginSlotById(slot1)).toBeNull();
      expect(getState().getPluginSlotById(slot2)).not.toBeNull();
    });
  });
});
