/**
 * Types are imported from the shared types module.
 */

import type { ElectronAPI, BranchInfo, CreateWorktreeOptions } from "@shared/types";

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

// Re-export ElectronAPI for consumers that import from this file
export type { ElectronAPI, BranchInfo, CreateWorktreeOptions };
