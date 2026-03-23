import { useProjectStore } from "@/stores/project-store";
import { ProjectMutationCommand } from "./project-command-base";

export class ReplaceTrackPluginCommand extends ProjectMutationCommand {
  constructor(
    private trackId: string,
    private pluginId: string,
  ) {
    super("Replace Track Plugin");
  }

  protected applyInitialExecution(): void {
    const store = useProjectStore.getState();
    const track = store.getTrackById(this.trackId);
    if (!track) return;

    for (const slot of [...track.pluginChain]) {
      store.removePluginSlot(this.trackId, slot.id);
    }

    store.addPluginSlot(this.trackId, this.pluginId);
  }
}

export class ClearTrackPluginsCommand extends ProjectMutationCommand {
  constructor(private trackId: string) {
    super("Remove Track Plugins");
  }

  protected applyInitialExecution(): void {
    const store = useProjectStore.getState();
    const track = store.getTrackById(this.trackId);
    if (!track) return;

    for (const slot of [...track.pluginChain]) {
      store.removePluginSlot(this.trackId, slot.id);
    }
  }
}
