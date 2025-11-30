/**
 * Dev Server IPC Client
 *
 * Provides a typed interface for dev server-related IPC operations.
 * Wraps window.electron.devServer.* calls for testability and maintainability.
 */

import type { DevServerState } from "@shared/types";

/**
 * Client for dev server IPC operations.
 *
 * @example
 * ```typescript
 * import { devServerClient } from "@/clients/devServerClient";
 *
 * const state = await devServerClient.start(worktreeId, worktreePath);
 * const cleanup = devServerClient.onUpdate((state) => console.log(state));
 * ```
 */
export const devServerClient = {
  /** Start a dev server for a worktree */
  start: (worktreeId: string, worktreePath: string, command?: string): Promise<DevServerState> => {
    return window.electron.devServer.start(worktreeId, worktreePath, command);
  },

  /** Stop a dev server for a worktree */
  stop: (worktreeId: string): Promise<DevServerState> => {
    return window.electron.devServer.stop(worktreeId);
  },

  /** Toggle dev server state for a worktree */
  toggle: (worktreeId: string, worktreePath: string, command?: string): Promise<DevServerState> => {
    return window.electron.devServer.toggle(worktreeId, worktreePath, command);
  },

  /** Get current dev server state for a worktree */
  getState: (worktreeId: string): Promise<DevServerState> => {
    return window.electron.devServer.getState(worktreeId);
  },

  /** Get dev server logs for a worktree */
  getLogs: (worktreeId: string): Promise<string[]> => {
    return window.electron.devServer.getLogs(worktreeId);
  },

  /** Check if a worktree has a dev script */
  hasDevScript: (worktreePath: string): Promise<boolean> => {
    return window.electron.devServer.hasDevScript(worktreePath);
  },

  /** Subscribe to dev server state updates. Returns cleanup function. */
  onUpdate: (callback: (state: DevServerState) => void): (() => void) => {
    return window.electron.devServer.onUpdate(callback);
  },

  /** Subscribe to dev server error events. Returns cleanup function. */
  onError: (callback: (data: { worktreeId: string; error: string }) => void): (() => void) => {
    return window.electron.devServer.onError(callback);
  },
} as const;
