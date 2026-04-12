import type { Migration } from "../StoreMigrations.js";

interface LegacyAgentEntry {
  selected?: boolean;
  enabled?: boolean;
  [key: string]: unknown;
}

interface LegacyAgentSettings {
  agents?: Record<string, LegacyAgentEntry>;
  [key: string]: unknown;
}

export const migration012: Migration = {
  version: 12,
  description: "Rename selected → pinned (opt-in) and retire enabled field",
  up: (store) => {
    const agentSettings = store.get("agentSettings") as LegacyAgentSettings | undefined;
    if (!agentSettings?.agents) return;

    const updatedAgents: Record<string, Record<string, unknown>> = {};

    for (const [id, entry] of Object.entries(agentSettings.agents)) {
      // Grandfather: only explicit `selected: true` becomes `pinned: true`
      const pinned = entry.selected === true;

      // Destructure out legacy fields, keep the rest
      const { selected: _s, enabled: _e, ...rest } = entry;
      updatedAgents[id] = { ...rest, pinned };
    }

    store.set("agentSettings", { ...agentSettings, agents: updatedAgents });
  },
};
