/**
 * GitHub IPC Client
 *
 * Provides a typed interface for GitHub-related IPC operations.
 * Wraps window.electron.github.* calls for testability and maintainability.
 */

import type {
  RepositoryStats,
  GitHubCliStatus,
  PRDetectedPayload,
  PRClearedPayload,
} from "../types";

/**
 * Client for GitHub IPC operations.
 *
 * @example
 * ```typescript
 * import { githubClient } from "@/clients/githubClient";
 *
 * const stats = await githubClient.getRepoStats("/path/to/repo");
 * await githubClient.openIssue("/path/to/repo", 123);
 * ```
 */
export const githubClient = {
  /** Get repository statistics (commit count, issue count, PR count) */
  getRepoStats: (cwd: string): Promise<RepositoryStats> => {
    return window.electron.github.getRepoStats(cwd);
  },

  /** Open the repository issues page in the browser */
  openIssues: (cwd: string): Promise<void> => {
    return window.electron.github.openIssues(cwd);
  },

  /** Open the repository pull requests page in the browser */
  openPRs: (cwd: string): Promise<void> => {
    return window.electron.github.openPRs(cwd);
  },

  /** Open a specific issue in the browser */
  openIssue: (cwd: string, issueNumber: number): Promise<void> => {
    return window.electron.github.openIssue(cwd, issueNumber);
  },

  /** Open a pull request in the browser */
  openPR: (prUrl: string): Promise<void> => {
    return window.electron.github.openPR(prUrl);
  },

  /** Check if GitHub CLI is available and authenticated */
  checkCli: (): Promise<GitHubCliStatus> => {
    return window.electron.github.checkCli();
  },

  /** Subscribe to PR detected events */
  onPRDetected: (callback: (data: PRDetectedPayload) => void): (() => void) => {
    return window.electron.github.onPRDetected(callback);
  },

  /** Subscribe to PR cleared events */
  onPRCleared: (callback: (data: PRClearedPayload) => void): (() => void) => {
    return window.electron.github.onPRCleared(callback);
  },
} as const;
