"use client";

import { useEffect } from "react";
import { KEY_TO_MIDI } from "@/lib/midi";

export function useKeyboard(
  onNoteOn: (midi: number) => void,
  onNoteOff: (midi: number) => void,
): void {
  useEffect(() => {
    const heldKeys = new Set<string>();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const midi = KEY_TO_MIDI[e.key.toLowerCase()];
      if (midi !== undefined) {
        e.preventDefault();
        heldKeys.add(e.key.toLowerCase());
        onNoteOn(midi);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const key = e.key.toLowerCase();
      const midi = KEY_TO_MIDI[key];
      if (midi !== undefined) {
        e.preventDefault();
        heldKeys.delete(key);
        onNoteOff(midi);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [onNoteOn, onNoteOff]);
}
