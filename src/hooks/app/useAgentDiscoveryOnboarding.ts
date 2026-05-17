import { useEffect } from "react";
import { create } from "zustand";
import type { OnboardingState } from "@shared/types";
import { isElectronAvailable } from "@/hooks/useElectron";

/**
 * Discovery-badge TTL backstop window. An agent the user never launches still
 * stops reading as "new" once this elapses since it first became launchable —
 * otherwise the dot would linger forever for ignored agents.
 */
export const AGENT_DISCOVERY_TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface AgentDiscoveryState {
  loaded: boolean;
  seenAgentIds: string[];
  availabilityFirstSeen: Record<string, number>;
  welcomeCardDismissed: boolean;
  setupBannerDismissed: boolean;
}

const useAgentDiscoveryStore = create<AgentDiscoveryState>(() => ({
  loaded: false,
  seenAgentIds: [],
  availabilityFirstSeen: {},
  welcomeCardDismissed: false,
  setupBannerDismissed: false,
}));

let hydrating: Promise<void> | null = null;

async function hydrate(): Promise<void> {
  if (useAgentDiscoveryStore.getState().loaded) return;
  if (hydrating) return hydrating;

  hydrating = (async () => {
    if (!isElectronAvailable()) {
      useAgentDiscoveryStore.setState({ loaded: true });
      return;
    }
    const api = window.electron?.onboarding;
    if (!api?.get) {
      useAgentDiscoveryStore.setState({ loaded: true });
      return;
    }
    try {
      const state: OnboardingState = await api.get();
      useAgentDiscoveryStore.setState({
        loaded: true,
        seenAgentIds: Array.isArray(state.seenAgentIds) ? state.seenAgentIds : [],
        availabilityFirstSeen:
          state.availabilityFirstSeen && typeof state.availabilityFirstSeen === "object"
            ? state.availabilityFirstSeen
            : {},
        welcomeCardDismissed: state.welcomeCardDismissed === true,
        setupBannerDismissed: state.setupBannerDismissed === true,
      });
    } catch {
      useAgentDiscoveryStore.setState({ loaded: true });
    }
  })();

  try {
    await hydrating;
  } finally {
    hydrating = null;
  }
}

export async function markAgentsSeen(agentIds: string[]): Promise<void> {
  if (agentIds.length === 0) return;
  useAgentDiscoveryStore.setState((s) => {
    const merged = new Set(s.seenAgentIds);
    let changed = false;
    for (const id of agentIds) {
      if (!merged.has(id)) {
        merged.add(id);
        changed = true;
      }
    }
    return changed ? { ...s, seenAgentIds: Array.from(merged) } : s;
  });
  const api = window.electron?.onboarding;
  if (!api?.markAgentsSeen) return;
  try {
    await api.markAgentsSeen(agentIds);
  } catch {
    // Best-effort; optimistic local state stands.
  }
}

/**
 * Records the first time each agent became launchable so the discovery-badge
 * TTL has a start point even for agents the user never launches. Idempotent —
 * never overwrites an existing timestamp, locally or in the store.
 */
export async function recordAgentAvailabilityFirstSeen(agentIds: string[]): Promise<void> {
  if (agentIds.length === 0) return;
  const current = useAgentDiscoveryStore.getState().availabilityFirstSeen;
  const missing = agentIds.filter((id) => current[id] === undefined);
  if (missing.length === 0) return;
  const now = Date.now();
  useAgentDiscoveryStore.setState((s) => {
    const next = { ...s.availabilityFirstSeen };
    let changed = false;
    for (const id of missing) {
      if (next[id] === undefined) {
        next[id] = now;
        changed = true;
      }
    }
    return changed ? { ...s, availabilityFirstSeen: next } : s;
  });
  const api = window.electron?.onboarding;
  if (!api?.recordAvailabilityFirstSeen) return;
  try {
    await api.recordAvailabilityFirstSeen(missing);
  } catch {
    // Best-effort; optimistic local state stands.
  }
}

export async function dismissWelcomeCard(): Promise<void> {
  if (useAgentDiscoveryStore.getState().welcomeCardDismissed) return;
  useAgentDiscoveryStore.setState({ welcomeCardDismissed: true });
  const api = window.electron?.onboarding;
  if (!api?.dismissWelcomeCard) return;
  try {
    await api.dismissWelcomeCard();
  } catch {
    // Best-effort; optimistic local state stands.
  }
}

export async function dismissSetupBanner(): Promise<void> {
  if (useAgentDiscoveryStore.getState().setupBannerDismissed) return;
  useAgentDiscoveryStore.setState({ setupBannerDismissed: true });
  const api = window.electron?.onboarding;
  if (!api?.dismissSetupBanner) return;
  try {
    await api.dismissSetupBanner();
  } catch {
    // Best-effort; optimistic local state stands.
  }
}

interface AgentDiscoveryOnboarding extends AgentDiscoveryState {
  markAgentsSeen: (agentIds: string[]) => Promise<void>;
  recordAgentAvailabilityFirstSeen: (agentIds: string[]) => Promise<void>;
  dismissWelcomeCard: () => Promise<void>;
  dismissSetupBanner: () => Promise<void>;
}

/**
 * Reads the discovery-related onboarding fields from a shared Zustand store
 * and exposes optimistic mutations. Hydration fires once on first mount and
 * is shared across all subscribers — critical for keeping the welcome card
 * (`WelcomeScreen`) and the tray badge (`AgentTrayButton`) in sync within a
 * session; see review on #5111.
 */
export function useAgentDiscoveryOnboarding(): AgentDiscoveryOnboarding {
  const loaded = useAgentDiscoveryStore((s) => s.loaded);
  const seenAgentIds = useAgentDiscoveryStore((s) => s.seenAgentIds);
  const availabilityFirstSeen = useAgentDiscoveryStore((s) => s.availabilityFirstSeen);
  const welcomeCardDismissed = useAgentDiscoveryStore((s) => s.welcomeCardDismissed);
  const setupBannerDismissed = useAgentDiscoveryStore((s) => s.setupBannerDismissed);

  useEffect(() => {
    void hydrate();
  }, []);

  return {
    loaded,
    seenAgentIds,
    availabilityFirstSeen,
    welcomeCardDismissed,
    setupBannerDismissed,
    markAgentsSeen,
    recordAgentAvailabilityFirstSeen,
    dismissWelcomeCard,
    dismissSetupBanner,
  };
}

export function resetAgentDiscoveryStoreForTests(): void {
  hydrating = null;
  useAgentDiscoveryStore.setState({
    loaded: false,
    seenAgentIds: [],
    availabilityFirstSeen: {},
    welcomeCardDismissed: false,
    setupBannerDismissed: false,
  });
}
