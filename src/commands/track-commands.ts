import type { Command } from "@/types/commands";
import type { Track, TrackType } from "@/types/project";
import { useProjectStore } from "@/stores/project-store";

export class CreateTrackCommand implements Command {
  readonly name = "Create Track";
  private trackId: string | null = null;
  private type: TrackType;
  private trackName?: string;

  constructor(type: TrackType, name?: string) {
    this.type = type;
    this.trackName = name;
  }

  execute(): void {
    this.trackId = useProjectStore.getState().addTrack(this.type, this.trackName);
  }

  undo(): void {
    if (this.trackId) {
      useProjectStore.getState().removeTrack(this.trackId);
    }
  }

  getTrackId(): string | null {
    return this.trackId;
  }
}

export class DeleteTrackCommand implements Command {
  readonly name = "Delete Track";
  private trackId: string;
  private trackSnapshot: Track | null = null;
  private trackIndex = -1;

  constructor(trackId: string) {
    this.trackId = trackId;
  }

  execute(): void {
    const { tracks } = useProjectStore.getState().project;
    this.trackIndex = tracks.findIndex((t) => t.id === this.trackId);
    this.trackSnapshot = tracks[this.trackIndex] ?? null;
    useProjectStore.getState().removeTrack(this.trackId);
  }

  undo(): void {
    if (!this.trackSnapshot) return;

    // Re-add the track by directly manipulating the store
    // since addTrack generates a new ID
    useProjectStore.setState((s) => {
      const tracks = [...s.project.tracks];
      tracks.splice(this.trackIndex, 0, this.trackSnapshot!);
      return { project: { ...s.project, tracks } };
    });
  }
}

export class SetTrackVolumeCommand implements Command {
  readonly name = "Set Track Volume";

  constructor(
    private trackId: string,
    private newVolume: number,
    private oldVolume: number,
  ) {}

  execute(): void {
    useProjectStore.getState().setTrackVolume(this.trackId, this.newVolume);
  }

  undo(): void {
    useProjectStore.getState().setTrackVolume(this.trackId, this.oldVolume);
  }
}

export class SetTrackPanCommand implements Command {
  readonly name = "Set Track Pan";

  constructor(
    private trackId: string,
    private newPan: number,
    private oldPan: number,
  ) {}

  execute(): void {
    useProjectStore.getState().setTrackPan(this.trackId, this.newPan);
  }

  undo(): void {
    useProjectStore.getState().setTrackPan(this.trackId, this.oldPan);
  }
}

export class RenameTrackCommand implements Command {
  readonly name = "Rename Track";

  constructor(
    private trackId: string,
    private newName: string,
    private oldName: string,
  ) {}

  execute(): void {
    useProjectStore.getState().renameTrack(this.trackId, this.newName);
  }

  undo(): void {
    useProjectStore.getState().renameTrack(this.trackId, this.oldName);
  }
}

export class SetBPMCommand implements Command {
  readonly name = "Set BPM";

  constructor(
    private newBPM: number,
    private oldBPM: number,
  ) {}

  execute(): void {
    useProjectStore.getState().setBPM(this.newBPM);
  }

  undo(): void {
    useProjectStore.getState().setBPM(this.oldBPM);
  }
}
