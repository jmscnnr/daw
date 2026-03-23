import type { PluginInstance, PluginContext } from "@/types/plugin";
import { getPlugin } from "./plugin-registry";

/**
 * Creates and initializes a plugin instance from a descriptor ID.
 */
export async function createPluginInstance(
  pluginId: string,
  ctx: PluginContext,
): Promise<PluginInstance> {
  const descriptor = getPlugin(pluginId);
  if (!descriptor) {
    throw new Error(`Plugin not found: ${pluginId}`);
  }
  const instance = await descriptor.createInstance(ctx);
  instance.activate();
  return instance;
}
