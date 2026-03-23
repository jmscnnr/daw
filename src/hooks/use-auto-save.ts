"use client";

import { useEffect, useRef } from "react";
import { useProjectStore } from "@/stores/project-store";
import { saveProject } from "@/lib/project-db";

const DEBOUNCE_MS = 1000;

export function useAutoSave() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = useProjectStore.subscribe((state) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        saveProject(state.project).catch(console.error);
      }, DEBOUNCE_MS);
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}
