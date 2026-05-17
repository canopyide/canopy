import { describe, it, expect, vi, beforeEach } from "vitest";
import { PRIntegrationService, type PRIntegrationCallbacks } from "../PRIntegrationService.js";
import type { TypedEventBus } from "../../services/events.js";

vi.mock("../../services/github/GitHubAuth.js", () => ({
  GitHubAuth: {
    setMemoryToken: vi.fn(),
  },
}));

const { GitHubAuth } = await import("../../services/github/GitHubAuth.js");

function makeEventBus(): TypedEventBus {
  type Handler = (...args: unknown[]) => void;
  const listeners = new Map<string, Set<Handler>>();
  return {
    on(event: string, handler: Handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => {
        listeners.get(event)?.delete(handler);
      };
    },
    emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach((h) => h(...args));
    },
  } as unknown as TypedEventBus;
}

function makeCallbacks(): PRIntegrationCallbacks {
  return {
    onPRDetected: vi.fn(),
    onPRCleared: vi.fn(),
    onIssueDetected: vi.fn(),
    onIssueNotFound: vi.fn(),
  };
}

describe("PRIntegrationService", () => {
  let eventBus: TypedEventBus;
  let callbacks: PRIntegrationCallbacks;
  interface PullRequestServiceLike {
    initialize(rootPath: string): void;
    start(startupDelayMs?: number): Promise<void>;
    stop(): void;
    reset(): void;
    refresh(): Promise<void>;
    getStatus(): {
      isPolling: boolean;
      candidateCount: number;
      resolvedCount: number;
      isEnabled: boolean;
    };
  }

  let prServiceMock: PullRequestServiceLike;

  beforeEach(() => {
    eventBus = makeEventBus();
    callbacks = makeCallbacks();
    prServiceMock = {
      initialize: vi.fn(),
      start: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      stop: vi.fn(),
      reset: vi.fn(),
      refresh: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      getStatus: vi.fn(() => ({
        isPolling: false,
        candidateCount: 0,
        resolvedCount: 0,
        isEnabled: true,
      })),
    };
  });

  it("seeds non-main worktrees via sys:worktree:update events", async () => {
    const emitSpy = vi.spyOn(eventBus, "emit");
    const service = new PRIntegrationService(prServiceMock, eventBus, callbacks);

    await service.initialize("/repo", () => [
      { worktreeId: "wt-linked", branch: "feature/foo", issueNumber: 42, isMainWorktree: false },
    ]);

    const updateCalls = emitSpy.mock.calls.filter(([ev]) => ev === "sys:worktree:update");
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][1]).toMatchObject({
      worktreeId: "wt-linked",
      branch: "feature/foo",
      issueNumber: 42,
      isMainWorktree: false,
    });
  });

  it("passes isMainWorktree: true so PullRequestService can filter root worktree", async () => {
    const emitSpy = vi.spyOn(eventBus, "emit");
    const service = new PRIntegrationService(prServiceMock, eventBus, callbacks);

    await service.initialize("/repo", () => [
      { worktreeId: "wt-root", branch: "develop", issueNumber: undefined, isMainWorktree: true },
      { worktreeId: "wt-linked", branch: "feature/bar", issueNumber: 10, isMainWorktree: false },
    ]);

    const updateCalls = emitSpy.mock.calls.filter(([ev]) => ev === "sys:worktree:update");
    // Both candidates are emitted (the seed loop's branch filter still applies,
    // but develop passes that filter). PullRequestService's handleWorktreeUpdate
    // will reject the root worktree via the isMainWorktree guard.
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0][1]).toMatchObject({ worktreeId: "wt-root", isMainWorktree: true });
    expect(updateCalls[1][1]).toMatchObject({ worktreeId: "wt-linked", isMainWorktree: false });
  });

  describe("getStatus", () => {
    it("maps PullRequestService status to PRServiceStatus shape", () => {
      prServiceMock.getStatus = vi.fn(() => ({
        isPolling: true,
        candidateCount: 7,
        resolvedCount: 3,
        isEnabled: true,
      }));
      const service = new PRIntegrationService(prServiceMock, eventBus, callbacks);

      const status = service.getStatus();

      expect(status).toEqual({
        isRunning: true,
        candidateCount: 7,
        resolvedPRCount: 3,
        lastCheckTime: undefined,
        circuitBreakerTripped: false,
      });
    });

    it("reports circuitBreakerTripped when service is disabled", () => {
      prServiceMock.getStatus = vi.fn(() => ({
        isPolling: false,
        candidateCount: 0,
        resolvedCount: 0,
        isEnabled: false,
      }));
      const service = new PRIntegrationService(prServiceMock, eventBus, callbacks);

      const status = service.getStatus();

      expect(status.circuitBreakerTripped).toBe(true);
      expect(status.isRunning).toBe(false);
    });
  });

  describe("resetPRState", () => {
    it("calls reset, then initialize, then start when projectRootPath is provided", () => {
      const callOrder: string[] = [];
      prServiceMock.reset = vi.fn(() => callOrder.push("reset"));
      prServiceMock.initialize = vi.fn(() => callOrder.push("initialize"));
      prServiceMock.start = vi.fn<() => Promise<void>>().mockImplementation(async () => {
        callOrder.push("start");
      });
      const service = new PRIntegrationService(prServiceMock, eventBus, callbacks);

      service.resetPRState("/repo");

      expect(callOrder.slice(0, 2)).toEqual(["reset", "initialize"]);
      expect(prServiceMock.initialize).toHaveBeenCalledWith("/repo");
      expect(prServiceMock.start).toHaveBeenCalled();
    });

    it("only calls reset when projectRootPath is null", () => {
      const service = new PRIntegrationService(prServiceMock, eventBus, callbacks);

      service.resetPRState(null);

      expect(prServiceMock.reset).toHaveBeenCalled();
      expect(prServiceMock.initialize).not.toHaveBeenCalled();
      expect(prServiceMock.start).not.toHaveBeenCalled();
    });
  });

  describe("pause / resume", () => {
    it("pause() stops the underlying service", () => {
      const service = new PRIntegrationService(prServiceMock, eventBus, callbacks);
      service.pause();
      expect(prServiceMock.stop).toHaveBeenCalledTimes(1);
    });

    it("resume() starts the underlying service with no startup jitter", () => {
      const service = new PRIntegrationService(prServiceMock, eventBus, callbacks);
      service.resume();
      expect(prServiceMock.start).toHaveBeenCalledTimes(1);
      // Focus-restore is not a crash-recovery path — jitter is skipped.
      expect(prServiceMock.start).toHaveBeenCalledWith(0);
    });
  });

  describe("updateToken", () => {
    beforeEach(() => {
      vi.mocked(GitHubAuth.setMemoryToken).mockClear();
    });

    it("sets memory token and refreshes when token is truthy", () => {
      const service = new PRIntegrationService(prServiceMock, eventBus, callbacks);

      service.updateToken("ghp_abc123", "/repo");

      expect(GitHubAuth.setMemoryToken).toHaveBeenCalledWith("ghp_abc123");
      expect(prServiceMock.refresh).toHaveBeenCalledTimes(1);
      expect(prServiceMock.reset).not.toHaveBeenCalled();
    });

    it("resets and reinitializes when token is null and path is provided", () => {
      const callOrder: string[] = [];
      prServiceMock.reset = vi.fn(() => callOrder.push("reset"));
      prServiceMock.initialize = vi.fn(() => callOrder.push("initialize"));
      prServiceMock.start = vi.fn<() => Promise<void>>().mockImplementation(async () => {
        callOrder.push("start");
      });
      const service = new PRIntegrationService(prServiceMock, eventBus, callbacks);

      service.updateToken(null, "/repo");

      expect(GitHubAuth.setMemoryToken).toHaveBeenCalledWith(null);
      expect(prServiceMock.refresh).not.toHaveBeenCalled();
      expect(callOrder.slice(0, 2)).toEqual(["reset", "initialize"]);
      expect(prServiceMock.initialize).toHaveBeenCalledWith("/repo");
    });

    it("only clears the memory token and resets when token and path are null", () => {
      const service = new PRIntegrationService(prServiceMock, eventBus, callbacks);

      service.updateToken(null, null);

      expect(GitHubAuth.setMemoryToken).toHaveBeenCalledWith(null);
      expect(prServiceMock.reset).toHaveBeenCalledTimes(1);
      expect(prServiceMock.initialize).not.toHaveBeenCalled();
      expect(prServiceMock.start).not.toHaveBeenCalled();
    });
  });
});
