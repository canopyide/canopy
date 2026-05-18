import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { WorktreeSnapshot } from "../../../shared/types/workspace-host.js";
import type { DaintreeEventMap } from "../events.js";
import type { ForgeProviderImpl, RepoRef, PR as ForgePR } from "../../../shared/types/forge.js";

function makeWorktreeSnapshot(
  overrides: Partial<WorktreeSnapshot> & Pick<WorktreeSnapshot, "worktreeId">
): WorktreeSnapshot {
  return {
    id: overrides.worktreeId,
    path: "/repo",
    name: "Worktree",
    isCurrent: false,
    ...overrides,
  };
}

function makeMockRepoRef(): RepoRef {
  return { host: "github.com", owner: "testowner", repo: "testrepo", rawData: null };
}

function makeMockForgePR(overrides?: Partial<ForgePR>): ForgePR {
  return {
    number: 42,
    title: "Add new feature",
    body: "",
    state: "open",
    rawState: "OPEN",
    isDraft: false,
    merged: false,
    url: "https://github.com/o/r/pull/42",
    baseRef: "main",
    headRef: "feature/test",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    rawData: null,
    ...overrides,
  };
}

function mockForgeProviderResolved(findPRByBranch?: () => Promise<ForgePR | null>) {
  const mockImpl: ForgeProviderImpl = {
    getCredentials: vi.fn(),
    validateCredentials: vi.fn(),
    parseRemote: vi.fn(() => makeMockRepoRef()),
    listIssues: vi.fn(),
    listPRs: vi.fn(),
    getIssue: vi.fn().mockResolvedValue(null),
    getPR: vi.fn().mockResolvedValue(null),
    findPRByBranch: vi
      .fn<() => Promise<ForgePR | null>>()
      .mockImplementation(findPRByBranch ?? (async () => makeMockForgePR())),
    getCIStatus: vi.fn().mockResolvedValue(null),
    getRepoMetadata: vi.fn(),
    buildIssueUrl: vi.fn(),
    buildPRUrl: vi.fn(),
    buildIssuesUrl: vi.fn(),
    buildPRsUrl: vi.fn(),
    buildCommitsUrl: vi.fn(),
    assignIssue: vi.fn(),
    validateToken: vi.fn(),
    getRateLimit: vi.fn().mockResolvedValue({ limit: null, remaining: null, resetAt: null }),
  };

  vi.doMock("../forgeProviderResolver.js", () => ({
    resolveForgeProvider: vi.fn().mockReturnValue({
      entry: {
        pluginId: "builtin",
        contribution: { id: "github", name: "GitHub", matches: ["github.com"] },
      },
      resolvedVia: "hostname",
    }),
  }));
  vi.doMock("../forgeProviderRegistry.js", () => ({
    getForgeProviderImpl: vi.fn().mockReturnValue(mockImpl),
    registerForgeProviders: vi.fn(),
    unregisterForgeProviders: vi.fn(),
    clearForgeProviderRegistry: vi.fn(),
  }));
  vi.doMock("../projectStorePaths.js", () => ({
    generateProjectId: vi.fn().mockReturnValue("test-project-id"),
  }));
  vi.doMock("../../utils/hardenedGit.js", () => ({
    createHardenedGit: vi.fn().mockReturnValue({
      getConfig: vi.fn().mockResolvedValue("https://github.com/testowner/testrepo.git"),
    }),
  }));

  return mockImpl;
}

function mockForgeProviderUnresolved() {
  vi.doMock("../forgeProviderResolver.js", () => ({
    resolveForgeProvider: vi.fn().mockReturnValue({ entry: null, resolvedVia: null }),
  }));
  vi.doMock("../forgeProviderRegistry.js", () => ({
    getForgeProviderImpl: vi.fn().mockReturnValue(undefined),
  }));
  vi.doMock("../projectStorePaths.js", () => ({
    generateProjectId: vi.fn().mockReturnValue("test-project-id"),
  }));
  vi.doMock("../../utils/hardenedGit.js", () => ({
    createHardenedGit: vi.fn().mockReturnValue({
      getConfig: vi.fn().mockResolvedValue("https://github.com/testowner/testrepo.git"),
    }),
  }));
}

