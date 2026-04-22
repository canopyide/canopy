import { create } from "zustand";
import { usePanelStore } from "@/store/panelStore";
import {
  useWorktreeSelectionStore,
  setFleetArmedIdsGetter,
  setFleetLastArmedIdGetter,
} from "@/store/worktreeStore";
import { setFleetArmingClear } from "@/store/projectStore";
import { isAgentTerminal } from "@/utils/terminalType";
import {
  collectBoundingBoxIds,
  readEligiblePaneCoords,
} from "@/components/Terminal/fleetSelectionGrid";
import type { TerminalInstance } from "@shared/types";
import type { AgentState } from "@/types";

export type FleetArmStatePreset = "working" | "waiting" | "finished";
export type FleetArmScope = "current" | "all";

interface FleetArmingState {
  armedIds: Set<string>;
  armOrder: string[];
  armOrderById: Record<string, number>;
  lastArmedId: string | null;

  /**
   * Pinned origin for shift-click range extension. Set on plain-click,
   * cmd/ctrl-click add, and on shift-click-from-empty via the focused pane.
   * Unlike `lastArmedId`, the anchor does NOT walk when subsequent
   * shift-clicks reshape the range — so a user who overshoots can correct
   * by shift-clicking the real endpoint and the selection snaps. Matches
   * the Windows Explorer / VS Code error-forgiving selection model.
   */
  anchorId: string | null;

  armId: (id: string) => void;
  disarmId: (id: string) => void;
  toggleId: (id: string) => void;
  armIds: (ids: string[]) => void;
  setAnchor: (id: string | null) => void;
  /**
   * Shift-click extend. When called without an ordered list, uses the
   * DOM-computed (col, row) grid of eligible panes to arm every pane
   * inside the bounding rectangle between `anchorId` (fallback:
   * `lastArmedId`) and `targetId` — the terminal-grid path.
   *
   * When called WITH `orderedIds`, treats the ids as a 1-D linear list
   * (used by the worktree sidebar where panes stack vertically) and arms
   * the inclusive slice between anchor and target. Falls back to arming
   * `targetId` alone when no anchor is available or when endpoints don't
   * appear in the list / DOM.
   */
  extendTo: (targetId: string, orderedIds?: string[]) => void;
  armByState: (state: FleetArmStatePreset, scope: FleetArmScope, extend: boolean) => void;
  armAll: (scope: FleetArmScope) => void;
  armMatchingFilter: (worktreeIds: string[]) => void;
  clear: () => void;
  prune: (validIds: Set<string>) => void;
}

function rebuildOrderById(order: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < order.length; i++) {
    out[order[i]!] = i + 1;
  }
  return out;
}

function matchesPreset(state: AgentState | null | undefined, preset: FleetArmStatePreset): boolean {
  switch (preset) {
    case "working":
      return state === "working" || state === "running";
    case "waiting":
      return state === "waiting";
    case "finished":
      return state === "completed" || state === "exited";
  }
}

export function isFleetArmEligible(t: TerminalInstance | undefined): t is TerminalInstance {
  if (!t) return false;
  if (t.location === "trash" || t.location === "background") return false;
  if (t.hasPty === false) return false;
  return isAgentTerminal(t.kind ?? t.type, t.agentId);
}

/**
 * Collect eligible terminal ids, ordered by panelIds (DOM/sidebar order),
 * optionally scoped to the currently active worktree.
 */
export function collectEligibleIds(
  scope: FleetArmScope,
  activeWorktreeId: string | null
): string[] {
  const state = usePanelStore.getState();
  const ids: string[] = [];
  for (const id of state.panelIds) {
    const t = state.panelsById[id];
    if (!isFleetArmEligible(t)) continue;
    if (scope === "current") {
      if (!activeWorktreeId || t.worktreeId !== activeWorktreeId) continue;
    }
    ids.push(id);
  }
  return ids;
}

