import { create } from "zustand";

interface RestoreConfirmationState {
  visible: boolean;
  suspectCount: number;
  crashCount: number;
  showRestoreConfirmation: (params: { suspectCount: number; crashCount: number }) => void;
  dismiss: () => void;
}

export const useRestoreConfirmationStore = create<RestoreConfirmationState>((set) => ({
  visible: false,
  suspectCount: 0,
  crashCount: 0,
  showRestoreConfirmation: ({ suspectCount, crashCount }) =>
    set({ visible: true, suspectCount, crashCount }),
  dismiss: () => set({ visible: false }),
}));
