import type {
  WorktreeState,
  CreateWorktreeOptions,
  BranchInfo,
  AdaptiveBackoffMetrics,
} from "@shared/types";

/**
 * @example
 * ```typescript
 * import { worktreeClient } from "@/clients/worktreeClient";
 *
 * const worktrees = await worktreeClient.getAll();
 * const cleanup = worktreeClient.onUpdate((state) => console.log(state));
 * ```
 */
export const worktreeClient = {
  getAll: (): Promise<WorktreeState[]> => {
    return window.electron.worktree.getAll();
  },

  refresh: (): Promise<void> => {
    return window.electron.worktree.refresh();
  },

  refreshPullRequests: (): Promise<void> => {
    return window.electron.worktree.refreshPullRequests();
  },

  setActive: (worktreeId: string): Promise<void> => {
    return window.electron.worktree.setActive(worktreeId);
  },

  create: (options: CreateWorktreeOptions, rootPath: string): Promise<void> => {
    return window.electron.worktree.create(options, rootPath);
  },

  listBranches: (rootPath: string): Promise<BranchInfo[]> => {
    return window.electron.worktree.listBranches(rootPath);
  },

  getDefaultPath: (rootPath: string, branchName: string): Promise<string> => {
    return window.electron.worktree.getDefaultPath(rootPath, branchName);
  },

  setAdaptiveBackoffConfig: (
    enabled: boolean,
    maxInterval?: number,
    threshold?: number
  ): Promise<void> => {
    return window.electron.worktree.setAdaptiveBackoffConfig(enabled, maxInterval, threshold);
  },

  isCircuitBreakerTripped: (worktreeId: string): Promise<boolean> => {
    return window.electron.worktree.isCircuitBreakerTripped(worktreeId);
  },

  getAdaptiveBackoffMetrics: (worktreeId: string): Promise<AdaptiveBackoffMetrics | null> => {
    return window.electron.worktree.getAdaptiveBackoffMetrics(worktreeId);
  },

  onUpdate: (callback: (state: WorktreeState) => void): (() => void) => {
    return window.electron.worktree.onUpdate(callback);
  },

  onRemove: (callback: (data: { worktreeId: string }) => void): (() => void) => {
    return window.electron.worktree.onRemove(callback);
  },
} as const;
