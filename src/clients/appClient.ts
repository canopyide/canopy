/**
 * App State IPC Client
 *
 * Provides a typed interface for app state IPC operations.
 * Wraps window.electron.app.* calls for testability and maintainability.
 */

import type { AppState } from "@shared/types";

/**
 * Client for app state IPC operations.
 *
 * @example
 * ```typescript
 * import { appClient } from "@/clients/appClient";
 *
 * const state = await appClient.getState();
 * await appClient.setState({ sidebarWidth: 400 });
 * ```
 */
export const appClient = {
  /** Get the current app state */
  getState: (): Promise<AppState> => {
    return window.electron.app.getState();
  },

  /** Update app state with partial values */
  setState: (partialState: Partial<AppState>): Promise<void> => {
    return window.electron.app.setState(partialState);
  },

  /** Get app version */
  getVersion: (): Promise<string> => {
    return window.electron.app.getVersion();
  },
} as const;
