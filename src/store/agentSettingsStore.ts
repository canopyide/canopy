import { create } from "zustand";
import type { AgentSettings, AgentSettingsEntry, CliAvailability } from "@shared/types";
import { agentSettingsClient } from "@/clients";
import { DEFAULT_AGENT_SETTINGS } from "@shared/types";
import { getEffectiveAgentIds } from "../../shared/config/agentRegistry";

interface AgentSettingsState {
  settings: AgentSettings | null;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
}

interface AgentSettingsActions {
  initialize: () => Promise<void>;
  updateAgent: (agentId: string, updates: Partial<AgentSettingsEntry>) => Promise<void>;
  setAgentSelected: (agentId: string, selected: boolean) => Promise<void>;
  reset: (agentId?: string) => Promise<void>;
}

type AgentSettingsStore = AgentSettingsState & AgentSettingsActions;

let initPromise: Promise<void> | null = null;

export const useAgentSettingsStore = create<AgentSettingsStore>()((set, get) => ({
  settings: null,
  isLoading: true,
  error: null,
  isInitialized: false,

  initialize: () => {
    if (get().isInitialized) return Promise.resolve();
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        set({ isLoading: true, error: null });

        const settings = (await agentSettingsClient.get()) ?? DEFAULT_AGENT_SETTINGS;
        set({ settings, isLoading: false, isInitialized: true });
      } catch (e) {
        set({
          error: e instanceof Error ? e.message : "Failed to load agent settings",
          isLoading: false,
          isInitialized: true,
        });
      }
    })();

    return initPromise;
  },

  updateAgent: async (agentId: string, updates: Partial<AgentSettingsEntry>) => {
    set({ error: null });
    try {
      const settings = await agentSettingsClient.set(agentId, updates);
      set({ settings });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : `Failed to update ${agentId} settings` });
      throw e;
    }
  },

  setAgentSelected: async (agentId: string, selected: boolean) => {
    return get().updateAgent(agentId, { selected });
  },

  reset: async (agentId?: string) => {
    set({ error: null });
    try {
      const settings = await agentSettingsClient.reset(agentId);
      set({ settings });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to reset agent settings" });
      throw e;
    }
  },
}));

let migrationPromise: Promise<void> | null = null;

/**
 * Migrate agents that have no `selected` field by defaulting to
 * `true` when the CLI is installed, `false` otherwise.
 * Only touches agents whose `selected` is strictly `undefined`.
 * Covers both stored agent entries and agents newly added to the registry.
 * Idempotent — subsequent calls are no-ops when all agents already have `selected` set.
 */
export async function migrateAgentSelection(availability: CliAvailability): Promise<void> {
  // Prevent concurrent executions
  if (migrationPromise) return migrationPromise;

  const { settings } = useAgentSettingsStore.getState();
  if (!settings?.agents) return;

  const registeredIds = getEffectiveAgentIds();
  const agentsNeedingMigration = registeredIds.filter(
    (agentId) => settings.agents[agentId]?.selected === undefined
  );

  if (agentsNeedingMigration.length === 0) return;

  migrationPromise = (async () => {
    try {
      for (const agentId of agentsNeedingMigration) {
        const selected = availability[agentId] === true;
        await agentSettingsClient.set(agentId, { selected });
      }

      // Re-read the full settings after all updates
      const updated = await agentSettingsClient.get();
      if (updated) {
        useAgentSettingsStore.setState({ settings: updated });
      }
    } finally {
      migrationPromise = null;
    }
  })();

  return migrationPromise;
}

export function getSelectedAgents(): string[] {
  const settings = useAgentSettingsStore.getState().settings;
  if (!settings?.agents) return [];
  return Object.entries(settings.agents)
    .filter(([, entry]) => entry.selected === true)
    .map(([id]) => id);
}

export function cleanupAgentSettingsStore() {
  initPromise = null;
  migrationPromise = null;
  useAgentSettingsStore.setState({
    settings: DEFAULT_AGENT_SETTINGS,
    isLoading: true,
    error: null,
    isInitialized: false,
  });
}
