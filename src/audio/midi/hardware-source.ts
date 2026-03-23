/**
 * HardwareMIDISource: Bridges hardware MIDI devices to the MIDIBus via WebMidi.js.
 */
import { WebMidi } from "webmidi";
import type { MIDIBus } from "./midi-bus";
import type { MidiMessage } from "./types";

export const HARDWARE_SOURCE_PREFIX = "hardware:";

export interface MIDIDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
}

export class HardwareMIDISource {
  private midiBus: MIDIBus;
  private enabled = false;
  private cleanupFns = new Map<string, () => void>();

  constructor(midiBus: MIDIBus) {
    this.midiBus = midiBus;
  }

  async enable(): Promise<void> {
    if (this.enabled) return;

    await WebMidi.enable({ sysex: false });
    this.enabled = true;

    WebMidi.addListener("connected", () => this.refreshInputs());
    WebMidi.addListener("disconnected", () => this.refreshInputs());

    this.refreshInputs();
  }

  disable(): void {
    if (!this.enabled) return;

    for (const [inputId, cleanup] of this.cleanupFns) {
      cleanup();
      this.midiBus.unregisterSource(`${HARDWARE_SOURCE_PREFIX}${inputId}`);
    }
    this.cleanupFns.clear();

    WebMidi.removeListener("connected");
    WebMidi.removeListener("disconnected");
    WebMidi.disable();
    this.enabled = false;
  }

  getInputDevices(): MIDIDeviceInfo[] {
    if (!this.enabled) return [];
    return WebMidi.inputs.map((input) => ({
      id: input.id,
      name: input.name,
      manufacturer: input.manufacturer,
    }));
  }

  getOutputDevices(): MIDIDeviceInfo[] {
    if (!this.enabled) return [];
    return WebMidi.outputs.map((output) => ({
      id: output.id,
      name: output.name,
      manufacturer: output.manufacturer,
    }));
  }

  private refreshInputs(): void {
    // Remove listeners for disconnected devices
    for (const [inputId, cleanup] of this.cleanupFns) {
      const stillConnected = WebMidi.inputs.some((i) => i.id === inputId);
      if (!stillConnected) {
        cleanup();
        this.midiBus.unregisterSource(`${HARDWARE_SOURCE_PREFIX}${inputId}`);
        this.cleanupFns.delete(inputId);
      }
    }

    // Add listeners for new devices
    for (const input of WebMidi.inputs) {
      if (this.cleanupFns.has(input.id)) continue;

      const sourceId = `${HARDWARE_SOURCE_PREFIX}${input.id}`;
      this.midiBus.registerSource(sourceId);

      const noteOnHandler = (e: { note: { number: number; attack: number }; message: { channel: number } }) => {
        const msg: MidiMessage = {
          type: "noteOn",
          channel: e.message.channel - 1,
          note: e.note.number,
          velocity: e.note.attack,
        };
        this.midiBus.send(sourceId, { message: msg, tick: 0 });
      };

      const noteOffHandler = (e: { note: { number: number; release: number }; message: { channel: number } }) => {
        const msg: MidiMessage = {
          type: "noteOff",
          channel: e.message.channel - 1,
          note: e.note.number,
          velocity: e.note.release,
        };
        this.midiBus.send(sourceId, { message: msg, tick: 0 });
      };

      const ccHandler = (e: { controller: { number: number }; value: number; message: { channel: number } }) => {
        const msg: MidiMessage = {
          type: "cc",
          channel: e.message.channel - 1,
          controller: e.controller.number,
          value: e.value,
        };
        this.midiBus.send(sourceId, { message: msg, tick: 0 });
      };

      const pitchBendHandler = (e: { value: number; message: { channel: number } }) => {
        const msg: MidiMessage = {
          type: "pitchBend",
          channel: e.message.channel - 1,
          value: e.value,
        };
        this.midiBus.send(sourceId, { message: msg, tick: 0 });
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input.addListener("noteon", noteOnHandler as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input.addListener("noteoff", noteOffHandler as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input.addListener("controlchange", ccHandler as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input.addListener("pitchbend", pitchBendHandler as any);

      const cleanup = () => {
        input.removeListener("noteon");
        input.removeListener("noteoff");
        input.removeListener("controlchange");
        input.removeListener("pitchbend");
      };

      this.cleanupFns.set(input.id, cleanup);
    }
  }
}
