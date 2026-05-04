import { create, type StateCreator } from "zustand";

export interface PanelState {
  sidebarWidth: number;
  diagnosticsOpen: boolean;
}

interface GestureSnapshot {
  hidSidebar: boolean;
  hidAssistant: boolean;
}

interface FocusState {
  // Per-sidebar gesture suppression flags. Set when the focus-mode gesture
  // (double-click on a panel header) hides each sidebar; cleared when the
  // inverse gesture restores them, when the sidebar's own toggle takes
  // explicit ownership, or when a dialog opens. Independent so the user can
  // hide one sidebar without dragging the other along.
  gestureSidebarHidden: boolean;
  gestureAssistantHidden: boolean;

  // Mirrors `gestureSidebarHidden || gestureAssistantHidden`. Maintained as a
  // plain field (not a getter) so Zustand selectors and shallow comparisons
  // see it like any other reactive value. Kept for backward compat with
  // consumers that reason about a single "focus mode" boolean (Toolbar,
  // DockedTerminalItem, DockedTabGroup).
  isFocusMode: boolean;

  // Recorded at gesture entry so the inverse gesture restores exactly the
  // sidebars that were visible — not "everything". Cleared once both gesture
  // flags settle back to false.
  gestureSnapshot: GestureSnapshot | null;

  savedPanelState: PanelState | null;

  toggleFocusMode: (
    currentPanelState: PanelState,
    visibility?: { sidebarVisible: boolean; assistantVisible: boolean }
  ) => void;
  setFocusMode: (enabled: boolean, currentPanelState?: PanelState) => void;
  setSidebarGestureHidden: (hidden: boolean, currentPanelState?: PanelState) => void;
  clearSidebarGesture: () => void;
  clearAssistantGesture: () => void;
  getSavedPanelState: () => PanelState | null;
  reset: () => void;
}

const createFocusStore: StateCreator<FocusState> = (set, get) => ({
  gestureSidebarHidden: false,
  gestureAssistantHidden: false,
  isFocusMode: false,
  gestureSnapshot: null,
  savedPanelState: null,

  toggleFocusMode: (currentPanelState, visibility) =>
    set((state) => {
      if (state.isFocusMode) {
        return {
          gestureSidebarHidden: false,
          gestureAssistantHidden: false,
          isFocusMode: false,
          gestureSnapshot: null,
          savedPanelState: null,
        };
      }

      const sidebarVisible = visibility?.sidebarVisible ?? true;
      const assistantVisible = visibility?.assistantVisible ?? false;

      // No-op when neither sidebar is visible — there's nothing for the
      // gesture to hide, and entering an empty focus state would make the
      // inverse gesture restore nothing.
      if (!sidebarVisible && !assistantVisible) {
        return state;
      }

      return {
        gestureSidebarHidden: sidebarVisible,
        gestureAssistantHidden: assistantVisible,
        isFocusMode: true,
        gestureSnapshot: { hidSidebar: sidebarVisible, hidAssistant: assistantVisible },
        savedPanelState: { ...currentPanelState },
      };
    }),

  setFocusMode: (enabled, savedOrCurrentPanelState) =>
    set((state) => {
      const cloned = savedOrCurrentPanelState ? { ...savedOrCurrentPanelState } : null;

      if (enabled && !state.isFocusMode) {
        // Hydration / external enable. Map to "sidebar hidden" for backward
        // compat with persisted focusMode: true (the legacy boolean meant
        // "chrome hidden by the gesture"). The assistant follows its own
        // persisted isOpen state instead of being dragged along.
        return {
          gestureSidebarHidden: true,
          gestureAssistantHidden: false,
          isFocusMode: true,
          gestureSnapshot: { hidSidebar: true, hidAssistant: false },
          savedPanelState: cloned,
        };
      } else if (!enabled && state.isFocusMode) {
        return {
          gestureSidebarHidden: false,
          gestureAssistantHidden: false,
          isFocusMode: false,
          gestureSnapshot: null,
          savedPanelState: null,
        };
      } else if (enabled && state.isFocusMode && cloned) {
        return { ...state, savedPanelState: cloned };
      }
      return state;
    }),

  setSidebarGestureHidden: (hidden, currentPanelState) =>
    set((state) => {
      if (state.gestureSidebarHidden === hidden) return state;
      const cloned = currentPanelState ? { ...currentPanelState } : null;
      const nextSnapshot: GestureSnapshot | null =
        hidden || state.gestureAssistantHidden
          ? {
              hidSidebar: hidden,
              hidAssistant: state.gestureSnapshot?.hidAssistant ?? state.gestureAssistantHidden,
            }
          : null;
      const nextSavedPanelState =
        hidden || state.gestureAssistantHidden
          ? (cloned ?? state.savedPanelState)
          : null;
      return {
        gestureSidebarHidden: hidden,
        isFocusMode: hidden || state.gestureAssistantHidden,
        gestureSnapshot: nextSnapshot,
        savedPanelState: nextSavedPanelState,
      };
    }),

  clearSidebarGesture: () =>
    set((state) => {
      if (!state.gestureSidebarHidden) return state;
      const stillActive = state.gestureAssistantHidden;
      return {
        gestureSidebarHidden: false,
        isFocusMode: stillActive,
        gestureSnapshot: stillActive ? state.gestureSnapshot : null,
        savedPanelState: stillActive ? state.savedPanelState : null,
      };
    }),

  clearAssistantGesture: () =>
    set((state) => {
      if (!state.gestureAssistantHidden) return state;
      const stillActive = state.gestureSidebarHidden;
      return {
        gestureAssistantHidden: false,
        isFocusMode: stillActive,
        gestureSnapshot: stillActive ? state.gestureSnapshot : null,
        savedPanelState: stillActive ? state.savedPanelState : null,
      };
    }),

  getSavedPanelState: () => get().savedPanelState,

  reset: () =>
    set({
      gestureSidebarHidden: false,
      gestureAssistantHidden: false,
      isFocusMode: false,
      gestureSnapshot: null,
      savedPanelState: null,
    }),
});

export const useFocusStore = create<FocusState>(createFocusStore);
