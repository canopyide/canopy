import { create } from "zustand";

interface AssistantUiState {
  isOpen: boolean;
}

interface AssistantUiActions {
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useAssistantUiStore = create<AssistantUiState & AssistantUiActions>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
