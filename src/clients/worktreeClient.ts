/**
 * Worktree IPC Client
 *
 * Provides a typed interface for worktree-related IPC operations.
 * Wraps window.electron.worktree.* calls for testability and maintainability.
 */

import type {
  WorktreeState,
  CreateWorktreeOptions,
  BranchInfo,
  AdaptiveBackoffMetrics,
} from "@shared/types";

/**
 * Client for worktree IPC operations.
 *
 * @example
 * ```typescript
 * import { worktreeClient } from "@/clients/worktreeClient";
 *
 * const worktrees = await worktreeClient.getAll();
 * const cleanup = worktreeClient.onUpdate((state) => console.log(state));
 * ```
 */
export const worktreeClient = {
  /** Get all worktrees */
  getAll: (): Promise<WorktreeState[]> => {
    return window.electron.worktree.getAll();
  },

  /** Trigger a refresh of all worktrees */
  refresh: (): Promise<void> => {
    return window.electron.worktree.refresh();
  },

  /** Refresh pull request information for all worktrees */
  refreshPullRequests: (): Promise<void> => {
    return window.electron.worktree.refreshPullRequests();
  },

  /** Set the active worktree by ID */
  setActive: (worktreeId: string): Promise<void> => {
    return window.electron.worktree.setActive(worktreeId);
  },

  /** Create a new worktree */
  create: (options: CreateWorktreeOptions, rootPath: string): Promise<void> => {
    return window.electron.worktree.create(options, rootPath);
  },

  /** List branches available for worktree creation */
  listBranches: (rootPath: string): Promise<BranchInfo[]> => {
    return window.electron.worktree.listBranches(rootPath);
  },

  /** Configure adaptive backoff settings */
  setAdaptiveBackoffConfig: (
    enabled: boolean,
    maxInterval?: number,
    threshold?: number
  ): Promise<void> => {
    return window.electron.worktree.setAdaptiveBackoffConfig(enabled, maxInterval, threshold);
  },

  /** Check if circuit breaker is tripped for a worktree */
  isCircuitBreakerTripped: (worktreeId: string): Promise<boolean> => {
    return window.electron.worktree.isCircuitBreakerTripped(worktreeId);
  },

  /** Get adaptive backoff metrics for a worktree */
  getAdaptiveBackoffMetrics: (worktreeId: string): Promise<AdaptiveBackoffMetrics | null> => {
    return window.electron.worktree.getAdaptiveBackoffMetrics(worktreeId);
  },

  /** Subscribe to worktree updates. Returns cleanup function. */
  onUpdate: (callback: (state: WorktreeState) => void): (() => void) => {
    return window.electron.worktree.onUpdate(callback);
  },

  /** Subscribe to worktree removal events. Returns cleanup function. */
  onRemove: (callback: (data: { worktreeId: string }) => void): (() => void) => {
    return window.electron.worktree.onRemove(callback);
  },
} as const;