describe("PullRequestService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("detects PRs for non-default branches without issue numbers", async () => {
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ clearPRCaches }));

    const mockImpl = mockForgeProviderResolved();

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    const detected: DaintreeEventMap["sys:pr:detected"][] = [];
    const unsubscribe = events.on("sys:pr:detected", (payload) => detected.push(payload));

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/no-issue" })
    );

    await pullRequestService.refresh();

    expect(mockImpl.findPRByBranch).toHaveBeenCalledTimes(1);
    expect(mockImpl.findPRByBranch).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "testowner", repo: "testrepo" }),
      "feature/no-issue"
    );

    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      worktreeId: "wt-1",
      prNumber: 42,
      prUrl: "https://github.com/o/r/pull/42",
      prState: "open",
      prTitle: "Add new feature",
      providerId: "builtin.github",
    });
    expect(detected[0].issueNumber).toBeUndefined();

    unsubscribe();
    pullRequestService.destroy();
  });

  it("does not track default branches like main/master", async () => {
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ clearPRCaches }));
    const mockImpl = mockForgeProviderResolved();

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-main", branch: "main" })
    );
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-master", branch: "master" })
    );

    await pullRequestService.refresh();

    expect(mockImpl.findPRByBranch).not.toHaveBeenCalled();

    pullRequestService.destroy();
  });

  it("clears PR state only when branch changes (not when issue number changes)", async () => {
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ clearPRCaches }));
    mockForgeProviderResolved(async () =>
      makeMockForgePR({ number: 7, title: "Fix bug", url: "https://github.com/o/r/pull/7" })
    );

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    const cleared: DaintreeEventMap["sys:pr:cleared"][] = [];
    const unsubscribeCleared = events.on("sys:pr:cleared", (payload) => cleared.push(payload));

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/a", issueNumber: undefined })
    );
    await pullRequestService.refresh();

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/a", issueNumber: 123 })
    );

    expect(cleared).toHaveLength(0);

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/b", issueNumber: 123 })
    );

    expect(cleared).toHaveLength(1);
    expect(cleared[0]).toMatchObject({ worktreeId: "wt-1", timestamp: expect.any(Number) });

    unsubscribeCleared();
    pullRequestService.destroy();
  });

  it("no-ops when no forge provider is resolved (null linkage, no toast, no error)", async () => {
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ clearPRCaches }));
    mockForgeProviderUnresolved();

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    const detected: DaintreeEventMap["sys:pr:detected"][] = [];
    const unsubscribe = events.on("sys:pr:detected", (payload) => detected.push(payload));

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/test" })
    );

    await pullRequestService.refresh();

    // No PR detected — unresolved provider means null linkage
    expect(detected).toHaveLength(0);

    unsubscribe();
    pullRequestService.destroy();
  });

  it("skips polling when provider reports remaining: 0 with a future resetAt", async () => {
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ clearPRCaches }));

    const futureReset = Date.now() + 30_000;
    const mockImpl = mockForgeProviderResolved();
    mockImpl.getRateLimit = vi.fn().mockResolvedValue({
      limit: 5000,
      remaining: 0,
      resetAt: futureReset,
    });

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/test" })
    );

    await pullRequestService.refresh();

    expect(mockImpl.getRateLimit).toHaveBeenCalled();
    expect(mockImpl.findPRByBranch).not.toHaveBeenCalled();
    expect(mockImpl.getIssue).not.toHaveBeenCalled();

    const status = pullRequestService.getStatus();
    expect(status.isEnabled).toBe(false);

    pullRequestService.destroy();
  });

  it("skips polling when provider reports secondaryThrottled: true", async () => {
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ clearPRCaches }));

    const mockImpl = mockForgeProviderResolved();
    mockImpl.getRateLimit = vi.fn().mockResolvedValue({
      limit: 5000,
      remaining: 200,
      resetAt: null,
      secondaryThrottled: true,
    });

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/test" })
    );

    await pullRequestService.refresh();

    expect(mockImpl.getRateLimit).toHaveBeenCalled();
    expect(mockImpl.findPRByBranch).not.toHaveBeenCalled();
    expect(mockImpl.getIssue).not.toHaveBeenCalled();

    pullRequestService.destroy();
  });

  it("proceeds normally when getRateLimit is absent from the provider", async () => {
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ clearPRCaches }));

    const mockImpl = mockForgeProviderResolved();
    delete (mockImpl as unknown as Record<string, unknown>).getRateLimit;

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/test" })
    );

    await pullRequestService.refresh();

    expect(mockImpl.findPRByBranch).toHaveBeenCalledTimes(1);

    pullRequestService.destroy();
  });

  it("proceeds normally when remaining is null (provider doesn't report that dimension)", async () => {
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ clearPRCaches }));

    const mockImpl = mockForgeProviderResolved();
    mockImpl.getRateLimit = vi.fn().mockResolvedValue({
      limit: null,
      remaining: null,
      resetAt: null,
    });

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/test" })
    );

    await pullRequestService.refresh();

    expect(mockImpl.findPRByBranch).toHaveBeenCalledTimes(1);

    pullRequestService.destroy();
  });

  it("proceeds normally when getRateLimit rejects (fails open)", async () => {
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ clearPRCaches }));

    const mockImpl = mockForgeProviderResolved();
    mockImpl.getRateLimit = vi.fn().mockRejectedValue(new Error("timeout"));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/test" })
    );

    await pullRequestService.refresh();

    expect(mockImpl.findPRByBranch).toHaveBeenCalledTimes(1);

    pullRequestService.destroy();
  });

  it("skips revalidation when provider reports rate-limited", async () => {
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ clearPRCaches }));

    const mockImpl = mockForgeProviderResolved();
    // First call succeeds to get a resolved PR, then rate-limit kicks in
    // so revalidation blocks
    let callCount = 0;
    mockImpl.getRateLimit = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(
        callCount <= 1
          ? { limit: null, remaining: null, resetAt: null }
          : { limit: 5000, remaining: 0, resetAt: Date.now() + 60_000 }
      );
    });

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/test" })
    );

    await pullRequestService.refresh();

    // PR was detected (first getRateLimit was clear)
    expect(mockImpl.findPRByBranch).toHaveBeenCalledTimes(1);

    // Manually revalidate — now getRateLimit returns blocked
    await (pullRequestService as any).revalidateResolvedPRs();

    // Revalidation was blocked by rate-limit gate; provider PR ops were NOT called
    expect(mockImpl.getPR).not.toHaveBeenCalled();

    pullRequestService.destroy();
  });
});
