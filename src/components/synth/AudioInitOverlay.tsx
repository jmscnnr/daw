"use client";

import { Volume2 } from "lucide-react";

interface AudioInitOverlayProps {
  onStart: () => void;
}

export function AudioInitOverlay({ onStart }: AudioInitOverlayProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-synth-bg/90 backdrop-blur-sm">
      <button
        type="button"
        onClick={onStart}
        className="flex items-center gap-3 px-8 py-4 bg-synth-accent text-white rounded-xl text-lg font-medium hover:brightness-110 transition-all active:scale-95 shadow-lg shadow-synth-accent/20"
      >
        <Volume2 size={24} />
        Click to Start Audio
      </button>
    </div>
  );
}
