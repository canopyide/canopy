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
  description: "Default-pin agents and retire legacy selected/enabled fields",
  up: (store) => {
    const agentSettings = store.get("agentSettings") as LegacyAgentSettings | undefined;
    if (!agentSettings?.agents) return;

    const updatedAgents: Record<string, Record<string, unknown>> = {};

    for (const [id, entry] of Object.entries(agentSettings.agents)) {
      // Grandfather v0.6.0 visibility: anything that wasn't explicitly
      // unselected becomes pinned. v0.6.0 normalization stayed in-memory and
      // never persisted `selected: true` for default-visible agents, so
      // `undefined` must map to `pinned: true` to match what users saw.
      const pinned = entry.selected !== false;

      const { selected: _s, enabled: _e, ...rest } = entry;
      updatedAgents[id] = { ...rest, pinned };
    }

    store.set("agentSettings", { ...agentSettings, agents: updatedAgents });
  },
};
