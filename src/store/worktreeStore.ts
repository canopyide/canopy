/**
 * Worktree Store
 *
 * Zustand store for managing worktree selection and active state.
 * This allows the keyboard shortcuts in App to access the active worktree.
 */

import { create, type StateCreator } from 'zustand'

interface WorktreeSelectionState {
  /** Currently active worktree ID (the one selected) */
  activeWorktreeId: string | null
  /** Currently focused worktree ID (for keyboard navigation) */
  focusedWorktreeId: string | null

  /** Set the active worktree */
  setActiveWorktree: (id: string | null) => void
  /** Set the focused worktree */
  setFocusedWorktree: (id: string | null) => void
  /** Select and focus a worktree */
  selectWorktree: (id: string) => void
}

const createWorktreeSelectionStore: StateCreator<WorktreeSelectionState> = (set) => ({
  activeWorktreeId: null,
  focusedWorktreeId: null,

  setActiveWorktree: (id) => set({ activeWorktreeId: id }),
  setFocusedWorktree: (id) => set({ focusedWorktreeId: id }),
  selectWorktree: (id) => set({ activeWorktreeId: id, focusedWorktreeId: id }),
})

export const useWorktreeSelectionStore = create<WorktreeSelectionState>()(createWorktreeSelectionStore)
