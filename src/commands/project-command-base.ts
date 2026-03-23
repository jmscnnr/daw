import type { Project } from "@/types/project";
import type { Command } from "@/types/commands";
import { useProjectStore } from "@/stores/project-store";

export function cloneProject(project: Project): Project {
  return structuredClone(project);
}

export function createProjectSnapshotCommand(
  name: string,
  before: Project,
  after: Project,
): Command {
  return {
    name,
    execute() {
      useProjectStore.getState().replaceProject(cloneProject(after));
    },
    undo() {
      useProjectStore.getState().replaceProject(cloneProject(before));
    },
  };
}

export abstract class ProjectMutationCommand implements Command {
  readonly name: string;

  private beforeProject: Project | null = null;
  private afterProject: Project | null = null;
  private hasExecuted = false;

  protected constructor(name: string) {
    this.name = name;
  }

  execute(): void {
    if (this.hasExecuted) {
      if (this.afterProject) {
        useProjectStore.getState().replaceProject(cloneProject(this.afterProject));
      }
      return;
    }

    this.beforeProject = cloneProject(useProjectStore.getState().project);
    this.applyInitialExecution();
    this.afterProject = cloneProject(useProjectStore.getState().project);
    this.hasExecuted = true;
  }

  undo(): void {
    if (this.beforeProject) {
      useProjectStore.getState().replaceProject(cloneProject(this.beforeProject));
    }
  }

  protected abstract applyInitialExecution(): void;
}
