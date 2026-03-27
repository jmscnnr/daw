"use client";

import { useCallback, useRef } from "react";
import { midiToName, MIDI_TO_KEY_LABEL } from "@/lib/midi";

const BLACK_OFFSETS = new Set([1, 3, 6, 8, 10]);
function isBlack(midi: number): boolean {
  return BLACK_OFFSETS.has(midi % 12);
}

// C4 (60) to B5 (83)
const MIDI_RANGE = Array.from({ length: 24 }, (_, i) => 60 + i);
const WHITE_NOTES = MIDI_RANGE.filter((m) => !isBlack(m));
const BLACK_NOTES = MIDI_RANGE.filter((m) => isBlack(m));

interface PianoKeyboardProps {
  activeNotes: number[];
  onNoteOn: (midi: number) => void;
  onNoteOff: (midi: number) => void;
}

export function PianoKeyboard({ activeNotes, onNoteOn, onNoteOff }: PianoKeyboardProps) {
  const activeSet = new Set(activeNotes);
  const mouseNoteRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getMidiAtPoint = useCallback((clientX: number, clientY: number): number | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Check black keys first (they're on top)
    for (const midi of BLACK_NOTES) {
      const el = container.querySelector(`[data-midi="${midi}"]`) as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        if (
          clientX >= r.left && clientX <= r.right &&
          clientY >= r.top && clientY <= r.bottom
        ) {
          return midi;
        }
      }
    }

    // Then white keys
    const whiteWidth = rect.width / WHITE_NOTES.length;
    if (y >= 0 && y <= rect.height && x >= 0 && x <= rect.width) {
      const idx = Math.floor(x / whiteWidth);
      return WHITE_NOTES[idx] ?? null;
    }

    return null;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const midi = getMidiAtPoint(e.clientX, e.clientY);
      if (midi !== null) {
        mouseNoteRef.current = midi;
        onNoteOn(midi);
      }
    },
    [getMidiAtPoint, onNoteOn],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (mouseNoteRef.current === null) return;
      const midi = getMidiAtPoint(e.clientX, e.clientY);
      if (midi !== mouseNoteRef.current) {
        onNoteOff(mouseNoteRef.current);
        if (midi !== null) {
          onNoteOn(midi);
        }
        mouseNoteRef.current = midi;
      }
    },
    [getMidiAtPoint, onNoteOn, onNoteOff],
  );

  const handlePointerUp = useCallback(() => {
    if (mouseNoteRef.current !== null) {
      onNoteOff(mouseNoteRef.current);
      mouseNoteRef.current = null;
    }
  }, [onNoteOff]);

  return (
    <div
      ref={containerRef}
      className="relative h-full select-none touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* White keys */}
      <div className="absolute inset-0 flex">
        {WHITE_NOTES.map((midi) => {
          const isActive = activeSet.has(midi);
          const label = MIDI_TO_KEY_LABEL[midi] ?? "";
          const noteName = midiToName(midi);
          return (
            <button
              key={midi}
              data-midi={midi}
              type="button"
              aria-label={noteName}
              aria-pressed={isActive}
              className={`flex-1 border-r border-synth-border flex flex-col items-center justify-end pb-1 transition-colors duration-75 ${
                isActive
                  ? "bg-[#78B4FF]"
                  : "bg-white hover:bg-gray-100"
              }`}
              tabIndex={-1}
            >
              <span className="text-[10px] text-gray-400 leading-none">{noteName}</span>
              <span className="text-[9px] text-gray-400 leading-none mt-0.5">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Black keys */}
      {BLACK_NOTES.map((midi) => {
        const isActive = activeSet.has(midi);
        const label = MIDI_TO_KEY_LABEL[midi] ?? "";

        // Position: find number of white keys below this black key
        const whitesBelow = WHITE_NOTES.filter((m) => m < midi).length;
        const whitePercent = 100 / WHITE_NOTES.length;
        const left = whitesBelow * whitePercent;
        const bw = whitePercent * 0.6;

        return (
          <button
            key={midi}
            data-midi={midi}
            type="button"
            aria-label={midiToName(midi)}
            aria-pressed={isActive}
            className={`absolute top-0 flex flex-col items-center justify-end pb-1 rounded-b transition-colors duration-75 z-10 ${
              isActive
                ? "bg-[#508CDC]"
                : "bg-[#1E1E1E] hover:bg-[#2a2a2a]"
            }`}
            style={{
              left: `calc(${left}% - ${bw / 2}%)`,
              width: `${bw}%`,
              height: "60%",
            }}
            tabIndex={-1}
          >
            <span
              className={`text-[8px] leading-none ${
                isActive ? "text-white" : "text-gray-400"
              }`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
