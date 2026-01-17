import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import type { WorkspaceService } from "../WorkspaceService.js";

vi.mock("simple-git");
vi.mock("../../utils/fs.js");
vi.mock("../../utils/git.js");
vi.mock("../../utils/gitUtils.js");
vi.mock("../../services/worktree/mood.js");
vi.mock("../../services/issueExtractor.js");
vi.mock("../../services/worktree/index.js");
vi.mock("../../services/github/GitHubAuth.js");
vi.mock("../../services/PullRequestService.js");
vi.mock("../../services/events.js");
vi.mock("fs/promises");

describe("WorkspaceService.createWorktree", () => {
  let service: WorkspaceService;
  let simpleGit: any;
  let waitForPathExists: any;
  let ensureNoteFileSpy: any;

  beforeEach(async () => {
    // Reset mocks
    vi.resetModules();
    vi.clearAllMocks();

    // Mock simple-git
    const gitModule = await import("simple-git");
    simpleGit = vi.mocked(gitModule.simpleGit);
    const mockGit = {
      raw: vi.fn().mockResolvedValue(undefined),
      branch: vi.fn().mockResolvedValue({ current: "main" }),
    };
    simpleGit.mockReturnValue(mockGit);

    // Mock waitForPathExists
    const fsModule = await import("../../utils/fs.js");
    waitForPathExists = vi.mocked(fsModule.waitForPathExists);
    waitForPathExists.mockResolvedValue(undefined);

    // Mock other dependencies
    const gitUtilsModule = await import("../../utils/gitUtils.js");
    vi.mocked(gitUtilsModule.getGitDir).mockReturnValue("/test/worktree/.git");
    vi.mocked(gitUtilsModule.clearGitDirCache).mockReturnValue(undefined);

    const gitModule2 = await import("../../utils/git.js");
    vi.mocked(gitModule2.invalidateGitStatusCache).mockReturnValue(undefined);
    vi.mocked(gitModule2.getWorktreeChangesWithStats).mockResolvedValue({
      branch: "test-branch",
      head: "abc123",
      isDirty: false,
      stagedFileCount: 0,
      unstagedFileCount: 0,
      untrackedFileCount: 0,
      conflictedFileCount: 0,
      changedFileCount: 0,
    });

    const moodModule = await import("../../services/worktree/mood.js");
    vi.mocked(moodModule.categorizeWorktree).mockReturnValue({
      category: "ready",
      reason: "Clean working tree",
    });

    const issueExtractorModule = await import("../../services/issueExtractor.js");
    vi.mocked(issueExtractorModule.extractIssueNumberSync).mockReturnValue(null);
    vi.mocked(issueExtractorModule.extractIssueNumber).mockResolvedValue(null);

    const worktreeIndexModule = await import("../../services/worktree/index.js");
    const MockAdaptivePollingStrategy = vi.fn().mockImplementation(() => ({
      getCurrentInterval: vi.fn().mockReturnValue(2000),
      updateInterval: vi.fn(),
      reportActivity: vi.fn(),
    }));
    const MockNoteFileReader = vi.fn().mockImplementation(() => ({
      read: vi.fn().mockResolvedValue({}),
    }));
    vi.mocked(worktreeIndexModule.AdaptivePollingStrategy).mockImplementation(
      MockAdaptivePollingStrategy as any
    );
    vi.mocked(worktreeIndexModule.NoteFileReader).mockImplementation(MockNoteFileReader as any);

    const githubAuthModule = await import("../../services/github/GitHubAuth.js");
    vi.mocked(githubAuthModule.GitHubAuth).mockImplementation(
      vi.fn().mockImplementation(() => ({
        getToken: vi.fn().mockResolvedValue(null),
      })) as any
    );

    const prServiceModule = await import("../../services/PullRequestService.js");
    vi.mocked(prServiceModule.pullRequestService).mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ state: "idle" }),
    } as any);

    const eventsModule = await import("../../services/events.js");
    vi.mocked(eventsModule.events).mockReturnValue(new EventEmitter() as any);

    // Mock fs/promises for ensureNoteFile
    const fsPromisesModule = await import("fs/promises");
    vi.mocked(fsPromisesModule.stat).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(fsPromisesModule.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsPromisesModule.writeFile).mockResolvedValue(undefined);

    // Import and create service
    const WorkspaceServiceModule = await import("../WorkspaceService.js");
    service = new WorkspaceServiceModule.WorkspaceService(
      "/test/root",
      "main",
      "/test/root",
      "test-project"
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should call waitForPathExists after git worktree add", async () => {
    const mockGit = simpleGit();
    const requestId = "test-request-123";
    const options = {
      baseBranch: "main",
      newBranch: "feature/test",
      path: "/test/worktree",
    };

    // Capture the event
    const events: any[] = [];
    service["sendEvent"] = vi.fn((event) => {
      events.push(event);
    });

    // Mock listWorktreesFromGit to return the created worktree
    service["listWorktreesFromGit"] = vi.fn().mockResolvedValue([
      {
        path: "/test/worktree",
        branch: "feature/test",
        head: "abc123",
        isDetached: false,
        isMainWorktree: false,
      },
    ]);

    await service.createWorktree(requestId, "/test/root", options);

    // Verify git.raw was called with correct arguments
    expect(mockGit.raw).toHaveBeenCalledWith([
      "worktree",
      "add",
      "-b",
      "feature/test",
      "/test/worktree",
      "main",
    ]);

    // Verify waitForPathExists was called after git.raw
    expect(waitForPathExists).toHaveBeenCalledWith("/test/worktree", {
      timeoutMs: 5000,
      initialRetryDelayMs: 50,
      maxRetryDelayMs: 800,
    });

    // Verify call order: git.raw must be called before waitForPathExists
    const gitCallOrder = mockGit.raw.mock.invocationCallOrder[0];
    const waitCallOrder = waitForPathExists.mock.invocationCallOrder[0];
    expect(gitCallOrder).toBeLessThan(waitCallOrder);

    // Verify success event was sent
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "create-worktree-result",
      requestId: "test-request-123",
      success: true,
      worktreeId: "/test/worktree",
    });
  });

  it("should call waitForPathExists for useExistingBranch flow", async () => {
    const mockGit = simpleGit();
    const requestId = "test-request-456";
    const options = {
      baseBranch: "main",
      newBranch: "existing-branch",
      path: "/test/worktree2",
      useExistingBranch: true,
    };

    service["sendEvent"] = vi.fn();
    service["listWorktreesFromGit"] = vi.fn().mockResolvedValue([
      {
        path: "/test/worktree2",
        branch: "existing-branch",
        head: "def456",
        isDetached: false,
        isMainWorktree: false,
      },
    ]);

    await service.createWorktree(requestId, "/test/root", options);

    expect(mockGit.raw).toHaveBeenCalledWith([
      "worktree",
      "add",
      "/test/worktree2",
      "existing-branch",
    ]);
    expect(waitForPathExists).toHaveBeenCalledWith("/test/worktree2", expect.any(Object));
  });

  it("should call waitForPathExists for fromRemote flow", async () => {
    const mockGit = simpleGit();
    const requestId = "test-request-789";
    const options = {
      baseBranch: "origin/main",
      newBranch: "feature/remote",
      path: "/test/worktree3",
      fromRemote: true,
    };

    service["sendEvent"] = vi.fn();
    service["listWorktreesFromGit"] = vi.fn().mockResolvedValue([
      {
        path: "/test/worktree3",
        branch: "feature/remote",
        head: "ghi789",
        isDetached: false,
        isMainWorktree: false,
      },
    ]);

    await service.createWorktree(requestId, "/test/root", options);

    expect(mockGit.raw).toHaveBeenCalledWith([
      "worktree",
      "add",
      "-b",
      "feature/remote",
      "--track",
      "/test/worktree3",
      "origin/main",
    ]);
    expect(waitForPathExists).toHaveBeenCalledWith("/test/worktree3", expect.any(Object));
  });

  it("should propagate waitForPathExists timeout error", async () => {
    const requestId = "test-request-timeout";
    const options = {
      baseBranch: "main",
      newBranch: "feature/timeout",
      path: "/test/worktree-timeout",
    };

    // Make waitForPathExists fail with timeout
    waitForPathExists.mockRejectedValueOnce(
      new Error("Timeout waiting for path to exist: /test/worktree-timeout (waited 5000ms)")
    );

    const events: any[] = [];
    service["sendEvent"] = vi.fn((event) => {
      events.push(event);
    });

    await service.createWorktree(requestId, "/test/root", options);

    // Verify error event was sent
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "create-worktree-result",
      requestId: "test-request-timeout",
      success: false,
      error: expect.stringContaining("Timeout waiting for path to exist"),
    });
  });

  it("should handle delayed directory creation", async () => {
    const mockGit = simpleGit();
    const requestId = "test-request-delayed";
    const options = {
      baseBranch: "main",
      newBranch: "feature/delayed",
      path: "/test/worktree-delayed",
    };

    // Use fake timers for deterministic testing
    vi.useFakeTimers();

    // Simulate delayed path existence with a deferred promise
    let resolveWait: (() => void) | undefined;
    const waitPromise = new Promise<void>((resolve) => {
      resolveWait = resolve;
    });
    waitForPathExists.mockReturnValue(waitPromise);

    service["sendEvent"] = vi.fn();
    service["listWorktreesFromGit"] = vi.fn().mockResolvedValue([
      {
        path: "/test/worktree-delayed",
        branch: "feature/delayed",
        head: "jkl012",
        isDetached: false,
        isMainWorktree: false,
      },
    ]);

    const createPromise = service.createWorktree(requestId, "/test/root", options);

    // Verify git.raw was called
    await vi.runAllTimersAsync();
    expect(mockGit.raw).toHaveBeenCalled();

    // Verify waitForPathExists was called
    expect(waitForPathExists).toHaveBeenCalledTimes(1);

    // Resolve the wait after a simulated delay
    resolveWait!();
    await createPromise;

    vi.useRealTimers();
  });

  it("should not proceed to ensureNoteFile if waitForPathExists fails", async () => {
    const requestId = "test-request-fail";
    const options = {
      baseBranch: "main",
      newBranch: "feature/fail",
      path: "/test/worktree-fail",
    };

    // Make waitForPathExists fail
    waitForPathExists.mockRejectedValueOnce(new Error("Path does not exist"));

    const events: any[] = [];
    service["sendEvent"] = vi.fn((event) => {
      events.push(event);
    });

    // Mock fs.stat to track if ensureNoteFile is called
    const fsPromisesModule = await import("fs/promises");
    const statSpy = vi.mocked(fsPromisesModule.stat);
    const mkdirSpy = vi.mocked(fsPromisesModule.mkdir);
    const writeFileSpy = vi.mocked(fsPromisesModule.writeFile);
    statSpy.mockClear();
    mkdirSpy.mockClear();
    writeFileSpy.mockClear();

    // Also mock listWorktreesFromGit to track if it's called
    const listWorktreesSpy = vi.spyOn(service as any, "listWorktreesFromGit");
    listWorktreesSpy.mockClear();

    await service.createWorktree(requestId, "/test/root", options);

    // Verify error event was sent
    expect(events[0].success).toBe(false);

    // ensureNoteFile should not be reached - verify its fs operations not called
    expect(statSpy).not.toHaveBeenCalled();
    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(writeFileSpy).not.toHaveBeenCalled();

    // listWorktreesFromGit should also not be called
    expect(listWorktreesSpy).not.toHaveBeenCalled();
  });
});
