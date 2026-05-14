import { create } from "zustand";
import type { AgentSettings, AgentSettingsEntry, CliAvailability } from "@shared/types";
import { agentSettingsClient } from "@/clients";
import { DEFAULT_AGENT_SETTINGS } from "@shared/types";
import { getEffectiveAgentIds } from "../../shared/config/agentRegistry";
import { isAgentPinned } from "../../shared/utils/agentPinned";
import { useCliAvailabilityStore } from "./cliAvailabilityStore";
import { formatErrorMessage } from "@shared/utils/errorMessage";

/** Bump when a future migration needs to run on existing persisted stores. */
const CURRENT_SETTINGS_VERSION = 1;

/**
 * In-memory normalization with tri-state pin semantics. `entry.pinned` is
 * authoritative and never derived from CLI availability here — the renderer
 * computes effective toolbar visibility at read time via
 * `isAgentToolbarVisible(entry, availability)` (see #7673). The two paths:
 *
 *  - No entry at all for a registered agent + `hasRealData` → seed an empty
 *    record (no `pinned` field) so the agent participates in tri-state and
 *    follows live availability until the user toggles it explicitly. Before
 *    real data (`hasRealData === false`) nothing is seeded so the orchestrator
 *    can re-run normalization once the first probe completes.
 *  - Entry exists → preserved verbatim. Explicit `pinned: true`/`false`
 *    values stand; `pinned: undefined` stays undefined.
 *
 * Does NOT persist.
 */
export function normalizeAgentSelection(
  settings: AgentSettings,
  _availability?: CliAvailability | null,
  hasRealData: boolean = false
): AgentSettings {
  const registeredIds = getEffectiveAgentIds();
  let changed = false;
  const agents = { ...settings.agents };

  for (const id of registeredIds) {
    if (!agents[id] && hasRealData) {
      agents[id] = {};
      changed = true;
    }
  }

  return changed ? { ...settings, agents } : settings;
}

/**
 * One-shot migration for pre-`settingsVersion` persisted stores. Versions
 * before the #7673 fix eagerly seeded `pinned: true/false` from a single
 * availability snapshot, freezing toolbar visibility forever. This pass
 * clears every concrete `pinned` value on legacy stores so the tri-state
 * read-time selector can take over.
 *
 * Pure function — no IPC, no async, no `useCliAvailabilityStore` access.
 * Callers issue fire-and-forget write-backs for `agentsToClear` and only
 * stamp `settingsVersion` once every clear has succeeded (see
 * `scheduleMigrationWriteBacks`).
 */
export function migrateAgentSettings(raw: AgentSettings): {
  migrated: AgentSettings;
  agentsToClear: string[];
} {
  if ((raw.settingsVersion ?? 0) >= CURRENT_SETTINGS_VERSION) {
    return { migrated: raw, agentsToClear: [] };
  }

  const agentsToClear: string[] = [];
  const agents: Record<string, AgentSettingsEntry> = {};
  for (const [id, entry] of Object.entries(raw.agents ?? {})) {
    if (entry && entry.pinned !== undefined) {
      const { pinned: _pinned, ...rest } = entry;
      agents[id] = rest;
      agentsToClear.push(id);
    } else {
      agents[id] = entry;
    }
  }

  return {
    migrated: { ...raw, agents, settingsVersion: CURRENT_SETTINGS_VERSION },
    agentsToClear,
  };
}

/**
 * Clears stale `pinned` values from the persisted store and only stamps
 * `settingsVersion` when every per-agent write has succeeded. If any clear
 * fails the version stays unstamped so the next cold start re-runs
 * migration — preserves the "freeze" fix while never prematurely marking
 * the store migrated (#7673 review feedback).
 *
 * Called fire-and-forget by the renderer hydration paths so initialize()
 * never blocks on IPC round-trips.
 */
async function scheduleMigrationWriteBacks(agentIds: readonly string[]): Promise<void> {
  if (agentIds.length === 0) return;

  const results = await Promise.allSettled(
    agentIds.map((id) =>
      agentSettingsClient.set(id, { pinned: undefined } as Partial<AgentSettingsEntry>)
    )
  );
  const allOk = results.every((r) => r.status === "fulfilled");
  if (!allOk) return;

  try {
    await agentSettingsClient.stampVersion(CURRENT_SETTINGS_VERSION);
  } catch {
    // Leave version unstamped — next cold start retries the (now no-op)
    // per-agent clears and re-attempts the version stamp.
  }
}

