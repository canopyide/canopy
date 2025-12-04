import { create, type StateCreator } from "zustand";
import type { SidecarLayoutMode, SidecarTab } from "@shared/types";
import {
  DEFAULT_SIDECAR_TABS,
  SIDECAR_MIN_WIDTH,
  SIDECAR_MAX_WIDTH,
  SIDECAR_DEFAULT_WIDTH,
  MIN_GRID_WIDTH,
} from "@shared/types";

interface SidecarState {
  isOpen: boolean;
  width: number;
  layoutMode: SidecarLayoutMode;
  activeTabId: string | null;
  tabs: SidecarTab[];
  createdTabs: Set<string>;
}

interface SidecarActions {
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
  setActiveTab: (id: string) => void;
  updateTabTitle: (id: string, title: string) => void;
  updateTabUrl: (id: string, url: string) => void;
  updateLayoutMode: (windowWidth: number, sidebarWidth: number) => void;
  markTabCreated: (id: string) => void;
  isTabCreated: (id: string) => boolean;
  reset: () => void;
}

const initialState: SidecarState = {
  isOpen: false,
  width: SIDECAR_DEFAULT_WIDTH,
  layoutMode: "push",
  activeTabId: null,
  tabs: DEFAULT_SIDECAR_TABS,
  createdTabs: new Set<string>(),
};

const createSidecarStore: StateCreator<SidecarState & SidecarActions> = (set, get) => ({
  ...initialState,

  toggle: () =>
    set((s) => {
      const newOpen = !s.isOpen;
      if (newOpen && typeof window !== "undefined") {
        setTimeout(() => {
          const { updateLayoutMode } = get();
          const sidebarWidth = 350;
          updateLayoutMode(window.innerWidth, sidebarWidth);
        }, 0);
      }
      return { isOpen: newOpen };
    }),

  setOpen: (open) => {
    set({ isOpen: open });
    if (open && typeof window !== "undefined") {
      setTimeout(() => {
        const { updateLayoutMode } = get();
        const sidebarWidth = 350;
        updateLayoutMode(window.innerWidth, sidebarWidth);
      }, 0);
    }
  },

  setWidth: (width) => {
    const validWidth = Math.min(Math.max(width, SIDECAR_MIN_WIDTH), SIDECAR_MAX_WIDTH);
    set({ width: validWidth });
    if (typeof window !== "undefined") {
      setTimeout(() => {
        const { updateLayoutMode, isOpen } = get();
        if (isOpen) {
          const sidebarWidth = 350;
          updateLayoutMode(window.innerWidth, sidebarWidth);
        }
      }, 0);
    }
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabTitle: (id, title) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    })),

  updateTabUrl: (id, url) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, url } : t)),
    })),

  updateLayoutMode: (windowWidth, sidebarWidth) => {
    const { width, isOpen } = get();
    if (!isOpen) return;
    const remainingSpace = windowWidth - sidebarWidth - width;
    set({ layoutMode: remainingSpace < MIN_GRID_WIDTH ? "overlay" : "push" });
  },

  markTabCreated: (id) =>
    set((s) => {
      const newSet = new Set(s.createdTabs);
      newSet.add(id);
      return { createdTabs: newSet };
    }),

  isTabCreated: (id) => get().createdTabs.has(id),

  reset: () =>
    set({
      ...initialState,
      createdTabs: new Set<string>(),
    }),
});

export const useSidecarStore = create<SidecarState & SidecarActions>(createSidecarStore);
