import { create } from "zustand";

interface AnnouncementEntry {
  msg: string;
  id: number;
}

interface AnnouncerState {
  polite: AnnouncementEntry | null;
  assertive: AnnouncementEntry | null;
  nextId: number;
  announce: (msg: string, priority?: "polite" | "assertive") => void;
}

export const useAnnouncerStore = create<AnnouncerState>((set) => ({
  polite: null,
  assertive: null,
  nextId: 1,
  announce: (msg, priority = "polite") => {
    set((state) => {
      const id = state.nextId;
      if (priority === "assertive") {
        return { nextId: id + 1, assertive: { msg, id } };
      }
      return { nextId: id + 1, polite: { msg, id } };
    });
  },
}));
