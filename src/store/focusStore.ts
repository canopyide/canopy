import { create, type StateCreator } from "zustand";

export interface PanelState {
  sidebarWidth: number;
  diagnosticsOpen: boolean;
}

interface FocusState {
  isFocusMode: boolean;
  savedPanelState: PanelState | null;

  toggleFocusMode: (currentPanelState: PanelState) => void;
  setFocusMode: (enabled: boolean, currentPanelState?: PanelState) => void;
  getSavedPanelState: () => PanelState | null;
  reset: () => void;
}

const createFocusStore: StateCreator<FocusState> = (set, get) => ({
  isFocusMode: false,
  savedPanelState: null,

  toggleFocusMode: (currentPanelState) =>
    set((state) => {
      if (state.isFocusMode) {
        return { isFocusMode: false, savedPanelState: null };
      } else {
        return { isFocusMode: true, savedPanelState: currentPanelState };
      }
    }),

  setFocusMode: (enabled, currentPanelState) =>
    set((state) => {
      if (enabled && !state.isFocusMode && currentPanelState) {
        return { isFocusMode: true, savedPanelState: currentPanelState };
      } else if (!enabled && state.isFocusMode) {
        return { isFocusMode: false, savedPanelState: null };
      }
      return state;
    }),

  getSavedPanelState: () => get().savedPanelState,

  reset: () =>
    set({
      isFocusMode: false,
      savedPanelState: null,
    }),
});

export const useFocusStore = create<FocusState>(createFocusStore);
