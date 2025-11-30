/**
 * Worktree Store
 *
 * Zustand store for managing worktree selection and active state.
 * This allows the keyboard shortcuts in App to access the active worktree.
 */

import { create, type StateCreator } from "zustand";

interface WorktreeSelectionState {
  /** Currently active worktree ID (the one selected) */
  activeWorktreeId: string | null;
  /** Currently focused worktree ID (for keyboard navigation) */
  focusedWorktreeId: string | null;
  /** Set of worktree IDs that are expanded (showing full details) */
  expandedWorktrees: Set<string>;

  /** Set the active worktree */
  setActiveWorktree: (id: string | null) => void;
  /** Set the focused worktree */
  setFocusedWorktree: (id: string | null) => void;
  /** Select and focus a worktree */
  selectWorktree: (id: string) => void;
  /** Toggle expanded state for a worktree */
  toggleWorktreeExpanded: (id: string) => void;
  /** Set expanded state for a worktree */
  setWorktreeExpanded: (id: string, expanded: boolean) => void;
  /** Collapse all worktrees */
  collapseAllWorktrees: () => void;
}

const createWorktreeSelectionStore: StateCreator<WorktreeSelectionState> = (set) => ({
  activeWorktreeId: null,
  focusedWorktreeId: null,
  expandedWorktrees: new Set<string>(),

  setActiveWorktree: (id) => {
    set({ activeWorktreeId: id });

    // Persist active worktree
    window.electron?.app?.setState({ activeWorktreeId: id ?? undefined }).catch((error) => {
      console.error("Failed to persist active worktree:", error);
    });
  },

  setFocusedWorktree: (id) => set({ focusedWorktreeId: id }),

  selectWorktree: (id) => {
    set({ activeWorktreeId: id, focusedWorktreeId: id });

    // Persist active worktree
    window.electron?.app?.setState({ activeWorktreeId: id }).catch((error) => {
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
});

export const useWorktreeSelectionStore = create<WorktreeSelectionState>()(
  createWorktreeSelectionStore
);
