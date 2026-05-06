import { create } from "zustand";
import { useNotificationHistoryStore } from "@/store/slices/notificationHistorySlice";

interface UIState {
  overlayClaims: Set<string>;
  addOverlayClaim: (id: string) => void;
  removeOverlayClaim: (id: string) => void;
  hasOpenOverlays: () => boolean;
  notificationCenterOpen: boolean;
  openNotificationCenter: () => void;
  closeNotificationCenter: () => void;
  toggleNotificationCenter: () => void;
  // Epoch ms recorded when the notification center was last closed. Used by
  // the "New since you last looked" divider to mark entries arriving after
  // the user's most recent visit. In-memory only — a fresh session starts
  // at 0 (no divider until the first close).
  lastNotificationCenterClosedAt: number;
  resetNotificationCenterLastClosedAt: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  overlayClaims: new Set<string>(),

  // Idempotent — return the same state reference when the claim is already
  // present so Zustand skips re-renders. Never mutate the existing Set; a new
  // instance is required so reference-equality subscribers update.
  addOverlayClaim: (id) =>
    set((state) => {
      if (state.overlayClaims.has(id)) return state;
      const next = new Set(state.overlayClaims);
      next.add(id);
      return { overlayClaims: next };
    }),

  removeOverlayClaim: (id) =>
    set((state) => {
      if (!state.overlayClaims.has(id)) return state;
      const next = new Set(state.overlayClaims);
      next.delete(id);
      return { overlayClaims: next };
    }),

  hasOpenOverlays: () => get().overlayClaims.size > 0,

  notificationCenterOpen: false,
  lastNotificationCenterClosedAt: 0,
  openNotificationCenter: () => {
    useNotificationHistoryStore.getState().resetEvictedCount();
    set({ notificationCenterOpen: true });
  },
  closeNotificationCenter: () =>
    set((state) => {
      if (!state.notificationCenterOpen) return state;
      return { notificationCenterOpen: false, lastNotificationCenterClosedAt: Date.now() };
    }),
  toggleNotificationCenter: () =>
    set((state) => {
      const next = !state.notificationCenterOpen;
      // Reset only on the closed → open transition; closing the center
      // should not silently zero an unread arrival counter.
      if (next) {
        useNotificationHistoryStore.getState().resetEvictedCount();
        return { notificationCenterOpen: next };
      }
      return { notificationCenterOpen: next, lastNotificationCenterClosedAt: Date.now() };
    }),
  resetNotificationCenterLastClosedAt: () => set({ lastNotificationCenterClosedAt: 0 }),
}));
