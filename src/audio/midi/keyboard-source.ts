import type { MIDIBus } from "./midi-bus";
import type { MidiMessage } from "./types";

/** QWERTY keyboard → MIDI note mapping (2 octaves starting from C3). */
const KEY_MAP: Record<string, number> = {
  // Lower row: C3 – E4
  z: 48, s: 49, x: 50, d: 51, c: 52, v: 53,
  g: 54, b: 55, h: 56, n: 57, j: 58, m: 59,
  ",": 60,
  // Upper row: C4 – E5
  q: 60, "2": 61, w: 62, "3": 63, e: 64, r: 65,
  "5": 66, t: 67, "6": 68, y: 69, "7": 70, u: 71,
  i: 72,
};

export const SOURCE_ID = "keyboard";

/**
 * Registers keyboard events and publishes MIDI messages through the MIDIBus.
 * Manages its own key-down tracking to avoid repeat events.
 */
export class KeyboardMIDISource {
  private midiBus: MIDIBus;
  private activeKeys = new Set<string>();
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private onKeyUp: ((e: KeyboardEvent) => void) | null = null;
  private octaveOffset = 0;

  constructor(midiBus: MIDIBus) {
    this.midiBus = midiBus;
  }

  setOctaveOffset(offset: number): void {
    this.octaveOffset = offset;
  }

  enable(): void {
    this.midiBus.registerSource(SOURCE_ID);

    this.onKeyDown = (e: KeyboardEvent) => {
      if (this.shouldIgnore(e)) return;
      const key = e.key.toLowerCase();
      if (this.activeKeys.has(key)) return; // Ignore key repeat

      const baseMidi = KEY_MAP[key];
      if (baseMidi === undefined) return;

      this.activeKeys.add(key);
      const midi = baseMidi + this.octaveOffset * 12;
      const msg: MidiMessage = {
        type: "noteOn",
        channel: 0,
        note: midi,
        velocity: 0.8,
      };
      this.midiBus.send(SOURCE_ID, { message: msg, tick: 0 });
    };

    this.onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!this.activeKeys.has(key)) return;

      const baseMidi = KEY_MAP[key];
      if (baseMidi === undefined) return;

      this.activeKeys.delete(key);
      const midi = baseMidi + this.octaveOffset * 12;
      const msg: MidiMessage = {
        type: "noteOff",
        channel: 0,
        note: midi,
        velocity: 0,
      };
      this.midiBus.send(SOURCE_ID, { message: msg, tick: 0 });
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  disable(): void {
    if (this.onKeyDown) {
      window.removeEventListener("keydown", this.onKeyDown);
    }
    if (this.onKeyUp) {
      window.removeEventListener("keyup", this.onKeyUp);
    }
    // Release all held notes
    for (const key of this.activeKeys) {
      const baseMidi = KEY_MAP[key];
      if (baseMidi !== undefined) {
        const midi = baseMidi + this.octaveOffset * 12;
        const msg: MidiMessage = {
          type: "noteOff",
          channel: 0,
          note: midi,
          velocity: 0,
        };
        this.midiBus.send(SOURCE_ID, { message: msg, tick: 0 });
      }
    }
    this.activeKeys.clear();
    this.midiBus.unregisterSource(SOURCE_ID);
    this.onKeyDown = null;
    this.onKeyUp = null;
  }

  /** Ignore key events when focus is on an input element. */
  private shouldIgnore(e: KeyboardEvent): boolean {
    const tag = (e.target as HTMLElement)?.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }
}
