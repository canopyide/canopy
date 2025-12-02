import type { StateCreator } from "zustand";
import type { TerminalInstance } from "./terminalRegistrySlice";

export interface TerminalFocusSlice {
  focusedId: string | null;
  maximizedId: string | null;

  setFocused: (id: string | null) => void;
  toggleMaximize: (id: string) => void;
  focusNext: () => void;
  focusPrevious: () => void;

  handleTerminalRemoved: (
    removedId: string,
    terminals: TerminalInstance[],
    removedIndex: number
  ) => void;
}

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
      // Only navigate through grid terminals (not docked ones)
      const gridTerminals = terminals.filter((t) => t.location === "grid" || !t.location);
      if (gridTerminals.length === 0) return;

      set((state) => {
        const currentIndex = state.focusedId
          ? gridTerminals.findIndex((t) => t.id === state.focusedId)
          : -1;
        const nextIndex = (currentIndex + 1) % gridTerminals.length;
        return { focusedId: gridTerminals[nextIndex].id };
      });
    },

    focusPrevious: () => {
      const terminals = getTerminals();
      // Only navigate through grid terminals (not docked ones)
      const gridTerminals = terminals.filter((t) => t.location === "grid" || !t.location);
      if (gridTerminals.length === 0) return;

      set((state) => {
        const currentIndex = state.focusedId
          ? gridTerminals.findIndex((t) => t.id === state.focusedId)
          : 0;
        const prevIndex = currentIndex <= 0 ? gridTerminals.length - 1 : currentIndex - 1;
        return { focusedId: gridTerminals[prevIndex].id };
      });
    },

    handleTerminalRemoved: (removedId, remainingTerminals, removedIndex) => {
      set((state) => {
        const updates: Partial<TerminalFocusSlice> = {};

        if (state.focusedId === removedId) {
          // Only focus grid terminals (not docked ones)
          const gridTerminals = remainingTerminals.filter(
            (t) => t.location === "grid" || !t.location
          );

          if (gridTerminals.length > 0) {
            const nextIndex = Math.min(removedIndex, gridTerminals.length - 1);
            updates.focusedId = gridTerminals[nextIndex]?.id || null;
          } else {
            updates.focusedId = null;
          }
        }

        if (state.maximizedId === removedId) {
          updates.maximizedId = null;
        }

        return Object.keys(updates).length > 0 ? updates : state;
      });
    },
  });
