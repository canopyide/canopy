/**
 * Terminal Focus Slice
 *
 * Manages focus and maximize state for the terminal grid.
 * This slice is responsible for:
 * - Tracking which terminal is focused
 * - Managing maximized terminal state
 * - Focus navigation (next/previous)
 *
 * This slice is purely UI state and does not persist to electron-store.
 */

import type { StateCreator } from "zustand";
import type { TerminalInstance } from "./terminalRegistrySlice";

export interface TerminalFocusSlice {
  focusedId: string | null;
  maximizedId: string | null;

  setFocused: (id: string | null) => void;
  toggleMaximize: (id: string) => void;
  focusNext: () => void;
  focusPrevious: () => void;

  /** Called when a terminal is removed to clean up focus state */
  handleTerminalRemoved: (
    removedId: string,
    terminals: TerminalInstance[],
    removedIndex: number
  ) => void;
}

/**
 * Creates the terminal focus slice.
 *
 * @param getTerminals - Function to get current terminals from the registry slice.
 *   This is injected to avoid circular dependencies between slices.
 */
export const createTerminalFocusSlice =
  (
    getTerminals: () => TerminalInstance[]
  ): StateCreator<TerminalFocusSlice, [], [], TerminalFocusSlice> =>
  (set) => ({
    focusedId: null,
    maximizedId: null,

    setFocused: (id) => set({ focusedId: id }),

    toggleMaximize: (id) =>
      set((state) => ({
        maximizedId: state.maximizedId === id ? null : id,
      })),

    focusNext: () => {
      const terminals = getTerminals();
      if (terminals.length === 0) return;

      set((state) => {
        const currentIndex = state.focusedId
          ? terminals.findIndex((t) => t.id === state.focusedId)
          : -1;
        const nextIndex = (currentIndex + 1) % terminals.length;
        return { focusedId: terminals[nextIndex].id };
      });
    },

    focusPrevious: () => {
      const terminals = getTerminals();
      if (terminals.length === 0) return;

      set((state) => {
        const currentIndex = state.focusedId
          ? terminals.findIndex((t) => t.id === state.focusedId)
          : 0;
        const prevIndex = currentIndex <= 0 ? terminals.length - 1 : currentIndex - 1;
        return { focusedId: terminals[prevIndex].id };
      });
    },

    handleTerminalRemoved: (removedId, remainingTerminals, removedIndex) => {
      set((state) => {
        const updates: Partial<TerminalFocusSlice> = {};

        // Handle focus transfer if the removed terminal was focused
        if (state.focusedId === removedId) {
          if (remainingTerminals.length > 0) {
            // Focus the next terminal, or the previous if we removed the last one
            const nextIndex = Math.min(removedIndex, remainingTerminals.length - 1);
            updates.focusedId = remainingTerminals[nextIndex]?.id || null;
          } else {
            updates.focusedId = null;
          }
        }

        // Clear maximize state if the maximized terminal was removed
        if (state.maximizedId === removedId) {
          updates.maximizedId = null;
        }

        return Object.keys(updates).length > 0 ? updates : state;
      });
    },
  });
