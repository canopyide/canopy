/**
 * DebugInfo Component
 *
 * Displays debug information about agent state detection in terminal headers.
 * Shows the trigger source (heuristic, user, timeout) and confidence level.
 * Visibility is controlled by a localStorage flag for development use.
 *
 * Example output: "(heuristic, 75%)"
 *
 * Enable via localStorage: localStorage.setItem('CANOPY_STATE_DEBUG', '1')
 * Or via Settings > Troubleshooting > Show State Debug Info
 */

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { AgentStateChangeTrigger } from "@/types";

interface DebugInfoProps {
  /** What triggered the state change */
  trigger: AgentStateChangeTrigger;
  /** Confidence level of the detection (0.0 - 1.0) */
  confidence: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Check if debug mode is enabled.
 * Reads from localStorage to allow runtime toggling.
 * Handles Safari private mode and other storage exceptions gracefully.
 */
function isDebugEnabled(): boolean {
  if (typeof localStorage === "undefined") {
    return false;
  }
  try {
    return localStorage.getItem("CANOPY_STATE_DEBUG") === "1";
  } catch {
    // Safari private mode or storage access denied
    return false;
  }
}

export function DebugInfo({ trigger, confidence, className }: DebugInfoProps) {
  // Track debug mode state and re-render when it changes
  const [isEnabled, setIsEnabled] = useState(() => isDebugEnabled());

  useEffect(() => {
    // Listen for debug toggle changes from settings
    const handleDebugToggle = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled: boolean }>;
      setIsEnabled(customEvent.detail.enabled);
    };

    window.addEventListener("canopy:debug-toggle", handleDebugToggle);
    return () => window.removeEventListener("canopy:debug-toggle", handleDebugToggle);
  }, []);

  // Only render when debug mode is enabled
  if (!isEnabled) {
    return null;
  }

  const confidencePercent = (confidence * 100).toFixed(0);

  return (
    <span
      className={cn("text-xs font-mono text-gray-500", className)}
      title={`Trigger: ${trigger}\nConfidence: ${confidencePercent}%`}
    >
      ({trigger}, {confidencePercent}%)
    </span>
  );
}

/**
 * Enable state debug mode.
 * Persists to localStorage for cross-session debugging.
 * Handles Safari private mode and other storage exceptions gracefully.
 */
export function enableStateDebug(): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem("CANOPY_STATE_DEBUG", "1");
  } catch {
    // Silently fail in Safari private mode or when storage is unavailable
    console.warn("Failed to enable state debug mode - localStorage unavailable");
  }
}

/**
 * Disable state debug mode.
 * Handles Safari private mode and other storage exceptions gracefully.
 */
export function disableStateDebug(): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.removeItem("CANOPY_STATE_DEBUG");
  } catch {
    // Silently fail in Safari private mode or when storage is unavailable
    console.warn("Failed to disable state debug mode - localStorage unavailable");
  }
}

/**
 * Toggle state debug mode.
 * @returns The new state (true = enabled)
 */
export function toggleStateDebug(): boolean {
  const newState = !isDebugEnabled();
  if (newState) {
    enableStateDebug();
  } else {
    disableStateDebug();
  }

  // Dispatch custom event to notify components of the change
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("canopy:debug-toggle", { detail: { enabled: newState } }));
  }

  return newState;
}

/**
 * Get current debug mode state.
 */
export function getStateDebugEnabled(): boolean {
  return isDebugEnabled();
}

export default DebugInfo;
