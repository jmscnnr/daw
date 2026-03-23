import type { TrackType } from "@/types/project";
import { useProjectStore } from "@/stores/project-store";
import { ProjectMutationCommand } from "./project-command-base";

export class CreateTrackCommand extends ProjectMutationCommand {
  private trackId: string | null = null;

  constructor(
    private type: TrackType,
    private trackName?: string,
  ) {
    super("Create Track");
  }

  protected applyInitialExecution(): void {
    this.trackId = useProjectStore.getState().addTrack(this.type, this.trackName);
  }

  getTrackId(): string | null {
    return this.trackId;
  }
}

export class DeleteTrackCommand extends ProjectMutationCommand {
  constructor(private trackId: string) {
    super("Delete Track");
  }

  protected applyInitialExecution(): void {
    useProjectStore.getState().removeTrack(this.trackId);
  }
}

export class RenameTrackCommand extends ProjectMutationCommand {
  constructor(
    private trackId: string,
    private newName: string,
  ) {
    super("Rename Track");
  }

  protected applyInitialExecution(): void {
    useProjectStore.getState().renameTrack(this.trackId, this.newName);
  }
}

export class SetTrackVolumeCommand extends ProjectMutationCommand {
  constructor(
    private trackId: string,
    private newVolume: number,
  ) {
    super("Set Track Volume");
  }

  protected applyInitialExecution(): void {
    useProjectStore.getState().setTrackVolume(this.trackId, this.newVolume);
  }
}

export class SetTrackPanCommand extends ProjectMutationCommand {
  constructor(
    private trackId: string,
    private newPan: number,
  ) {
    super("Set Track Pan");
  }

  protected applyInitialExecution(): void {
    useProjectStore.getState().setTrackPan(this.trackId, this.newPan);
  }
}

export class ToggleTrackMuteCommand extends ProjectMutationCommand {
  constructor(private trackId: string) {
    super("Toggle Track Mute");
  }

  protected applyInitialExecution(): void {
    useProjectStore.getState().toggleTrackMute(this.trackId);
  }
}

export class ToggleTrackSoloCommand extends ProjectMutationCommand {
  constructor(private trackId: string) {
    super("Toggle Track Solo");
  }

  protected applyInitialExecution(): void {
    useProjectStore.getState().toggleTrackSolo(this.trackId);
  }
}

export class ToggleTrackArmCommand extends ProjectMutationCommand {
  constructor(private trackId: string) {
    super("Toggle Track Arm");
  }

  protected applyInitialExecution(): void {
    useProjectStore.getState().toggleTrackArm(this.trackId);
  }
}

export class SetBPMCommand extends ProjectMutationCommand {
  constructor(private newBPM: number) {
    super("Set BPM");
  }

  protected applyInitialExecution(): void {
    useProjectStore.getState().setBPM(this.newBPM);
  }
}

export class SetProjectNameCommand extends ProjectMutationCommand {
  constructor(private projectName: string) {
    super("Rename Project");
  }

  protected applyInitialExecution(): void {
    useProjectStore.getState().setProjectName(this.projectName);
  }
}
