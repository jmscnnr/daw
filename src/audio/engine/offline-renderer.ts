/**
 * OfflineRenderer: Renders a project to an AudioBuffer using OfflineAudioContext.
 */
import {
  OfflineAudioContext,
  type IOfflineAudioContext,
} from "standardized-audio-context";
import { AudioGraph } from "./audio-graph";
import { createPluginInstance } from "@/audio/plugins/plugin-host";
import { encodeWAV } from "./wav-encoder";
import { PPQ } from "@/lib/constants";
import type { Project } from "@/types/project";

export interface BounceOptions {
  sampleRate?: number;
  channels?: number;
  bitDepth?: 16 | 32;
}

/**
 * Render the entire project offline and return a WAV Blob.
 */
export async function bounceProject(
  project: Project,
  pluginStates: Map<string, Record<string, unknown>>,
  options: BounceOptions = {},
): Promise<Blob> {
  const {
    sampleRate = 44100,
    channels = 2,
    bitDepth = 16,
  } = options;

  // Calculate total duration
  const totalTicks = calculateProjectDuration(project);
  const totalSeconds = ticksToSeconds(totalTicks, project.bpm);
  const totalSamples = Math.ceil(totalSeconds * sampleRate) + sampleRate; // +1s tail for release

  // Create offline context
  const offlineCtx = new OfflineAudioContext({
    numberOfChannels: channels,
    length: totalSamples,
    sampleRate,
  });

  // Load worklet modules on the offline context
  if (offlineCtx.audioWorklet) {
    await offlineCtx.audioWorklet.addModule("/worklets/synth-processor.js");
    await offlineCtx.audioWorklet.addModule("/worklets/meter-processor.js");
  }

  // Build graph
  const graph = new AudioGraph(offlineCtx);

  // Create tracks and load plugins
  for (const track of project.tracks) {
    graph.addTrack(track.id);
    graph.setVolume(track.id, track.volume);
    graph.setPan(track.id, track.pan);
    if (track.mute) graph.setMute(track.id, true);

    for (const slot of track.pluginChain) {
      const instance = await createPluginInstance(slot.pluginId, offlineCtx);
      const state = pluginStates.get(slot.id) ?? slot.state;
      if (state && Object.keys(state).length > 0) {
        instance.setState(state);
      }
      graph.insertPlugin(track.id, instance, 0);
    }
  }

  // Set master volume/pan
  const master = graph.getMasterNode();
  graph.setVolume(master.id, project.masterVolume);
  graph.setPan(master.id, project.masterPan);

  // Schedule all MIDI events
  // Since we can't use the transport worklet with offline context,
  // we schedule events by posting them directly to plugin worklet nodes
  // at the right times using setTimeout-equivalent scheduling.
  // For offline rendering, we pre-compute all events and send them
  // before starting the render.
  for (const track of project.tracks) {
    if (track.mute) continue;

    const node = graph.getNode(track.id);
    if (!node) continue;

    for (const clip of track.clips) {
      if (clip.content.type !== "midi") continue;

      for (const note of clip.content.notes) {
        const absoluteStart = clip.startTick + note.startTick;
        const absoluteEnd = absoluteStart + note.durationTicks;

        const startTime = ticksToSeconds(absoluteStart, project.bpm);
        const endTime = ticksToSeconds(absoluteEnd, project.bpm);

        // Send to the first instrument plugin
        for (const plugin of node.plugins) {
          if (plugin.descriptor.type === "instrument" && plugin.processMidi) {
            plugin.processMidi([
              {
                message: {
                  type: "noteOn",
                  channel: 0,
                  note: note.note,
                  velocity: note.velocity,
                },
                tick: absoluteStart,
              },
            ]);
            // Schedule note-off via a delayed message
            // For offline rendering, we need to send the time info
            // so the worklet can schedule it
            plugin.processMidi([
              {
                message: {
                  type: "noteOff",
                  channel: 0,
                  note: note.note,
                  velocity: 0,
                },
                tick: absoluteEnd,
              },
            ]);
            break;
          }
        }
      }
    }
  }

  // Render
  const renderedBuffer = await offlineCtx.startRendering();

  // Encode to WAV
  const wavData = encodeWAV(renderedBuffer, bitDepth);

  // Clean up
  graph.dispose();

  return new Blob([wavData], { type: "audio/wav" });
}

function calculateProjectDuration(project: Project): number {
  let maxTick = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const end = clip.startTick + clip.durationTicks;
      if (end > maxTick) maxTick = end;
    }
  }
  return maxTick;
}

function ticksToSeconds(ticks: number, bpm: number): number {
  return (ticks / PPQ) * (60 / bpm);
}
