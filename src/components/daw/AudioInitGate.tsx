"use client";

import { useCallback } from "react";
import { Volume2 } from "lucide-react";

interface AudioInitGateProps {
  started: boolean;
  onStart: () => void;
  children: React.ReactNode;
}

export function AudioInitGate({ started, onStart, children }: AudioInitGateProps) {
  const handleClick = useCallback(() => {
    onStart();
  }, [onStart]);

  if (!started) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-synth-bg">
        <button
          onClick={handleClick}
          className="flex items-center gap-3 rounded-lg border border-synth-border bg-synth-surface px-8 py-4 text-lg text-synth-text transition-colors hover:bg-synth-panel"
        >
          <Volume2 size={24} />
          Click to Start Audio Engine
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
