import { useEffect, useRef } from "react";
import { useTerminalStore } from "@/store/terminalStore";
import { usePerformanceModeStore } from "@/store/performanceModeStore";
import { useNotificationStore } from "@/store/notificationStore";

const DEBOUNCE_MS = 2000;

export function useTerminalPerformance() {
  const terminalCount = useTerminalStore((state) => state.terminals.length);
  const performanceMode = usePerformanceModeStore((state) => state.performanceMode);
  const autoEnabled = usePerformanceModeStore((state) => state.autoEnabled);
  const threshold = usePerformanceModeStore((state) => state.autoEnableThreshold);
  const enablePerformanceMode = usePerformanceModeStore((state) => state.enablePerformanceMode);
  const disablePerformanceMode = usePerformanceModeStore((state) => state.disablePerformanceMode);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCountRef = useRef<number>(terminalCount);
  const manuallyDisabledRef = useRef<boolean>(false);
  const prevPerformanceModeRef = useRef<boolean>(performanceMode);

  useEffect(() => {
    const prevCount = lastCountRef.current;
    lastCountRef.current = terminalCount;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const crossedBelowThreshold = prevCount >= threshold && terminalCount < threshold;
    if (crossedBelowThreshold) {
      manuallyDisabledRef.current = false;
    }

    debounceRef.current = setTimeout(() => {
      const shouldEnable = terminalCount >= threshold && !performanceMode;
      const shouldDisable = terminalCount < threshold && autoEnabled;

      if (shouldEnable && !manuallyDisabledRef.current) {
        enablePerformanceMode(true);
        addNotification({
          type: "info",
          title: "Performance Mode Enabled",
          message: `${terminalCount} terminals active. Scrollback reduced to optimize performance.`,
          duration: 5000,
        });
      } else if (shouldDisable) {
        disablePerformanceMode();
        addNotification({
          type: "info",
          title: "Performance Mode Disabled",
          message: `Terminal count dropped to ${terminalCount}. Scrollback restored.`,
          duration: 5000,
        });
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [
    terminalCount,
    threshold,
    performanceMode,
    autoEnabled,
    enablePerformanceMode,
    disablePerformanceMode,
    addNotification,
  ]);

  useEffect(() => {
    const wasEnabled = prevPerformanceModeRef.current;
    prevPerformanceModeRef.current = performanceMode;

    if (wasEnabled && !performanceMode && autoEnabled) {
      manuallyDisabledRef.current = true;
    }

    if (performanceMode && !autoEnabled) {
      manuallyDisabledRef.current = false;
    }
  }, [performanceMode, autoEnabled]);
}
