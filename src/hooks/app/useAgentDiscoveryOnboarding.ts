import { useCallback, useEffect, useState } from "react";
import type { OnboardingState } from "@shared/types";
import { isElectronAvailable } from "@/hooks/useElectron";

interface AgentDiscoveryOnboarding {
  loaded: boolean;
  seenAgentIds: string[];
  welcomeCardDismissed: boolean;
  markAgentsSeen: (agentIds: string[]) => Promise<void>;
  dismissWelcomeCard: () => Promise<void>;
}

/**
 * Reads the discovery-related onboarding fields once on mount and exposes
 * optimistic mutations. Local state updates before the IPC round-trip so the
 * welcome card and tray badge clear immediately when the user acts, avoiding
 * a visible flicker while the main process acknowledges the write.
 */
export function useAgentDiscoveryOnboarding(): AgentDiscoveryOnboarding {
  const [seenAgentIds, setSeenAgentIds] = useState<string[]>([]);
  const [welcomeCardDismissed, setWelcomeCardDismissed] = useState<boolean>(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isElectronAvailable()) {
      setLoaded(true);
      return;
    }
    let disposed = false;
    const api = window.electron?.onboarding;
    if (!api?.get) {
      setLoaded(true);
      return;
    }
    api
      .get()
      .then((state: OnboardingState) => {
        if (disposed) return;
        setSeenAgentIds(Array.isArray(state.seenAgentIds) ? state.seenAgentIds : []);
        setWelcomeCardDismissed(state.welcomeCardDismissed === true);
        setLoaded(true);
      })
      .catch(() => {
        if (disposed) return;
        setLoaded(true);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const markAgentsSeen = useCallback(async (agentIds: string[]) => {
    if (agentIds.length === 0) return;
    setSeenAgentIds((prev) => {
      const merged = new Set(prev);
      for (const id of agentIds) merged.add(id);
      return Array.from(merged);
    });
    const api = window.electron?.onboarding;
    if (!api?.markAgentsSeen) return;
    try {
      await api.markAgentsSeen(agentIds);
    } catch {
      // best-effort — local optimistic state stands; next reload will reconcile.
    }
  }, []);

  const dismissWelcomeCard = useCallback(async () => {
    setWelcomeCardDismissed(true);
    const api = window.electron?.onboarding;
    if (!api?.dismissWelcomeCard) return;
    try {
      await api.dismissWelcomeCard();
    } catch {
      // best-effort — local optimistic state stands; next reload will reconcile.
    }
  }, []);

  return { loaded, seenAgentIds, welcomeCardDismissed, markAgentsSeen, dismissWelcomeCard };
}
