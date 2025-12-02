/**
 * GitHub IPC Client
 *
 * Provides a typed interface for GitHub-related IPC operations.
 * Wraps window.electron.github.* calls for testability and maintainability.
 */

import type {
  RepositoryStats,
  GitHubCliStatus,
  GitHubTokenConfig,
  GitHubTokenValidation,
  PRDetectedPayload,
  PRClearedPayload,
} from "../types";
import type {
  GitHubIssue,
  GitHubPR,
  GitHubListOptions,
  GitHubListResponse,
} from "@shared/types/github";

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

  /** Get GitHub token configuration status */
  getConfig: (): Promise<GitHubTokenConfig> => {
    return window.electron.github.getConfig();
  },

  /** Set and validate a GitHub personal access token */
  setToken: (token: string): Promise<GitHubTokenValidation> => {
    return window.electron.github.setToken(token);
  },

  /** Clear the saved GitHub token */
  clearToken: (): Promise<void> => {
    return window.electron.github.clearToken();
  },

  /** Validate a GitHub token without saving it */
  validateToken: (token: string): Promise<GitHubTokenValidation> => {
    return window.electron.github.validateToken(token);
  },

  /** List issues with optional search and filtering */
  listIssues: (
    options: Omit<GitHubListOptions, "state"> & { state?: "open" | "closed" | "all" }
  ): Promise<GitHubListResponse<GitHubIssue>> => {
    return window.electron.github.listIssues(options);
  },

  /** List pull requests with optional search and filtering */
  listPullRequests: (
    options: Omit<GitHubListOptions, "state"> & { state?: "open" | "closed" | "merged" | "all" }
  ): Promise<GitHubListResponse<GitHubPR>> => {
    return window.electron.github.listPullRequests(options);
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
