import { create } from "zustand";

export const AUTO_ENABLE_THRESHOLD_DEFAULT = 12;
export const AUTO_ENABLE_THRESHOLD_MIN = 5;
export const AUTO_ENABLE_THRESHOLD_MAX = 50;

interface PerformanceModeState {
  performanceMode: boolean;
  autoEnabled: boolean;
  autoEnableThreshold: number;
  enablePerformanceMode: (auto?: boolean) => void;
  disablePerformanceMode: () => void;
  setAutoEnableThreshold: (threshold: number) => void;
  setPerformanceMode: (enabled: boolean) => void;
}

export const usePerformanceModeStore = create<PerformanceModeState>()((set) => ({
  performanceMode: false,
  autoEnabled: false,
  autoEnableThreshold: AUTO_ENABLE_THRESHOLD_DEFAULT,

  enablePerformanceMode: (auto = false) => {
    set({ performanceMode: true, autoEnabled: auto });
  },

  disablePerformanceMode: () => {
    set({ performanceMode: false, autoEnabled: false });
  },

  setAutoEnableThreshold: (threshold) => {
    const clamped = Math.min(
      Math.max(threshold, AUTO_ENABLE_THRESHOLD_MIN),
      AUTO_ENABLE_THRESHOLD_MAX
    );
    set({ autoEnableThreshold: clamped });
  },

  setPerformanceMode: (enabled) => set({ performanceMode: enabled, autoEnabled: false }),
}));
