/**
 * Global Type Declarations for Electron API
 *
 * Declares the window.electron API available in the renderer process.
 * Types are imported from the shared types module.
 */

import type { ElectronAPI } from "@shared/types";

// Re-export ElectronAPI for consumers that import from this file
export type { ElectronAPI };

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
