import { create } from "zustand";
import type { WorktreeState } from "@shared/types";
import { worktreeClient } from "@/clients";

interface WorktreeDataState {
  worktrees: Map<string, WorktreeState>;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
}

interface WorktreeDataActions {
  initialize: () => void;
  refresh: () => Promise<void>;
  getWorktree: (id: string) => WorktreeState | undefined;
  getWorktreeList: () => WorktreeState[];
}

type WorktreeDataStore = WorktreeDataState & WorktreeDataActions;

let cleanupListeners: (() => void) | null = null;
let initPromise: Promise<void> | null = null;

export const useWorktreeDataStore = create<WorktreeDataStore>()((set, get) => ({
  worktrees: new Map(),
  isLoading: true,
  error: null,
  isInitialized: false,

  initialize: () => {
    if (get().isInitialized) return;

    if (initPromise) return;

    initPromise = (async () => {
      try {
        set({ isLoading: true, error: null });

        const states = await worktreeClient.getAll();
        const map = new Map(states.map((s) => [s.id, s]));
        set({ worktrees: map, isLoading: false, isInitialized: true });

        if (!cleanupListeners) {
          const unsubUpdate = worktreeClient.onUpdate((state) => {
            set((prev) => {
              const next = new Map(prev.worktrees);
              next.set(state.id, state);
              return { worktrees: next };
            });
          });

          const unsubRemove = worktreeClient.onRemove(({ worktreeId }) => {
            set((prev) => {
              const worktree = prev.worktrees.get(worktreeId);

              // Safeguard: Never remove main worktree from the store
              if (worktree?.isMainWorktree) {
                console.warn("[WorktreeStore] Attempted to remove main worktree - blocked", {
                  worktreeId,
                  branch: worktree.branch,
                });
                return prev;
              }

              const next = new Map(prev.worktrees);
              next.delete(worktreeId);
              return { worktrees: next };
            });
          });

          cleanupListeners = () => {
            unsubUpdate();
            unsubRemove();
          };
        }
      } catch (e) {
        set({
          error: e instanceof Error ? e.message : "Failed to load worktrees",
          isLoading: false,
          isInitialized: true,
        });
      }
    })();
  },

  refresh: async () => {
    try {
      set({ error: null });
      await worktreeClient.refresh();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to refresh worktrees" });
    }
  },

  getWorktree: (id: string) => get().worktrees.get(id),

  getWorktreeList: () => {
    return Array.from(get().worktrees.values()).sort((a, b) => {
      // Use isMainWorktree flag for consistent sorting
      if (a.isMainWorktree && !b.isMainWorktree) return -1;
      if (!a.isMainWorktree && b.isMainWorktree) return 1;
      return a.name.localeCompare(b.name);
    });
  },
}));

export function cleanupWorktreeDataStore() {
  if (cleanupListeners) {
    cleanupListeners();
    cleanupListeners = null;
  }
  initPromise = null;
  useWorktreeDataStore.setState({
    worktrees: new Map(),
    isLoading: true,
    error: null,
    isInitialized: false,
  });
}
