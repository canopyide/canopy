import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PRDetectedPayload, PRClearedPayload, IssueDetectedPayload } from "../../types";

let mockOnPRDetectedCallback: ((data: PRDetectedPayload) => void) | null = null;
let mockOnPRClearedCallback: ((data: PRClearedPayload) => void) | null = null;
let mockOnIssueDetectedCallback: ((data: IssueDetectedPayload) => void) | null = null;

vi.mock("@/clients", () => ({
  githubClient: {
    onPRDetected: vi.fn((callback) => {
      mockOnPRDetectedCallback = callback;
      return () => {
        mockOnPRDetectedCallback = null;
      };
    }),
    onPRCleared: vi.fn((callback) => {
      mockOnPRClearedCallback = callback;
      return () => {
        mockOnPRClearedCallback = null;
      };
    }),
    onIssueDetected: vi.fn((callback) => {
      mockOnIssueDetectedCallback = callback;
      return () => {
        mockOnIssueDetectedCallback = null;
      };
    }),
  },
}));

const { useGitHubDataStore, cleanupGitHubDataStore } = await import("../githubDataStore");

describe("githubDataStore", () => {
  beforeEach(() => {
    cleanupGitHubDataStore();
    mockOnPRDetectedCallback = null;
    mockOnPRClearedCallback = null;
    mockOnIssueDetectedCallback = null;
  });

  describe("initialization", () => {
    it("subscribes to PR events on initialize", () => {
      const store = useGitHubDataStore;
      store.getState().initialize();

      expect(mockOnPRDetectedCallback).toBeTypeOf("function");
      expect(mockOnPRClearedCallback).toBeTypeOf("function");
      expect(mockOnIssueDetectedCallback).toBeTypeOf("function");
      expect(store.getState().isInitialized).toBe(true);
    });

    it("does not re-initialize if already initialized", () => {
      const store = useGitHubDataStore;
      store.getState().initialize();

      const firstPRCallback = mockOnPRDetectedCallback;
      store.getState().initialize();

      expect(mockOnPRDetectedCallback).toBe(firstPRCallback);
    });

    it("unsubscribes from events on reset", () => {
      const store = useGitHubDataStore;
      store.getState().initialize();

      expect(mockOnPRDetectedCallback).toBeTruthy();
      cleanupGitHubDataStore();

      expect(mockOnPRDetectedCallback).toBeNull();
      expect(mockOnPRClearedCallback).toBeNull();
      expect(mockOnIssueDetectedCallback).toBeNull();
      expect(store.getState().isInitialized).toBe(false);
    });
  });

  describe("PR events", () => {
    it("stores PR data when PR detected event fires", () => {
      const store = useGitHubDataStore;
      store.getState().initialize();

      mockOnPRDetectedCallback!({
        worktreeId: "wt-1",
        prNumber: 123,
        prUrl: "https://github.com/test/repo/pull/123",
        prState: "open",
        prTitle: "Add new feature",
        issueNumber: 456,
        issueTitle: "Implement new feature",
        timestamp: Date.now(),
      });

      const pr = store.getState().getPRForWorktree("wt-1");
      expect(pr).toBeDefined();
      expect(pr?.prNumber).toBe(123);
      expect(pr?.prUrl).toBe("https://github.com/test/repo/pull/123");
      expect(pr?.prState).toBe("open");
      expect(pr?.prTitle).toBe("Add new feature");
      expect(pr?.issueNumber).toBe(456);
      expect(pr?.issueTitle).toBe("Implement new feature");
    });

    it("removes PR data when PR cleared event fires", () => {
      const store = useGitHubDataStore;
      store.getState().initialize();

      mockOnPRDetectedCallback!({
        worktreeId: "wt-2",
        prNumber: 789,
        prUrl: "https://github.com/test/repo/pull/789",
        prState: "open",
        timestamp: Date.now(),
      });

      expect(store.getState().getPRForWorktree("wt-2")).toBeDefined();

      mockOnPRClearedCallback!({
        worktreeId: "wt-2",
        timestamp: Date.now(),
      });

      expect(store.getState().getPRForWorktree("wt-2")).toBeUndefined();
    });

    it("handles merged PR state", () => {
      const store = useGitHubDataStore;
      store.getState().initialize();

      mockOnPRDetectedCallback!({
        worktreeId: "wt-3",
        prNumber: 999,
        prUrl: "https://github.com/test/repo/pull/999",
        prState: "merged",
        prTitle: "Merged feature",
        timestamp: Date.now(),
      });

      const pr = store.getState().getPRForWorktree("wt-3");
      expect(pr?.prState).toBe("merged");
    });

    it("handles closed PR state", () => {
      const store = useGitHubDataStore;
      store.getState().initialize();

      mockOnPRDetectedCallback!({
        worktreeId: "wt-4",
        prNumber: 888,
        prUrl: "https://github.com/test/repo/pull/888",
        prState: "closed",
        prTitle: "Closed PR",
        timestamp: Date.now(),
      });

      const pr = store.getState().getPRForWorktree("wt-4");
      expect(pr?.prState).toBe("closed");
    });

    it("overwrites existing PR with new PR", () => {
      const store = useGitHubDataStore;
      store.getState().initialize();

      mockOnPRDetectedCallback!({
        worktreeId: "wt-5",
        prNumber: 100,
        prUrl: "https://github.com/test/repo/pull/100",
        prState: "open",
        prTitle: "First PR",
        timestamp: Date.now(),
      });

      expect(store.getState().getPRForWorktree("wt-5")?.prNumber).toBe(100);

      mockOnPRDetectedCallback!({
        worktreeId: "wt-5",
        prNumber: 200,
        prUrl: "https://github.com/test/repo/pull/200",
        prState: "open",
        prTitle: "Updated PR",
        timestamp: Date.now(),
      });

      const pr = store.getState().getPRForWorktree("wt-5");
      expect(pr?.prNumber).toBe(200);
      expect(pr?.prTitle).toBe("Updated PR");
    });
  });

  describe("issue events", () => {
    it("stores issue data when issue detected event fires", () => {
      const store = useGitHubDataStore;
      store.getState().initialize();

      mockOnIssueDetectedCallback!({
        worktreeId: "wt-6",
        issueNumber: 555,
        issueTitle: "Bug report",
      });

      const issue = store.getState().getIssueForWorktree("wt-6");
      expect(issue).toBeDefined();
      expect(issue?.issueNumber).toBe(555);
      expect(issue?.issueTitle).toBe("Bug report");
    });

    it("stores issue data from PR detected event", () => {
      const store = useGitHubDataStore;
      store.getState().initialize();

      mockOnPRDetectedCallback!({
        worktreeId: "wt-7",
        prNumber: 111,
        prUrl: "https://github.com/test/repo/pull/111",
        prState: "open",
        issueNumber: 222,
        issueTitle: "Feature request",
        timestamp: Date.now(),
      });

      const issue = store.getState().getIssueForWorktree("wt-7");
      expect(issue).toBeDefined();
      expect(issue?.issueNumber).toBe(222);
      expect(issue?.issueTitle).toBe("Feature request");
    });
  });

  describe("aggregate counts", () => {
    it("counts only open PRs", () => {
      const store = useGitHubDataStore;
      store.getState().initialize();

      mockOnPRDetectedCallback!({
        worktreeId: "wt-a",
        prNumber: 1,
        prUrl: "https://github.com/test/repo/pull/1",
        prState: "open",
        timestamp: Date.now(),
      });

      mockOnPRDetectedCallback!({
        worktreeId: "wt-b",
        prNumber: 2,
        prUrl: "https://github.com/test/repo/pull/2",
        prState: "open",
        timestamp: Date.now(),
      });

      mockOnPRDetectedCallback!({
        worktreeId: "wt-c",
        prNumber: 3,
        prUrl: "https://github.com/test/repo/pull/3",
        prState: "merged",
        timestamp: Date.now(),
      });

      mockOnPRDetectedCallback!({
        worktreeId: "wt-d",
        prNumber: 4,
        prUrl: "https://github.com/test/repo/pull/4",
        prState: "closed",
        timestamp: Date.now(),
      });

      expect(store.getState().getOpenPRCount()).toBe(2);
    });

    it("counts unique issues by worktree", () => {
      const store = useGitHubDataStore;
      store.getState().initialize();

      mockOnIssueDetectedCallback!({
        worktreeId: "wt-x",
        issueNumber: 10,
        issueTitle: "Issue 1",
      });

      mockOnIssueDetectedCallback!({
        worktreeId: "wt-y",
        issueNumber: 20,
        issueTitle: "Issue 2",
      });

      mockOnIssueDetectedCallback!({
        worktreeId: "wt-z",
        issueNumber: 30,
        issueTitle: "Issue 3",
      });

      expect(store.getState().getOpenIssueCount()).toBe(3);
    });

    it("updates count when PR is cleared", () => {
      const store = useGitHubDataStore;
      store.getState().initialize();

      mockOnPRDetectedCallback!({
        worktreeId: "wt-1",
        prNumber: 1,
        prUrl: "https://github.com/test/repo/pull/1",
        prState: "open",
        timestamp: Date.now(),
      });

      mockOnPRDetectedCallback!({
        worktreeId: "wt-2",
        prNumber: 2,
        prUrl: "https://github.com/test/repo/pull/2",
        prState: "open",
        timestamp: Date.now(),
      });

      expect(store.getState().getOpenPRCount()).toBe(2);

      mockOnPRClearedCallback!({
        worktreeId: "wt-1",
        timestamp: Date.now(),
      });

      expect(store.getState().getOpenPRCount()).toBe(1);
    });

    it("clears all data on reset", () => {
      const store = useGitHubDataStore;
      store.getState().initialize();

      mockOnPRDetectedCallback!({
        worktreeId: "wt-1",
        prNumber: 1,
        prUrl: "https://github.com/test/repo/pull/1",
        prState: "open",
        timestamp: Date.now(),
      });

      mockOnIssueDetectedCallback!({
        worktreeId: "wt-1",
        issueNumber: 10,
        issueTitle: "Issue",
      });

      expect(store.getState().getOpenPRCount()).toBe(1);
      expect(store.getState().getOpenIssueCount()).toBe(1);

      cleanupGitHubDataStore();

      expect(store.getState().getOpenPRCount()).toBe(0);
      expect(store.getState().getOpenIssueCount()).toBe(0);
      expect(store.getState().prsByWorktree.size).toBe(0);
      expect(store.getState().issuesByWorktree.size).toBe(0);
    });
  });
});
