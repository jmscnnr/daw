"use client";

import { useEffect, useRef } from "react";

interface WAMPluginUIProps {
  /** The WAM instance that can create a GUI element. */
  wamInstance: { createGui?(): Promise<HTMLElement> };
}

/**
 * Hosts a WAM plugin's DOM-based GUI inside a React component.
 * WAM plugins provide their UI as a raw HTMLElement via createGui().
 */
export function WAMPluginUI({ wamInstance }: WAMPluginUIProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !wamInstance.createGui) return;

    let mounted = true;
    let guiElement: HTMLElement | null = null;

    wamInstance.createGui().then((el) => {
      if (mounted && container) {
        guiElement = el;
        container.appendChild(el);
      }
    });

    return () => {
      mounted = false;
      if (guiElement && container.contains(guiElement)) {
        container.removeChild(guiElement);
      }
    };
  }, [wamInstance]);

  return (
    <div
      ref={containerRef}
      className="wam-plugin-ui overflow-auto"
    />
  );
}
