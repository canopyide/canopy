import type { ElectronAPI } from "../types/electron";

export function useElectron(): ElectronAPI {
  if (typeof window === "undefined" || !window.electron) {
    throw new Error(
      "Electron API is not available. Make sure the preload script is loaded correctly."
    );
  }

  return window.electron;
}

// Useful for conditional rendering or testing environments
export function isElectronAvailable(): boolean {
  return typeof window !== "undefined" && !!window.electron;
}
