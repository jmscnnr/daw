import type { PluginDescriptor } from "@/types/plugin";

const registry = new Map<string, PluginDescriptor>();

export function registerPlugin(descriptor: PluginDescriptor): void {
  registry.set(descriptor.id, descriptor);
}

export function getPlugin(id: string): PluginDescriptor | undefined {
  return registry.get(id);
}

export function getAllPlugins(): PluginDescriptor[] {
  return Array.from(registry.values());
}

export function getPluginsByType(
  type: "instrument" | "effect",
): PluginDescriptor[] {
  return getAllPlugins().filter((p) => p.type === type);
}