export const useFleetArmingStore = create<FleetArmingState>()((set, get) => ({
  armedIds: new Set<string>(),
  armOrder: [],
  armOrderById: {},
  lastArmedId: null,
  anchorId: null,

  armId: (id) =>
    set((s) => {
      if (s.armedIds.has(id)) {
        return { lastArmedId: id, anchorId: s.anchorId ?? id };
      }
      const nextArmed = new Set(s.armedIds);
      nextArmed.add(id);
      const nextOrder = [...s.armOrder, id];
      return {
        armedIds: nextArmed,
        armOrder: nextOrder,
        armOrderById: rebuildOrderById(nextOrder),
        lastArmedId: id,
        anchorId: s.anchorId ?? id,
      };
    }),

  disarmId: (id) =>
    set((s) => {
      if (!s.armedIds.has(id)) return {};
      const nextArmed = new Set(s.armedIds);
      nextArmed.delete(id);
      const nextOrder = s.armOrder.filter((x) => x !== id);
      const nextLast =
        s.lastArmedId === id ? (nextOrder[nextOrder.length - 1] ?? null) : s.lastArmedId;
      const nextAnchor = s.anchorId === id ? (nextOrder[0] ?? null) : s.anchorId;
      return {
        armedIds: nextArmed,
        armOrder: nextOrder,
        armOrderById: rebuildOrderById(nextOrder),
        lastArmedId: nextLast,
        anchorId: nextAnchor,
      };
    }),

  toggleId: (id) => {
    if (get().armedIds.has(id)) {
      get().disarmId(id);
    } else {
      // Cmd/Ctrl-click on an unarmed pane updates the anchor so the next
      // shift-click extends a range from the most recently toggled pane.
      // Matches Win32 SELFLAG_ADDSELECTION + SELFLAG_TAKEFOCUS semantics.
      set({ anchorId: id });
      get().armId(id);
    }
  },

  armIds: (ids) => {
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        unique.push(id);
      }
    }
    set({
      armedIds: new Set(unique),
      armOrder: unique,
      armOrderById: rebuildOrderById(unique),
      lastArmedId: unique[unique.length - 1] ?? null,
      anchorId: unique[0] ?? null,
    });
  },

  setAnchor: (id) => set({ anchorId: id }),

  extendTo: (targetId, orderedIds) => {
    const { anchorId, lastArmedId } = get();
    const pivot = anchorId ?? lastArmedId;
    if (pivot == null) {
      // No anchor available — treat as a plain arm of the target.
      get().armId(targetId);
      return;
    }

    let rangeIds: string[] = [];

    if (orderedIds && orderedIds.length > 0) {
      // 1-D linear range path (sidebar list contexts). Arm the inclusive
      // slice between anchor and target in the caller's visual order.
      const startIdx = orderedIds.indexOf(pivot);
      const endIdx = orderedIds.indexOf(targetId);
      if (startIdx !== -1 && endIdx !== -1) {
        const [lo, hi] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        rangeIds = orderedIds.slice(lo, hi + 1);
      }
    } else {
      // 2-D grid path: read pane bounding rects from the DOM and select
      // every eligible pane inside the rectangle spanned by anchor/target.
      const eligibleIds = new Set<string>();
      const panelState = usePanelStore.getState();
      for (const id of panelState.panelIds) {
        const t = panelState.panelsById[id];
        if (isFleetArmEligible(t)) eligibleIds.add(id);
      }
      eligibleIds.add(pivot);
      eligibleIds.add(targetId);
      const container = typeof document !== "undefined" ? document.body : null;
      const coords = container ? readEligiblePaneCoords(container, eligibleIds) : [];
      rangeIds = collectBoundingBoxIds(coords, pivot, targetId);
    }

    if (rangeIds.length === 0) {
      // Range computation produced nothing (DOM not mounted, endpoints
      // missing from the list) — fall back to arming the target so the
      // gesture isn't silently dropped.
      get().armId(targetId);
      return;
    }

    set((s) => {
      const nextArmed = new Set(s.armedIds);
      const nextOrder = [...s.armOrder];
      for (const rid of rangeIds) {
        if (!nextArmed.has(rid)) {
          nextArmed.add(rid);
          nextOrder.push(rid);
        }
      }
      return {
        armedIds: nextArmed,
        armOrder: nextOrder,
        armOrderById: rebuildOrderById(nextOrder),
        lastArmedId: targetId,
        // Anchor stays pinned — do NOT walk with the extension, so the
        // user can shift-click the opposite endpoint to correct overshoot.
        anchorId: s.anchorId ?? pivot,
      };
    });
  },

  armByState: (preset, scope, extend) => {
    const state = usePanelStore.getState();
    const activeWorktreeId = getActiveWorktreeId();
    const ids: string[] = [];
    for (const id of state.panelIds) {
      const t = state.panelsById[id];
      if (!isFleetArmEligible(t)) continue;
      if (scope === "current") {
        if (!activeWorktreeId || t.worktreeId !== activeWorktreeId) continue;
      }
      if (matchesPreset(t.agentState ?? null, preset)) {
        ids.push(id);
      }
    }
    if (extend) {
      set((s) => {
        const nextArmed = new Set(s.armedIds);
        const nextOrder = [...s.armOrder];
        let lastAdded: string | null = null;
        for (const id of ids) {
          if (!nextArmed.has(id)) {
            nextArmed.add(id);
            nextOrder.push(id);
            lastAdded = id;
          }
        }
        if (lastAdded === null) return {};
        return {
          armedIds: nextArmed,
          armOrder: nextOrder,
          armOrderById: rebuildOrderById(nextOrder),
          lastArmedId: lastAdded,
        };
      });
    } else {
      get().armIds(ids);
    }
  },

  armAll: (scope) => {
    const ids = collectEligibleIds(scope, getActiveWorktreeId());
    get().armIds(ids);
  },

  armMatchingFilter: (worktreeIds) => {
    if (worktreeIds.length === 0) return;
    const worktreeIdSet = new Set(worktreeIds);
    const state = usePanelStore.getState();
    const ids: string[] = [];
    for (const id of state.panelIds) {
      const t = state.panelsById[id];
      if (!isFleetArmEligible(t)) continue;
      if (!t.worktreeId || !worktreeIdSet.has(t.worktreeId)) continue;
      ids.push(id);
    }
    // No eligible agents — leave the existing armed set alone rather than
    // silently clearing it. The button is still visible whenever any
    // worktrees match the filter; clicking it must not destroy the user's
    // prior selection when the filtered subset has no arm-eligible agents.
    if (ids.length === 0) return;
    get().armIds(ids);
  },

  clear: () =>
    set({
      armedIds: new Set<string>(),
      armOrder: [],
      armOrderById: {},
      lastArmedId: null,
      anchorId: null,
    }),

  prune: (validIds) =>
    set((s) => {
      let changed = false;
      const nextOrder: string[] = [];
      for (const id of s.armOrder) {
        if (validIds.has(id)) {
          nextOrder.push(id);
        } else {
          changed = true;
        }
      }
      if (!changed) return {};
      const nextArmed = new Set(nextOrder);
      const nextLast =
        s.lastArmedId && nextArmed.has(s.lastArmedId)
          ? s.lastArmedId
          : (nextOrder[nextOrder.length - 1] ?? null);
      const nextAnchor =
        s.anchorId && nextArmed.has(s.anchorId) ? s.anchorId : (nextOrder[0] ?? null);
      return {
        armedIds: nextArmed,
        armOrder: nextOrder,
        armOrderById: rebuildOrderById(nextOrder),
        lastArmedId: nextLast,
        anchorId: nextAnchor,
      };
    }),
}));

