/**
 * Focus Mode Store
 *
 * Zustand store for managing focus mode state.
 * Focus mode collapses all panels (sidebar, diagnostics dock)
 * to maximize terminal workspace.
 */

import { create, type StateCreator } from "zustand";

export interface PanelState {
  sidebarWidth: number;
  diagnosticsOpen: boolean;
}

interface FocusState {
  // Whether focus mode is currently active
  isFocusMode: boolean;

  // Saved panel states to restore when exiting focus mode
  savedPanelState: PanelState | null;

  // Actions
  toggleFocusMode: (currentPanelState: PanelState) => void;
  setFocusMode: (enabled: boolean, currentPanelState?: PanelState) => void;

  // Get the saved state for restoration
  getSavedPanelState: () => PanelState | null;
}

const createFocusStore: StateCreator<FocusState> = (set, get) => ({
  isFocusMode: false,
  savedPanelState: null,

  toggleFocusMode: (currentPanelState) =>
    set((state) => {
      if (state.isFocusMode) {
        // Exiting focus mode - clear saved state
        return { isFocusMode: false, savedPanelState: null };
      } else {
        // Entering focus mode - save current state
        return { isFocusMode: true, savedPanelState: currentPanelState };
      }
    }),

  setFocusMode: (enabled, currentPanelState) =>
    set((state) => {
      if (enabled && !state.isFocusMode && currentPanelState) {
        // Entering focus mode - save current state
        return { isFocusMode: true, savedPanelState: currentPanelState };
      } else if (!enabled && state.isFocusMode) {
        // Exiting focus mode - clear saved state
        return { isFocusMode: false, savedPanelState: null };
      }
      return state;
    }),

  getSavedPanelState: () => get().savedPanelState,
});

export const useFocusStore = create<FocusState>(createFocusStore);