function readAvailabilitySnapshot(): {
  availability: CliAvailability;
  hasRealData: boolean;
} {
  const state = useCliAvailabilityStore.getState();
  return { availability: state.availability, hasRealData: state.hasRealData };
}

interface AgentSettingsState {
  settings: AgentSettings | null;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
}

interface AgentSettingsActions {
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  updateAgent: (agentId: string, updates: Partial<AgentSettingsEntry>) => Promise<void>;
  setAgentPinned: (agentId: string, pinned: boolean) => Promise<void>;
  /**
   * Set or clear the worktree-scoped preset override for an agent. Reads the
   * current `worktreePresets` map, spreads sibling keys, then writes the merged
   * map — bypasses the IPC handler's shallow-merge clobber on the submap.
   * Passing `undefined` removes the key; the map collapses to `undefined` when
   * empty.
   */
  updateWorktreePreset: (
    agentId: string,
    worktreeId: string,
    presetId: string | undefined
  ) => Promise<void>;
  reset: (agentId?: string) => Promise<void>;
}

type AgentSettingsStore = AgentSettingsState & AgentSettingsActions;

let initPromise: Promise<void> | null = null;
// Monotonic counter that guards stale async writes. `cleanupAgentSettingsStore`
// and concurrent `refresh`/`updateAgent`/`reset` calls all bump this so a
// slower in-flight normalization result can't overwrite a newer snapshot
// (see lesson #1377).
let normalizeEpoch = 0;

