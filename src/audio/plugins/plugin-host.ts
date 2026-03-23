import type { PluginDescriptor, PluginInstance } from "@/types/plugin";
import { getPlugin } from "./plugin-registry";

/**
 * Creates and initializes a plugin instance from a descriptor ID.
 */
export async function createPluginInstance(
  pluginId: string,
  ctx: AudioContext,
): Promise<PluginInstance> {
  const descriptor = getPlugin(pluginId);
  if (!descriptor) {
    throw new Error(`Plugin not found: ${pluginId}`);
  }
  return createPluginFromDescriptor(descriptor, ctx);
}

export async function createPluginFromDescriptor(
  descriptor: PluginDescriptor,
  ctx: AudioContext,
): Promise<PluginInstance> {
  const instance = await descriptor.createInstance(ctx);
  await instance.initialize();
  return instance;
}
