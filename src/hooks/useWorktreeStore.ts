import { use } from "react";
import { useStore } from "zustand";
import { WorktreeStoreContext } from "@/contexts/WorktreeStoreContext";
import {
  createWorktreeStore,
  type WorktreeViewState,
  type WorktreeViewActions,
} from "@/store/createWorktreeStore";

export function useWorktreeStore<T>(
  selector: (state: WorktreeViewState & WorktreeViewActions) => T
): T {
  const store = use(WorktreeStoreContext);
  if (!store) {
    throw new Error("useWorktreeStore must be used within WorktreeStoreProvider");
  }
  return useStore(store, selector);
}

// Stable, never-mutated fallback so the optional variant can call `useStore`
// unconditionally (Rules of Hooks) when no provider is mounted. Defaults are
// the cold-start state, so consumers read safe values (e.g. prDetectionPaused
// = false) instead of crashing in isolated component tests / stray renders.
const fallbackWorktreeStore = createWorktreeStore();

/**
 * Like {@link useWorktreeStore} but does not throw when rendered outside a
 * `WorktreeStoreProvider` — it reads from a stable default store instead.
 * Use only for ambient, non-authoritative reads (badge freshness) where a
 * missing provider should degrade gracefully rather than crash.
 */
export function useWorktreeStoreOptional<T>(
  selector: (state: WorktreeViewState & WorktreeViewActions) => T
): T {
  const store = use(WorktreeStoreContext);
  return useStore(store ?? fallbackWorktreeStore, selector);
}
