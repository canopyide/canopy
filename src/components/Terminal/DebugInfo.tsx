import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { AgentStateChangeTrigger } from "@/types";

interface DebugInfoProps {
  trigger: AgentStateChangeTrigger;
  confidence: number;
  className?: string;
}

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
  const [isEnabled, setIsEnabled] = useState(() => isDebugEnabled());

  useEffect(() => {
    const handleDebugToggle = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled: boolean }>;
      setIsEnabled(customEvent.detail.enabled);
    };

    window.addEventListener("canopy:debug-toggle", handleDebugToggle);
    return () => window.removeEventListener("canopy:debug-toggle", handleDebugToggle);
  }, []);

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

export function toggleStateDebug(): boolean {
  const newState = !isDebugEnabled();
  if (newState) {
    enableStateDebug();
  } else {
    disableStateDebug();
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("canopy:debug-toggle", { detail: { enabled: newState } }));
  }

  return newState;
}

export function getStateDebugEnabled(): boolean {
  return isDebugEnabled();
}

export default DebugInfo;
