import type { MidiEvent } from "@/types/plugin";

// --- Expanded MIDI message model ---

export type MidiMessage =
  | { type: "noteOn"; channel: number; note: number; velocity: number }
  | { type: "noteOff"; channel: number; note: number; velocity: number }
  | { type: "cc"; channel: number; controller: number; value: number }
  | { type: "pitchBend"; channel: number; value: number }
  | { type: "aftertouch"; channel: number; note: number; pressure: number }
  | { type: "channelPressure"; channel: number; pressure: number }
  | { type: "programChange"; channel: number; program: number };

export interface TimedMidiMessage {
  message: MidiMessage;
  tick: number;
  /** Sample offset within the current audio block (0..127 for 128-sample blocks). */
  sampleOffset?: number;
}

// --- Conversion between legacy MidiEvent and new MidiMessage ---

export function legacyToMidi(event: MidiEvent): MidiMessage {
  if (event.type === "noteOn") {
    return {
      type: "noteOn",
      channel: 0,
      note: event.note,
      velocity: event.velocity,
    };
  }
  return {
    type: "noteOff",
    channel: 0,
    note: event.note,
    velocity: event.velocity,
  };
}

export function midiToLegacy(msg: MidiMessage, time = 0): MidiEvent {
  if (msg.type === "noteOn") {
    return { type: "noteOn", note: msg.note, velocity: msg.velocity, time };
  }
  if (msg.type === "noteOff") {
    return { type: "noteOff", note: msg.note, velocity: msg.velocity, time };
  }
  // Non-note messages have no legacy equivalent — map to a silent noteOff
  return { type: "noteOff", note: 0, velocity: 0, time };
}
