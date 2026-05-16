import { create } from "zustand";

/**
 * Boot-time facts about how this build was distributed. Populated from
 * `HydrateResult.isWindowsStore` because `process.windowsStore` is not
 * exposed inside the renderer sandbox — the main process is the source
 * of truth and forwards the value through the hydrate payload.
 *
 * Defaults to `isWindowsStore: false` so renderer code that runs before
 * hydration (or in tests) gets the safe NSIS/non-Windows path.
 */
interface DistributionState {
  isWindowsStore: boolean;
  setIsWindowsStore: (value: boolean) => void;
}

export const useDistributionStore = create<DistributionState>((set) => ({
  isWindowsStore: false,
  setIsWindowsStore: (value) => set({ isWindowsStore: value }),
}));