export const useAgentSettingsStore = create<AgentSettingsStore>()((set, get) => ({
  settings: null,
  isLoading: true,
  error: null,
  isInitialized: false,

  initialize: () => {
    if (get().isInitialized) return Promise.resolve();
    if (initPromise) return initPromise;

    const myEpoch = ++normalizeEpoch;
    // Use a holder so the `finally` block can reach back to the promise
    // reference that will exist immediately after the IIFE synchronously
    // returns. Strict TS won't let a `let`/`const` captured in the IIFE be
    // compared before assignment, but a property assignment is fine.
    const ref: { current: Promise<void> | null } = { current: null };
    const promise = (async () => {
      try {
        set({ isLoading: true, error: null });

        const raw = (await agentSettingsClient.get()) ?? DEFAULT_AGENT_SETTINGS;
        if (myEpoch !== normalizeEpoch) {
          // A concurrent refresh/update bumped the epoch — its result is
          // authoritative. Flip `isInitialized` anyway so the store exits the
          // loading state (and future `initialize()` calls no-op as intended).
          set({ isLoading: false, isInitialized: true });
          return;
        }
        const { migrated, agentsToClear } = migrateAgentSettings(raw);
        const { availability, hasRealData } = readAvailabilitySnapshot();
        const settings = normalizeAgentSelection(migrated, availability, hasRealData);
        set({ settings, isLoading: false, isInitialized: true });
        if (agentsToClear.length > 0) {
          void scheduleMigrationWriteBacks(agentsToClear);
        }
      } catch (e) {
        if (myEpoch !== normalizeEpoch) {
          set({ isLoading: false, isInitialized: true });
          return;
        }
        set({
          error: formatErrorMessage(e, "Failed to load agent settings"),
          isLoading: false,
          isInitialized: true,
        });
      } finally {
        // Clear the cached promise so a later `initialize()` can retry after
        // cleanup/reset, even if this run was superseded by a concurrent op.
        if (initPromise === ref.current) initPromise = null;
      }
    })();

    ref.current = promise;
    initPromise = promise;
    return promise;
  },

  refresh: async () => {
    const myEpoch = ++normalizeEpoch;
    set({ error: null });
    try {
      const raw = (await agentSettingsClient.get()) ?? DEFAULT_AGENT_SETTINGS;
      if (myEpoch !== normalizeEpoch) return;
      const { migrated, agentsToClear } = migrateAgentSettings(raw);
      const { availability, hasRealData } = readAvailabilitySnapshot();
      const settings = normalizeAgentSelection(migrated, availability, hasRealData);
      set({ settings });
      if (agentsToClear.length > 0) {
        void scheduleMigrationWriteBacks(agentsToClear);
      }
    } catch (e) {
      // Stale failures yield silently — whichever newer op bumped the epoch
      // owns the error surface now, and fire-and-forget callers should not
      // see spurious unhandled rejections from an invalidated attempt.
      if (myEpoch !== normalizeEpoch) return;
      set({ error: formatErrorMessage(e, "Failed to refresh agent settings") });
      throw e;
    }
  },

  updateAgent: async (agentId: string, updates: Partial<AgentSettingsEntry>) => {
    const myEpoch = ++normalizeEpoch;
    set({ error: null });
    const previous = get().settings;
    if (previous) {
      set({
        settings: {
          ...previous,
          agents: {
            ...previous.agents,
            [agentId]: { ...previous.agents[agentId], ...updates },
          },
        },
      });
    }
    try {
      const raw = await agentSettingsClient.set(agentId, updates);
      if (myEpoch !== normalizeEpoch) return;
      // Run migration against the response too — covers the edge case where
      // `updateAgent` is the first interaction with a legacy store (before
      // initialize() has hydrated) and the IPC response still carries stale
      // concrete pin values for other agents (#7673 review).
      const { migrated, agentsToClear } = migrateAgentSettings(raw);
      const { availability, hasRealData } = readAvailabilitySnapshot();
      const settings = normalizeAgentSelection(migrated, availability, hasRealData);
      set({ settings });
      if (agentsToClear.length > 0) {
        void scheduleMigrationWriteBacks(agentsToClear);
      }
    } catch (e) {
      if (myEpoch !== normalizeEpoch) return;
      if (previous) set({ settings: previous });
      set({ error: formatErrorMessage(e, `Failed to update ${agentId} settings`) });
      throw e;
    }
  },

  setAgentPinned: async (agentId: string, pinned: boolean) => {
    return get().updateAgent(agentId, { pinned });
  },

  updateWorktreePreset: async (
    agentId: string,
    worktreeId: string,
    presetId: string | undefined
  ) => {
    if (!worktreeId) return;
    const current = get().settings?.agents?.[agentId]?.worktreePresets ?? {};
    const next: Record<string, string> = { ...current };
    if (presetId === undefined) {
      delete next[worktreeId];
    } else {
      next[worktreeId] = presetId;
    }
    const merged = Object.keys(next).length > 0 ? next : undefined;
    await get().updateAgent(agentId, { worktreePresets: merged });
  },

  reset: async (agentId?: string) => {
    const myEpoch = ++normalizeEpoch;
    set({ error: null });
    try {
      const raw = await agentSettingsClient.reset(agentId);
      if (myEpoch !== normalizeEpoch) return;
      // Reset response may still represent a legacy store (per-agent reset
      // doesn't bump version); run migration to keep tri-state semantics
      // intact (#7673 review).
      const { migrated, agentsToClear } = migrateAgentSettings(raw);
      const { availability, hasRealData } = readAvailabilitySnapshot();
      const settings = normalizeAgentSelection(migrated, availability, hasRealData);
      set({ settings });
      if (agentsToClear.length > 0) {
        void scheduleMigrationWriteBacks(agentsToClear);
      }
    } catch (e) {
      if (myEpoch !== normalizeEpoch) return;
      set({ error: formatErrorMessage(e, "Failed to reset agent settings") });
      throw e;
    }
  },
}));

export function getPinnedAgents(): string[] {
  const settings = useAgentSettingsStore.getState().settings;
  if (!settings?.agents) return [];
  return Object.entries(settings.agents)
    .filter(([, entry]) => isAgentPinned(entry))
    .map(([id]) => id);
}

export function cleanupAgentSettingsStore() {
  normalizeEpoch++;
  initPromise = null;
  useAgentSettingsStore.setState({
    settings: DEFAULT_AGENT_SETTINGS,
    isLoading: true,
    error: null,
    isInitialized: false,
  });
}
