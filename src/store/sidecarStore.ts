import { create, type StateCreator } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  SidecarLayoutMode,
  SidecarTab,
  SidecarLink,
  CliAvailability,
} from "@shared/types";
import {
  DEFAULT_SIDECAR_TABS,
  SIDECAR_MIN_WIDTH,
  SIDECAR_MAX_WIDTH,
  SIDECAR_DEFAULT_WIDTH,
  MIN_GRID_WIDTH,
  LINK_TEMPLATES,
} from "@shared/types";

interface SidecarState {
  isOpen: boolean;
  width: number;
  layoutMode: SidecarLayoutMode;
  activeTabId: string | null;
  tabs: SidecarTab[];
  createdTabs: Set<string>;
  links: SidecarLink[];
  discoveryComplete: boolean;
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
  addLink: (link: Omit<SidecarLink, "id" | "order">) => void;
  removeLink: (id: string) => void;
  updateLink: (id: string, updates: Partial<SidecarLink>) => void;
  toggleLink: (id: string) => void;
  reorderLinks: (fromIndex: number, toIndex: number) => void;
  setDiscoveredLinks: (cliAvailability: CliAvailability) => void;
  markDiscoveryComplete: () => void;
  initializeDefaultLinks: () => void;
}

function createDefaultLinks(): SidecarLink[] {
  let order = 0;
  const links: SidecarLink[] = [];

  links.push({
    id: "system-localhost",
    ...LINK_TEMPLATES.localhost,
    type: "system",
    enabled: true,
    order: order++,
  });

  links.push({
    id: "system-google",
    ...LINK_TEMPLATES.google,
    type: "system",
    enabled: true,
    order: order++,
  });

  return links;
}

const initialState: SidecarState = {
  isOpen: false,
  width: SIDECAR_DEFAULT_WIDTH,
  layoutMode: "push",
  activeTabId: null,
  tabs: DEFAULT_SIDECAR_TABS,
  createdTabs: new Set<string>(),
  links: createDefaultLinks(),
  discoveryComplete: false,
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

  addLink: (link) =>
    set((s) => {
      const maxOrder = s.links.reduce((max, l) => Math.max(max, l.order), -1);
      return {
        links: [
          ...s.links,
          {
            ...link,
            id: `user-${Date.now()}`,
            type: "user",
            enabled: true,
            order: maxOrder + 1,
          },
        ],
      };
    }),

  removeLink: (id) =>
    set((s) => {
      const filtered = s.links.filter((l) => l.id !== id);
      return {
        links: filtered.map((l, i) => ({ ...l, order: i })),
      };
    }),

  updateLink: (id, updates) =>
    set((s) => ({
      links: s.links.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    })),

  toggleLink: (id) =>
    set((s) => ({
      links: s.links.map((l) =>
        l.id === id && !l.alwaysEnabled ? { ...l, enabled: !l.enabled } : l
      ),
    })),

  reorderLinks: (fromIndex, toIndex) =>
    set((s) => {
      const links = [...s.links];
      const [moved] = links.splice(fromIndex, 1);
      links.splice(toIndex, 0, moved);
      return { links: links.map((l, i) => ({ ...l, order: i })) };
    }),

  setDiscoveredLinks: (availability) =>
    set((s) => {
      const existingUserLinks = s.links.filter((l) => l.type === "user").sort((a, b) => a.order - b.order);
      const existingSystemLinks = s.links.filter((l) => l.type === "system").sort((a, b) => a.order - b.order);
      const existingDiscoveredLinks = s.links.filter((l) => l.type === "discovered");

      const newLinks: SidecarLink[] = [];
      let order = 0;

      if (availability.claude) {
        const existing = existingDiscoveredLinks.find((l) => l.id === "discovered-claude");
        newLinks.push({
          id: "discovered-claude",
          ...LINK_TEMPLATES.claude,
          type: "discovered",
          enabled: existing?.enabled ?? true,
          order: order++,
        });
      }

      if (availability.gemini) {
        const existing = existingDiscoveredLinks.find((l) => l.id === "discovered-gemini");
        newLinks.push({
          id: "discovered-gemini",
          ...LINK_TEMPLATES.gemini,
          type: "discovered",
          enabled: existing?.enabled ?? true,
          order: order++,
        });
      }

      if (availability.codex) {
        const existing = existingDiscoveredLinks.find((l) => l.id === "discovered-chatgpt");
        newLinks.push({
          id: "discovered-chatgpt",
          ...LINK_TEMPLATES.chatgpt,
          type: "discovered",
          enabled: existing?.enabled ?? true,
          order: order++,
        });
      }

      const systemLinks = existingSystemLinks.map((l) => ({ ...l, order: order++ }));
      const userLinks = existingUserLinks.map((l) => ({ ...l, order: order++ }));

      return { links: [...newLinks, ...systemLinks, ...userLinks] };
    }),

  markDiscoveryComplete: () => set({ discoveryComplete: true }),

  initializeDefaultLinks: () =>
    set((s) => {
      if (s.links.length === 0) {
        return { links: createDefaultLinks() };
      }
      return s;
    }),
});

const sidecarStoreCreator: StateCreator<
  SidecarState & SidecarActions,
  [],
  [["zustand/persist", Partial<SidecarState>]]
> = persist(createSidecarStore, {
  name: "sidecar-storage",
  storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : undefined as any)),
  partialize: (state) => ({
    links: state.links,
    width: state.width,
  }),
});

export const useSidecarStore = create<SidecarState & SidecarActions>()(sidecarStoreCreator);
