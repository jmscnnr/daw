export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface Project {
  id: string;
  name: string;
  bpm: number;
  timeSignature: TimeSignature;
  tracks: Track[];
  masterVolume: number;
  masterPan: number;
  createdAt: number;
  modifiedAt: number;
}

export type TrackType = "midi" | "audio";

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  color: string;
  clips: Clip[];
  pluginChain: PluginSlot[];
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
}

export interface PluginSlot {
  id: string;
  pluginId: string;
  state: Record<string, unknown>;
  bypassed: boolean;
}

export interface Clip {
  id: string;
  trackId: string;
  name: string;
  startTick: number;
  durationTicks: number;
  color?: string;
  content: ClipContent;
}

export type ClipContent =
  | { type: "midi"; notes: MidiNote[] }
  | { type: "audio"; placeholder: true };

export interface MidiNote {
  note: number;
  velocity: number;
  startTick: number;
  durationTicks: number;
}
