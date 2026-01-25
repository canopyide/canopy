import { create } from "zustand";
import { githubClient } from "@/clients";
import type { PRDetectedPayload, PRClearedPayload, IssueDetectedPayload } from "@shared/types";

export interface PRData {
  prNumber: number;
  prUrl: string;
  prState: "open" | "merged" | "closed";
  prTitle?: string;
  issueNumber?: number;
  issueTitle?: string;
  timestamp: number;
}

interface GitHubDataState {
  prsByWorktree: Map<string, PRData>;
  issuesByWorktree: Map<string, { issueNumber: number; issueTitle: string }>;
  isInitialized: boolean;
}

interface GitHubDataActions {
  initialize: () => void;
  reset: () => void;
  getOpenPRCount: () => number;
  getOpenIssueCount: () => number;
  getPRForWorktree: (worktreeId: string) => PRData | undefined;
  getIssueForWorktree: (
    worktreeId: string
  ) => { issueNumber: number; issueTitle: string } | undefined;
}

type GitHubDataStore = GitHubDataState & GitHubDataActions;

let cleanupListeners: (() => void) | null = null;

export const useGitHubDataStore = create<GitHubDataStore>()((set, get) => ({
  prsByWorktree: new Map(),
  issuesByWorktree: new Map(),
  isInitialized: false,

  initialize: () => {
    if (get().isInitialized) return;

    if (!cleanupListeners) {
      const unsubPRDetected = githubClient.onPRDetected((data: PRDetectedPayload) => {
        set((prev) => {
          const next = new Map(prev.prsByWorktree);
          next.set(data.worktreeId, {
            prNumber: data.prNumber,
            prUrl: data.prUrl,
            prState: data.prState,
            prTitle: data.prTitle,
            issueNumber: data.issueNumber,
            issueTitle: data.issueTitle,
            timestamp: data.timestamp,
          });

          // Only clone and update issues map if there's issue data
          if (data.issueNumber && data.issueTitle) {
            const issuesNext = new Map(prev.issuesByWorktree);
            issuesNext.set(data.worktreeId, {
              issueNumber: data.issueNumber,
              issueTitle: data.issueTitle,
            });
            return { prsByWorktree: next, issuesByWorktree: issuesNext };
          }

          return { prsByWorktree: next };
        });
      });

      const unsubPRCleared = githubClient.onPRCleared((data: PRClearedPayload) => {
        set((prev) => {
          const next = new Map(prev.prsByWorktree);
          const clearedPR = prev.prsByWorktree.get(data.worktreeId);
          next.delete(data.worktreeId);

          // If the issue data came only from the PR event (not a separate issue event),
          // clear it when the PR is cleared to avoid stale issue counts
          if (clearedPR?.issueNumber && clearedPR?.issueTitle) {
            const issuesNext = new Map(prev.issuesByWorktree);
            const existingIssue = issuesNext.get(data.worktreeId);
            // Only clear if issue numbers match (issue came from this PR)
            if (existingIssue?.issueNumber === clearedPR.issueNumber) {
              issuesNext.delete(data.worktreeId);
              return { prsByWorktree: next, issuesByWorktree: issuesNext };
            }
          }

          return { prsByWorktree: next };
        });
      });

      const unsubIssueDetected = githubClient.onIssueDetected((data: IssueDetectedPayload) => {
        set((prev) => {
          const issuesNext = new Map(prev.issuesByWorktree);
          issuesNext.set(data.worktreeId, {
            issueNumber: data.issueNumber,
            issueTitle: data.issueTitle,
          });

          // Update PR entry if it exists, to keep issue data in sync
          const existingPR = prev.prsByWorktree.get(data.worktreeId);
          if (existingPR) {
            const prsNext = new Map(prev.prsByWorktree);
            prsNext.set(data.worktreeId, {
              ...existingPR,
              issueNumber: data.issueNumber,
              issueTitle: data.issueTitle,
            });
            return { prsByWorktree: prsNext, issuesByWorktree: issuesNext };
          }

          return { issuesByWorktree: issuesNext };
        });
      });

      cleanupListeners = () => {
        unsubPRDetected();
        unsubPRCleared();
        unsubIssueDetected();
      };
    }

    set({ isInitialized: true });
  },

  reset: () => {
    if (cleanupListeners) {
      cleanupListeners();
      cleanupListeners = null;
    }
    set({
      prsByWorktree: new Map(),
      issuesByWorktree: new Map(),
      isInitialized: false,
    });
  },

  getOpenPRCount: () => {
    const { prsByWorktree } = get();
    let count = 0;
    for (const pr of prsByWorktree.values()) {
      if (pr.prState === "open") {
        count++;
      }
    }
    return count;
  },

  getOpenIssueCount: () => {
    return get().issuesByWorktree.size;
  },

  getPRForWorktree: (worktreeId: string) => {
    return get().prsByWorktree.get(worktreeId);
  },

  getIssueForWorktree: (worktreeId: string) => {
    return get().issuesByWorktree.get(worktreeId);
  },
}));

export function cleanupGitHubDataStore() {
  useGitHubDataStore.getState().reset();
}

export function initializeGitHubDataStore() {
  useGitHubDataStore.getState().initialize();
}
