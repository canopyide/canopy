import type { StateCreator } from "zustand";
import type { TerminalInstance } from "./terminalRegistrySlice";

export type NavigationDirection = "up" | "down" | "left" | "right";

export interface TerminalFocusSlice {
  focusedId: string | null;
  maximizedId: string | null;
  activeDockTerminalId: string | null;

  setFocused: (id: string | null) => void;
  toggleMaximize: (id: string) => void;
  focusNext: () => void;
  focusPrevious: () => void;
  focusDirection: (
    direction: NavigationDirection,
    findNearest: (id: string, dir: NavigationDirection) => string | null
  ) => void;
  focusByIndex: (index: number, findByIndex: (idx: number) => string | null) => void;
  focusDockDirection: (
    direction: "left" | "right",
    findDockByIndex: (id: string, dir: "left" | "right") => string | null
  ) => void;

  // Dock terminal activation
  openDockTerminal: (id: string) => void;
  closeDockTerminal: () => void;
  activateTerminal: (id: string) => void;

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
    activeDockTerminalId: null,

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

    focusDirection: (direction, findNearest) => {
      set((state) => {
        if (!state.focusedId) return state;
        const nextId = findNearest(state.focusedId, direction);
        if (nextId) {
          return { focusedId: nextId };
        }
        return state;
      });
    },

    focusByIndex: (index, findByIndex) => {
      const nextId = findByIndex(index);
      if (nextId) {
        set({ focusedId: nextId });
      }
    },

    focusDockDirection: (direction, findDockByIndex) => {
      set((state) => {
        if (!state.focusedId) return state;
        const nextId = findDockByIndex(state.focusedId, direction);
        if (nextId) {
          return { focusedId: nextId };
        }
        return state;
      });
    },

    openDockTerminal: (id) => set({ activeDockTerminalId: id, focusedId: id }),

    closeDockTerminal: () => set({ activeDockTerminalId: null }),

    activateTerminal: (id) => {
      const terminals = getTerminals();
      const terminal = terminals.find((t) => t.id === id);
      if (!terminal) return;

      if (terminal.location === "dock") {
        set({ activeDockTerminalId: id, focusedId: id });
      } else {
        set({ focusedId: id, activeDockTerminalId: null });
      }
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

        if (state.activeDockTerminalId === removedId) {
          updates.activeDockTerminalId = null;
        }

        return Object.keys(updates).length > 0 ? updates : state;
      });
    },
  });