function getActiveWorktreeId(): string | null {
  return useWorktreeSelectionStore.getState().activeWorktreeId ?? null;
}

// Register the clear callback so projectStore.switchProject() can drop armed
// selections synchronously on project switch.
setFleetArmingClear(() => {
  useFleetArmingStore.getState().clear();
});

// Expose the armed-id set to worktreeStore so its terminal-streaming policy
// can keep armed cross-worktree terminals at VISIBLE during fleet scope.
// Using a getter-injection pattern (identical to `setFleetArmingClear`)
// avoids an otherwise cyclic module import.
setFleetArmedIdsGetter(() => useFleetArmingStore.getState().armedIds);
setFleetLastArmedIdGetter(() => useFleetArmingStore.getState().lastArmedId);

/**
 * Module-scope subscription: when panels are removed, relocated to trash/background,
 * or become ineligible, prune them from the armed set.
 *
 * HMR and test re-imports would otherwise stack subscribers on every module
 * reload. We store registration state on `globalThis` so a subsequent module
 * instance reuses the existing subscription but drives the *current* store —
 * mirroring the pattern in `projectStore.ts`.
 */
interface FleetArmingSubscriptionState {
  registered: boolean;
  lastSnapshot: { ids: string[]; panelsById: Record<string, TerminalInstance> } | null;
}

const FLEET_ARMING_SUBSCRIPTION_KEY = "__daintreeFleetArmingSubscription";

function getFleetArmingSubscriptionState(): FleetArmingSubscriptionState {
  const target = globalThis as typeof globalThis & {
    [FLEET_ARMING_SUBSCRIPTION_KEY]?: FleetArmingSubscriptionState;
  };
  const existing = target[FLEET_ARMING_SUBSCRIPTION_KEY];
  if (existing) return existing;
  const created: FleetArmingSubscriptionState = { registered: false, lastSnapshot: null };
  target[FLEET_ARMING_SUBSCRIPTION_KEY] = created;
  return created;
}

if (typeof usePanelStore.subscribe === "function") {
  const subState = getFleetArmingSubscriptionState();
  if (!subState.registered) {
    subState.registered = true;
    subState.lastSnapshot = {
      ids: usePanelStore.getState().panelIds,
      panelsById: usePanelStore.getState().panelsById,
    };

    usePanelStore.subscribe((state) => {
      const prev = subState.lastSnapshot;
      const currentIds = state.panelIds;
      const currentById = state.panelsById;

      if (prev && currentIds === prev.ids && currentById === prev.panelsById) return;

      subState.lastSnapshot = { ids: currentIds, panelsById: currentById };

      const armed = useFleetArmingStore.getState().armedIds;
      if (armed.size === 0) return;

      const validIds = new Set<string>();
      for (const id of currentIds) {
        const t = currentById[id];
        if (isFleetArmEligible(t)) validIds.add(id);
      }

      for (const id of armed) {
        if (!validIds.has(id)) {
          useFleetArmingStore.getState().prune(validIds);
          return;
        }
      }
    });
  }
}
