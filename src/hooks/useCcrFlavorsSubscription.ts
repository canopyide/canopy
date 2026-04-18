import { useEffect } from "react";
import { useCcrFlavorsStore } from "@/store/ccrFlavorsStore";
import type { AgentFlavor } from "@shared/config/agentRegistry";

export function useCcrFlavorsSubscription(): void {
  const setCcrFlavors = useCcrFlavorsStore((s) => s.setCcrFlavors);

  useEffect(() => {
    const fetchInitial = async () => {
      if (window.electron?.agentCapabilities?.getCcrFlavors) {
        try {
          const flavors = await window.electron.agentCapabilities.getCcrFlavors();
          if (flavors && flavors.length > 0) {
            setCcrFlavors("claude", flavors as AgentFlavor[]);
          }
        } catch {
          // Non-critical: CCR flavors may not be available
        }
      }
    };

    fetchInitial();

    if (!window.electron?.agentCapabilities?.onFlavorsUpdated) return;

    const cleanup = window.electron.agentCapabilities.onFlavorsUpdated((payload) => {
      setCcrFlavors(payload.agentId, payload.flavors as AgentFlavor[]);
    });

    return cleanup;
  }, [setCcrFlavors]);
}
