import { create } from "zustand";
import { appClient } from "@/clients";
import type { DockMode, DockBehavior } from "@shared/types";

interface DockState {
  mode: DockMode;
  behavior: DockBehavior;
  autoHideWhenEmpty: boolean;
  compactMinimal: boolean;
  peek: boolean;
  isHydrated: boolean;
  popoverHeight: number;

  setMode: (mode: DockMode) => void;
  setBehavior: (behavior: DockBehavior) => void;
  cycleMode: () => void;
  toggleExpanded: () => void;
  setAutoHideWhenEmpty: (enabled: boolean) => void;
  setCompactMinimal: (enabled: boolean) => void;
  setPeek: (peek: boolean) => void;
  setPopoverHeight: (height: number) => void;
  hydrate: (
    state: Partial<
      Pick<
        DockState,
        "mode" | "behavior" | "autoHideWhenEmpty" | "compactMinimal" | "popoverHeight"
      >
    >
  ) => void;
}

const POPOVER_DEFAULT_HEIGHT = 500;
const POPOVER_MIN_HEIGHT = 300;
const POPOVER_MAX_HEIGHT_RATIO = 0.8;

const MODE_CYCLE: DockMode[] = ["expanded", "compact", "hidden"];

export const useDockStore = create<DockState>()((set, get) => ({
  mode: "hidden",
  behavior: "auto",
  autoHideWhenEmpty: false,
  compactMinimal: false,
  peek: false,
  isHydrated: false,
  popoverHeight: POPOVER_DEFAULT_HEIGHT,

  setMode: (mode) => {
    const normalizedMode: DockMode = mode === "slim" ? "hidden" : mode;
    // Setting mode explicitly switches to manual behavior
    set({ mode: normalizedMode, behavior: "manual" });
    const state = get();
    void persistDockState({
      mode: normalizedMode,
      behavior: state.behavior,
      autoHideWhenEmpty: state.autoHideWhenEmpty,
      compactMinimal: state.compactMinimal,
    });
  },

  setBehavior: (behavior) => {
    set({ behavior });
    const state = get();
    void persistDockState({
      mode: state.mode,
      behavior: state.behavior,
      autoHideWhenEmpty: state.autoHideWhenEmpty,
      compactMinimal: state.compactMinimal,
    });
  },

  cycleMode: () => {
    const { mode, behavior } = get();
    // In auto mode, cycling switches to manual mode
    if (behavior === "auto") {
      set({ behavior: "manual" });
    }
    const normalizedMode: DockMode = mode === "slim" ? "hidden" : mode;
    const currentIndex = MODE_CYCLE.indexOf(normalizedMode);
    const nextIndex = (currentIndex + 1) % MODE_CYCLE.length;
    const nextMode = MODE_CYCLE[nextIndex];
    set({ mode: nextMode });
    const state = get();
    void persistDockState({
      mode: state.mode,
      behavior: state.behavior,
      autoHideWhenEmpty: state.autoHideWhenEmpty,
      compactMinimal: state.compactMinimal,
    });
  },

  toggleExpanded: () => {
    const { mode, behavior } = get();
    // In auto mode, toggling switches to manual mode
    if (behavior === "auto") {
      set({ behavior: "manual" });
    }
    // Toggle between expanded and hidden, treating compact as expanded for toggle purposes
    const nextMode: DockMode = mode === "expanded" || mode === "compact" ? "hidden" : "expanded";
    set({ mode: nextMode });
    const state = get();
    void persistDockState({
      mode: state.mode,
      behavior: state.behavior,
      autoHideWhenEmpty: state.autoHideWhenEmpty,
      compactMinimal: state.compactMinimal,
    });
  },

  setAutoHideWhenEmpty: (enabled) => {
    set({ autoHideWhenEmpty: enabled });
    const state = get();
    void persistDockState({
      mode: state.mode,
      behavior: state.behavior,
      autoHideWhenEmpty: state.autoHideWhenEmpty,
      compactMinimal: state.compactMinimal,
    });
  },

  setCompactMinimal: (enabled) => {
    set({ compactMinimal: enabled });
    const state = get();
    void persistDockState({
      mode: state.mode,
      behavior: state.behavior,
      autoHideWhenEmpty: state.autoHideWhenEmpty,
      compactMinimal: enabled,
    });
  },

  setPeek: (peek) => set({ peek }),

  setPopoverHeight: (height) => {
    const clampedHeight = Math.min(
      Math.max(height, POPOVER_MIN_HEIGHT),
      window.innerHeight * POPOVER_MAX_HEIGHT_RATIO
    );
    set({ popoverHeight: clampedHeight });
    void persistPopoverHeight(clampedHeight);
  },

  hydrate: (state) => set({ ...state, isHydrated: true }),
}));

async function persistPopoverHeight(height: number): Promise<void> {
  try {
    await appClient.setState({ dockedPopoverHeight: height });
  } catch (error) {
    console.error("Failed to persist docked popover height:", error);
  }
}

export { POPOVER_DEFAULT_HEIGHT, POPOVER_MIN_HEIGHT, POPOVER_MAX_HEIGHT_RATIO };

async function persistDockState(state: {
  mode: DockMode;
  behavior: DockBehavior;
  autoHideWhenEmpty: boolean;
  compactMinimal: boolean;
}): Promise<void> {
  try {
    await appClient.setState({
      dockMode: state.mode,
      dockBehavior: state.behavior,
      dockAutoHideWhenEmpty: state.autoHideWhenEmpty,
      compactDockMinimal: state.compactMinimal,
    });
  } catch (error) {
    console.error("Failed to persist dock state:", error);
  }
}
