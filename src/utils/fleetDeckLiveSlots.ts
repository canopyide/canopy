import type { TerminalInstance } from "@shared/types";
import { FLEET_DECK_LIVE_TILE_CAP } from "@/store/fleetDeckStore";

/**
 * Priority tiers for selecting which tiles get live xterm mirrors (DOM renderer).
 * Lower number = higher priority. Within a tier, input appearance order wins.
 *
 * Tier 0: pinned (user override)
 * Tier 1: armed
 * Tier 2: waiting state (needs attention)
 * Tier 3: working/running
 * Tier 4: everything else
 */
function priorityTier(
  id: string,
  armed: Set<string>,
  pinned: Set<string>,
  panel: TerminalInstance | undefined
): number {
  if (pinned.has(id)) return 0;
  if (armed.has(id)) return 1;
  const state = panel?.agentState;
  if (state === "waiting" || state === "directing") return 2;
  if (state === "working" || state === "running") return 3;
  return 4;
}

/**
 * Given an ordered list of eligible terminal ids (appearance order),
 * pick up to `cap` ids for the live-mirror slots, ordered by priority.
 */
export function computeLiveSlotIds(
  eligibleIds: readonly string[],
  armedIds: Set<string>,
  pinnedIds: Set<string>,
  panelsById: Record<string, TerminalInstance | undefined>,
  cap: number = FLEET_DECK_LIVE_TILE_CAP
): string[] {
  if (cap <= 0 || eligibleIds.length === 0) return [];

  const scored = eligibleIds.map((id, index) => ({
    id,
    tier: priorityTier(id, armedIds, pinnedIds, panelsById[id]),
    index,
  }));

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.index - b.index;
  });

  const out: string[] = [];
  for (const entry of scored) {
    if (out.length >= cap) break;
    out.push(entry.id);
  }
  return out;
}
