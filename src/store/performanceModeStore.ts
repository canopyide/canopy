import { create } from "zustand";

interface PerformanceModeState {
  performanceMode: boolean;
  setPerformanceMode: (enabled: boolean) => void;
}

export const usePerformanceModeStore = create<PerformanceModeState>()((set) => ({
  performanceMode: false,
  setPerformanceMode: (enabled) => set({ performanceMode: enabled }),
}));
