import { BUILT_IN_AGENT_IDS } from "../config/agentIds.js";
import type { AgentSettings, AgentSettingsEntry } from "../types/agentSettings.js";
import type { AgentAvailabilityState } from "../types/ipc/system.js";
import { isAgentInstalled } from "./agentAvailability.js";

/**
 * Frozen lookup set for the built-in agent IDs — shared by the three places
 * that need to discriminate agent IDs from non-agent toolbar buttons
 * (`ToolbarSettingsTab`, `toolbarButtonMetadata`, `useOverflowBadgeSeverity`).
 * Use {@link isBuiltInAgentId} from `@shared/config/agentIds` when you need a
 * type guard; this set is for hot-path `.has(id)` checks against `string`s.
 */
export const BUILT_IN_AGENT_ID_SET: ReadonlySet<string> = new Set<string>(BUILT_IN_AGENT_IDS);

/**
 * Returns true only when the entry explicitly sets `pinned: true`. Missing
 * entries and missing `pinned` fields resolve to `false` — used by routing
 * paths (e.g. `getPinnedAgents`) that need to know whether a user has
 * deliberately pinned an agent. For toolbar visibility prefer
 * `isAgentToolbarVisible` so a missing `pinned` value follows live CLI
 * availability (tri-state semantics — see #7673).
 */
export function isAgentPinned(entry: AgentSettingsEntry | undefined | null): boolean {
  if (!entry) return false;
  return entry.pinned === true;
}

export function isAgentPinnedById(
  settings: AgentSettings | null | undefined,
  agentId: string
): boolean {
  return isAgentPinned(settings?.agents?.[agentId]);
}

/**
 * Tri-state resolver for whether an agent button should appear in the toolbar.
 *
 *  - `pinned: true`  → always visible (explicit user pin)
 *  - `pinned: false` → always hidden  (explicit user unpin)
 *  - `pinned: undefined` or no entry → follow live CLI availability — visible
 *    when the binary is installed, hidden when missing
 *
 * Canonical selector for `Toolbar.tsx` and `ToolbarSettingsTab.tsx`; both
 * surfaces must use this so they never disagree (see #7673).
 */
export function isAgentToolbarVisible(
  entry: AgentSettingsEntry | undefined | null,
  availability: AgentAvailabilityState | undefined
): boolean {
  if (entry?.pinned === true) return true;
  if (entry?.pinned === false) return false;
  return isAgentInstalled(availability);
}
