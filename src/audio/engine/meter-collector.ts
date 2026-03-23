/**
 * MeterCollector: Receives peak dB messages from meter-processor worklet nodes
 * and writes them into the meter store. Replaces the RAF polling loop.
 */
import { useMeterStore } from "@/stores/meter-store";
import type { IAudioWorkletNode } from "standardized-audio-context";
import type { PluginContext } from "@/types/plugin";

export class MeterCollector {
  private meters = new Map<string, IAudioWorkletNode<PluginContext>>();
  private masterNodeId: string | null = null;

  addMeter(nodeId: string, meterNode: IAudioWorkletNode<PluginContext>): void {
    meterNode.port.onmessage = (e: MessageEvent) => {
      if (e.data.type === "meter") {
        if (nodeId === this.masterNodeId) {
          useMeterStore.getState().setMasterLevel(e.data.peak);
        } else {
          useMeterStore.getState().setLevel(nodeId, e.data.peak);
        }
      }
    };
    this.meters.set(nodeId, meterNode);
  }

  setMasterNodeId(nodeId: string): void {
    this.masterNodeId = nodeId;
  }

  removeMeter(nodeId: string): void {
    const node = this.meters.get(nodeId);
    if (node) {
      node.port.onmessage = null;
      this.meters.delete(nodeId);
    }
  }

  dispose(): void {
    for (const [, node] of this.meters) {
      node.port.onmessage = null;
    }
    this.meters.clear();
    this.masterNodeId = null;
  }
}
