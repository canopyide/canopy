import { create } from "zustand";

interface FleetComposerState {
  draft: string;
  setDraft: (draft: string) => void;
  clearDraft: () => void;
}

export const useFleetComposerStore = create<FleetComposerState>()((set) => ({
  draft: "",
  setDraft: (draft) => set({ draft }),
  clearDraft: () => set({ draft: "" }),
}));
