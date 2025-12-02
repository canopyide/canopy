import { create, type StateCreator } from "zustand";
import { appClient } from "@/clients";

interface WorktreeSelectionState {
  activeWorktreeId: string | null;
  focusedWorktreeId: string | null;
  expandedWorktrees: Set<string>;

  setActiveWorktree: (id: string | null) => void;
  setFocusedWorktree: (id: string | null) => void;
  selectWorktree: (id: string) => void;
  toggleWorktreeExpanded: (id: string) => void;
  setWorktreeExpanded: (id: string, expanded: boolean) => void;
  collapseAllWorktrees: () => void;
  reset: () => void;
}

const createWorktreeSelectionStore: StateCreator<WorktreeSelectionState> = (set) => ({
  activeWorktreeId: null,
  focusedWorktreeId: null,
  expandedWorktrees: new Set<string>(),

  setActiveWorktree: (id) => {
    set({ activeWorktreeId: id });

    appClient.setState({ activeWorktreeId: id ?? undefined }).catch((error) => {
      console.error("Failed to persist active worktree:", error);
    });
  },

  setFocusedWorktree: (id) => set({ focusedWorktreeId: id }),

  selectWorktree: (id) => {
    set({ activeWorktreeId: id, focusedWorktreeId: id });

    appClient.setState({ activeWorktreeId: id }).catch((error) => {
      console.error("Failed to persist active worktree:", error);
    });
  },

  toggleWorktreeExpanded: (id) =>
    set((state) => {
      const next = new Set(state.expandedWorktrees);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { expandedWorktrees: next };
    }),

  setWorktreeExpanded: (id, expanded) =>
    set((state) => {
      const next = new Set(state.expandedWorktrees);
      if (expanded) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return { expandedWorktrees: next };
    }),

  collapseAllWorktrees: () => set({ expandedWorktrees: new Set<string>() }),

  reset: () =>
    set({
      activeWorktreeId: null,
      focusedWorktreeId: null,
      expandedWorktrees: new Set<string>(),
    }),
});

export const useWorktreeSelectionStore = create<WorktreeSelectionState>()(
  createWorktreeSelectionStore
);
