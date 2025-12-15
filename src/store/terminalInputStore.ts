import { create } from "zustand";

export interface TerminalInputState {
  hybridInputEnabled: boolean;
  hybridInputAutoFocus: boolean;
  setHybridInputEnabled: (enabled: boolean) => void;
  setHybridInputAutoFocus: (enabled: boolean) => void;
}

export const useTerminalInputStore = create<TerminalInputState>()((set) => ({
  hybridInputEnabled: true,
  hybridInputAutoFocus: true,
  setHybridInputEnabled: (enabled) => set({ hybridInputEnabled: enabled }),
  setHybridInputAutoFocus: (enabled) => set({ hybridInputAutoFocus: enabled }),
}));
