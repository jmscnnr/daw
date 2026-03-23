import { useRef, useCallback } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useCommandHistory } from "@/stores/command-history";
import { cloneProject, createProjectSnapshotCommand } from "@/commands/project-command-base";
import type { Project, Track } from "@/types/project";

/**
 * Captures a project snapshot on gesture start and commits a snapshot command
 * on gesture end, but only if the specified track property actually changed.
 */
export function useGestureSnapshot(
  trackId: string,
  commandName: string,
  hasChanged: (before: Track, after: Track) => boolean,
): { begin: () => void; commit: () => void } {
  const snapshotRef = useRef<Project | null>(null);
  const commitCommand = useCommandHistory((s) => s.commit);

  const begin = useCallback(() => {
    snapshotRef.current ??= cloneProject(useProjectStore.getState().project);
  }, []);

  const commit = useCallback(() => {
    const before = snapshotRef.current;
    snapshotRef.current = null;
    if (!before) return;

    const after = cloneProject(useProjectStore.getState().project);
    const beforeTrack = before.tracks.find((t) => t.id === trackId);
    const afterTrack = after.tracks.find((t) => t.id === trackId);
    if (!beforeTrack || !afterTrack || !hasChanged(beforeTrack, afterTrack)) return;

    commitCommand(createProjectSnapshotCommand(commandName, before, after));
  }, [commitCommand, trackId, commandName, hasChanged]);

  return { begin, commit };
}
