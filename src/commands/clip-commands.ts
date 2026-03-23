import type { Clip } from "@/types/project";
import { useProjectStore } from "@/stores/project-store";
import { ProjectMutationCommand } from "./project-command-base";

export class AddClipCommand extends ProjectMutationCommand {
  private clipId: string | null = null;

  constructor(
    private trackId: string,
    private clip: Omit<Clip, "id" | "trackId">,
  ) {
    super("Add Clip");
  }

  protected applyInitialExecution(): void {
    this.clipId = useProjectStore.getState().addClip(this.trackId, this.clip);
  }

  getClipId(): string | null {
    return this.clipId;
  }
}

export class DeleteClipCommand extends ProjectMutationCommand {
  constructor(
    private trackId: string,
    private clipId: string,
  ) {
    super("Delete Clip");
  }

  protected applyInitialExecution(): void {
    useProjectStore.getState().removeClip(this.trackId, this.clipId);
  }
}

export class SplitClipCommand extends ProjectMutationCommand {
  private rightClipId: string | null = null;

  constructor(
    private trackId: string,
    private clipId: string,
    private splitTick: number,
  ) {
    super("Split Clip");
  }

  protected applyInitialExecution(): void {
    this.rightClipId = useProjectStore.getState().splitClip(
      this.trackId,
      this.clipId,
      this.splitTick,
    );
  }

  getRightClipId(): string | null {
    return this.rightClipId;
  }
}
