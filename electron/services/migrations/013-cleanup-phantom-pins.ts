import type { Migration } from "../StoreMigrations.js";

interface StoredAgentEntry {
  pinned?: boolean;
  [key: string]: unknown;
}

interface StoredAgentSettings {
  agents?: Record<string, StoredAgentEntry>;
  [key: string]: unknown;
}

/**
 * Phantom predicate: an entry is considered phantom IFF it has exactly one
 * key (`pinned`) and its value is `true`. These entries were synthesized by
 * the v0.7.0 normalizer and migration 012 for every registered agent —
 * including ones the user never installed — so they carry no real intent.
 *
 * Entries with `pinned: false` (explicit unpin) or any other field alongside
 * `pinned: true` (e.g. `customFlags`, `primaryModelId`, `dangerousEnabled`)
 * represent real user configuration and must be preserved untouched.
 */
function isPhantomPinEntry(entry: StoredAgentEntry): boolean {
  const keys = Object.keys(entry);
  return keys.length === 1 && keys[0] === "pinned" && entry.pinned === true;
}

export const migration013: Migration = {
  version: 13,
  description: "Clean up phantom pinned entries for uninstalled agents (issue #5158)",
  up: (store) => {
    const agentSettings = store.get("agentSettings") as StoredAgentSettings | undefined;
    if (!agentSettings?.agents) return;

    const kept: Record<string, StoredAgentEntry> = {};
    let changed = false;

    for (const [id, entry] of Object.entries(agentSettings.agents)) {
      if (isPhantomPinEntry(entry)) {
        changed = true;
        continue;
      }
      kept[id] = entry;
    }

    if (!changed) return;

    // electron-store v11 throws on `store.set(key, undefined)` — rebuild the
    // whole `agentSettings` object and write it back in one call (matches
    // migration 012's pattern and avoids the v11 delete foot-gun).
    store.set("agentSettings", { ...agentSettings, agents: kept });
  },
};
