import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { WorktreeSnapshot } from "../../../shared/types/workspace-host.js";
import type { DaintreeEventMap } from "../events.js";
import type { PRCheckCandidate } from "../github/types.js";

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
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, candidates: PRCheckCandidate[]) => ({
      results: new Map([
        [
          candidates[0].worktreeId,
          {
            issueNumber: candidates[0].issueNumber,
            branchName: candidates[0].branchName,
            pr: {
              number: 42,
              title: "Add new feature",
              url: "https://github.com/o/r/pull/42",
              state: "open",
              isDraft: false,
            },
          },
        ],
      ]),
    }));
    const clearPRCaches = vi.fn();

    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

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

    expect(batchCheckLinkedPRs).toHaveBeenCalledTimes(1);
    expect(batchCheckLinkedPRs.mock.calls[0][1]).toEqual([
      { worktreeId: "wt-1", issueNumber: undefined, branchName: "feature/no-issue" },
    ]);

    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      worktreeId: "wt-1",
      prNumber: 42,
      prUrl: "https://github.com/o/r/pull/42",
      prState: "open",
      prTitle: "Add new feature",
    });
    expect(detected[0].issueNumber).toBeUndefined();

    unsubscribe();
    pullRequestService.destroy();
  });

  it("does not track default branches like main/master", async () => {
    const batchCheckLinkedPRs = vi.fn(async () => ({ results: new Map() }));
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

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

    expect(batchCheckLinkedPRs).not.toHaveBeenCalled();

    pullRequestService.destroy();
  });

  it("clears PR state only when branch changes (not when issue number changes)", async () => {
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, candidates: PRCheckCandidate[]) => ({
      results: new Map(
        candidates.map((c) => [
          c.worktreeId,
          {
            issueNumber: c.issueNumber,
            branchName: c.branchName,
            pr: {
              number: 7,
              title: "Fix bug",
              url: "https://github.com/o/r/pull/7",
              state: "open",
              isDraft: false,
            },
          },
        ])
      ),
    }));
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

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

  it("auto-recovers from circuit breaker after backoff period", async () => {
    let callCount = 0;
    const batchCheckLinkedPRs = vi.fn(async () => {
      callCount++;
      if (callCount <= 3) {
        return { results: new Map(), error: "API rate limit exceeded" };
      }
      return { results: new Map() };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/test" })
    );

    await pullRequestService.start(0);
    expect(callCount).toBe(1);

    // Step through the first two backoff polls. Using
    // advanceTimersToNextTimerAsync avoids the overlap window where a second
    // timer could fire within a single advanceTimersByTimeAsync block.
    await vi.advanceTimersToNextTimerAsync();
    expect(callCount).toBe(2);

    await vi.advanceTimersToNextTimerAsync();
    expect(callCount).toBe(3);
    expect(pullRequestService.getStatus().isEnabled).toBe(false);
    expect(pullRequestService.getStatus().consecutiveErrors).toBe(3);

    // Advance past BACKOFF_CAP_MS (5 min) to guarantee the circuit-breaker
    // recovery window fires. The revalidation timer (90s from start) may
    // also fire during this window, so don't assert exact callCount — verify
    // the circuit breaker state recovered.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(pullRequestService.getStatus().isEnabled).toBe(true);
    expect(pullRequestService.getStatus().consecutiveErrors).toBe(0);

    pullRequestService.destroy();
  });

  it("emits sys:pr:detection-paused once on trip and again on recovery", async () => {
    let callCount = 0;
    const batchCheckLinkedPRs = vi.fn(async () => {
      callCount++;
      if (callCount <= 3) {
        return { results: new Map(), error: "API rate limit exceeded" };
      }
      return { results: new Map() };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    const paused: DaintreeEventMap["sys:pr:detection-paused"][] = [];
    const unsubscribe = events.on("sys:pr:detection-paused", (payload) => paused.push(payload));

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/test" })
    );

    await pullRequestService.start();
    await vi.advanceTimersToNextTimerAsync();
    await vi.advanceTimersToNextTimerAsync();

    // Trip: exactly one tripped:true on the 3rd consecutive error.
    expect(pullRequestService.getStatus().consecutiveErrors).toBe(3);
    expect(paused).toEqual([{ tripped: true }]);

    // Recovery: backoff window fires, resets the breaker, emits tripped:false.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(pullRequestService.getStatus().isEnabled).toBe(true);
    expect(paused).toEqual([{ tripped: true }, { tripped: false }]);

    unsubscribe();
    pullRequestService.destroy();
  });

  it("revalidates resolved PRs at 90-second intervals", async () => {
    let checkCallCount = 0;
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, candidates: PRCheckCandidate[]) => {
      checkCallCount++;
      return {
        results: new Map(
          candidates.map((c) => [
            c.worktreeId,
            {
              issueNumber: c.issueNumber,
              branchName: c.branchName,
              pr: {
                number: 10,
                title: "My PR",
                url: "https://github.com/o/r/pull/10",
                state: "open" as const,
                isDraft: false,
                // Explicit non-pending CI status keeps the adaptive boost off so
                // the assertion verifies the baseline 90s cadence.
                ciStatus: "SUCCESS" as const,
              },
            },
          ])
        ),
      };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/reval" })
    );

    await pullRequestService.start(0);
    // start() calls checkForPRs (resolves wt-1), then schedules revalidation
    expect(checkCallCount).toBe(1);

    // Advance 90 seconds — revalidation should fire
    await vi.advanceTimersByTimeAsync(90 * 1000);
    expect(checkCallCount).toBe(2);

    // Advance another 90 seconds — another revalidation
    await vi.advanceTimersByTimeAsync(90 * 1000);
    expect(checkCallCount).toBe(3);

    pullRequestService.destroy();
  });

  it("calls clearPRCaches on manual refresh", async () => {
    const batchCheckLinkedPRs = vi.fn(async () => ({ results: new Map() }));
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");

    pullRequestService.initialize("/repo");

    await pullRequestService.refresh();

    expect(clearPRCaches).toHaveBeenCalledTimes(1);

    pullRequestService.destroy();
  });

  it("reschedules polling when checkForPRs throws unexpectedly", async () => {
    let callCount = 0;
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, _candidates: PRCheckCandidate[]) => {
      callCount++;
      if (callCount === 2) {
        throw new Error("Unexpected kaboom");
      }
      return {
        results: new Map(),
      };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));
    vi.doMock("../../utils/logger.js", () => ({
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logDebug: vi.fn(),
    }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/throw-test" })
    );

    await pullRequestService.start(0);
    expect(callCount).toBe(1);

    // Advance to the normal poll timer (30s focused default) — checkForPRs throws
    await vi.advanceTimersToNextTimerAsync();
    expect(callCount).toBe(2);

    // Advance to the backoff timer — the poll loop should have rescheduled
    // despite the throw.
    await vi.advanceTimersToNextTimerAsync();
    expect(callCount).toBe(3);

    pullRequestService.destroy();
  });

  it("reschedules revalidation when revalidateResolvedPRs throws unexpectedly", async () => {
    let revalidationCallCount = 0;
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, candidates: PRCheckCandidate[]) => {
      // First call is from start() — resolve the PR so revalidation has something to do
      // Subsequent calls are revalidation
      if (revalidationCallCount === 0) {
        revalidationCallCount++;
        return {
          results: new Map(
            candidates.map((c) => [
              c.worktreeId,
              {
                issueNumber: c.issueNumber,
                branchName: c.branchName,
                pr: {
                  number: 10,
                  title: "My PR",
                  url: "https://github.com/o/r/pull/10",
                  state: "open" as const,
                  isDraft: false,
                  ciStatus: "SUCCESS" as const,
                },
              },
            ])
          ),
        };
      }
      revalidationCallCount++;
      if (revalidationCallCount === 2) {
        throw new Error("Revalidation kaboom");
      }
      return {
        results: new Map(
          candidates.map((c) => [
            c.worktreeId,
            {
              issueNumber: c.issueNumber,
              branchName: c.branchName,
              pr: {
                number: 10,
                title: "My PR",
                url: "https://github.com/o/r/pull/10",
                state: "open" as const,
                isDraft: false,
                ciStatus: "SUCCESS" as const,
              },
            },
          ])
        ),
      };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));
    const logWarnMock = vi.fn();
    vi.doMock("../../utils/logger.js", () => ({
      logInfo: vi.fn(),
      logWarn: logWarnMock,
      logDebug: vi.fn(),
    }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/reval-throw" })
    );

    await pullRequestService.start(0);
    expect(revalidationCallCount).toBe(1);

    // Advance 90s — first revalidation fires and throws
    await vi.advanceTimersByTimeAsync(90 * 1000);
    expect(revalidationCallCount).toBe(2);
    expect(logWarnMock).toHaveBeenCalledWith("Revalidation check error", {
      error: "Revalidation kaboom",
    });

    // Advance another 90s — revalidation should have rescheduled despite the throw
    await vi.advanceTimersByTimeAsync(90 * 1000);
    expect(revalidationCallCount).toBe(3);

    pullRequestService.destroy();
  });

  it("logs warning but does not double-schedule when debounced check throws", async () => {
    let callCount = 0;
    const batchCheckLinkedPRs = vi.fn(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error("Debounce kaboom");
      }
      return { results: new Map() };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));
    const logWarnMock = vi.fn();
    vi.doMock("../../utils/logger.js", () => ({
      logInfo: vi.fn(),
      logWarn: logWarnMock,
      logDebug: vi.fn(),
    }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");

    // Register the worktree and start polling
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/debounce-throw" })
    );
    await pullRequestService.start(0);
    expect(callCount).toBe(1);

    // Trigger a branch change to cause a debounced check
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/debounce-throw-2" })
    );

    // The debounce (100ms) lands inside the 5s floor opened by start(0)'s
    // initial check, so it re-arms and the throwing checkForPRs only fires
    // once the floor clears (~5s).
    await vi.advanceTimersByTimeAsync(5000);
    expect(callCount).toBe(2);
    expect(logWarnMock).toHaveBeenCalledWith("PR check failed", {
      error: "Debounce kaboom",
      consecutiveErrors: 1,
    });

    pullRequestService.destroy();
  });

  it("does not track root worktree even on non-default branch", async () => {
    const batchCheckLinkedPRs = vi.fn(async () => ({ results: new Map() }));
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-root", branch: "develop", isMainWorktree: true })
    );

    await pullRequestService.refresh();

    expect(batchCheckLinkedPRs).not.toHaveBeenCalled();

    pullRequestService.destroy();
  });

  it("evicts root worktree from candidates when isMainWorktree becomes true", async () => {
    const batchCheckLinkedPRs = vi.fn(async () => ({ results: new Map() }));
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");

    // First update without isMainWorktree — gets tracked as candidate
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-root", branch: "develop" })
    );
    await pullRequestService.refresh();
    expect(batchCheckLinkedPRs).toHaveBeenCalledTimes(1);
    expect(pullRequestService.getStatus().candidateCount).toBe(1);

    // Second update with isMainWorktree: true — evicted from candidates
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-root", branch: "develop", isMainWorktree: true })
    );

    expect(pullRequestService.getStatus().candidateCount).toBe(0);

    // Subsequent refresh should not check any candidates
    batchCheckLinkedPRs.mockClear();
    await pullRequestService.refresh();
    expect(batchCheckLinkedPRs).not.toHaveBeenCalled();

    pullRequestService.destroy();
  });

  it("tracks non-main worktree on develop branch normally", async () => {
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, candidates: PRCheckCandidate[]) => ({
      results: new Map(
        candidates.map((c) => [
          c.worktreeId,
          {
            issueNumber: c.issueNumber,
            branchName: c.branchName,
            pr: {
              number: 55,
              title: "Develop PR",
              url: "https://github.com/o/r/pull/55",
              state: "open" as const,
              isDraft: false,
            },
          },
        ])
      ),
    }));
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    const detected: DaintreeEventMap["sys:pr:detected"][] = [];
    const unsubDetected = events.on("sys:pr:detected", (p) => detected.push(p));

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-linked", branch: "develop", isMainWorktree: false })
    );

    await pullRequestService.refresh();

    expect(batchCheckLinkedPRs).toHaveBeenCalledTimes(1);
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({ worktreeId: "wt-linked", prNumber: 55 });

    unsubDetected();
    pullRequestService.destroy();
  });

  it("setFocusCadence(false) lengthens the next poll to the blurred interval", async () => {
    let callCount = 0;
    const batchCheckLinkedPRs = vi.fn(async () => {
      callCount++;
      return { results: new Map() };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/cadence" })
    );

    await pullRequestService.start(0);
    expect(callCount).toBe(1);

    pullRequestService.setFocusCadence(false);

    // 30s elapsed should NOT trigger a poll under the 120s blurred cadence
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(callCount).toBe(1);

    // 120s total elapsed should trigger the next poll
    await vi.advanceTimersByTimeAsync(90 * 1000);
    expect(callCount).toBe(2);

    pullRequestService.destroy();
  });

  it("setFocusCadence(true) fires an immediate catch-up poll on focus regain", async () => {
    let callCount = 0;
    const batchCheckLinkedPRs = vi.fn(async () => {
      callCount++;
      return { results: new Map() };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/catchup" })
    );

    await pullRequestService.start(0);
    expect(callCount).toBe(1);

    // Blur, then focus — should immediately catch up
    pullRequestService.setFocusCadence(false);
    await vi.advanceTimersByTimeAsync(10 * 1000);
    expect(callCount).toBe(1);

    pullRequestService.setFocusCadence(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(callCount).toBe(2);

    pullRequestService.destroy();
  });

  it("throttles repeated focus catch-ups within 5s", async () => {
    let callCount = 0;
    const batchCheckLinkedPRs = vi.fn(async () => {
      callCount++;
      return { results: new Map() };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/throttle" })
    );

    await pullRequestService.start(0);
    expect(callCount).toBe(1);

    // start(0)'s initial check opened the 5s floor, so let it clear before
    // exercising the focus catch-up throttle.
    await vi.advanceTimersByTimeAsync(6 * 1000);

    // First focus after the floor cleared → catch-up fires
    pullRequestService.setFocusCadence(false);
    pullRequestService.setFocusCadence(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(callCount).toBe(2);

    // Second blur→focus within 5s of that catch-up → no extra poll
    await vi.advanceTimersByTimeAsync(2 * 1000);
    pullRequestService.setFocusCadence(false);
    pullRequestService.setFocusCadence(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(callCount).toBe(2);

    // After 5s+ has elapsed since the last catch-up, focus regain fires again
    await vi.advanceTimersByTimeAsync(4 * 1000);
    pullRequestService.setFocusCadence(false);
    pullRequestService.setFocusCadence(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(callCount).toBe(3);

    pullRequestService.destroy();
  });

  it("setFocusCadence is a no-op while not polling but still updates the stored interval", async () => {
    const batchCheckLinkedPRs = vi.fn(async () => ({ results: new Map() }));
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/idle" })
    );

    pullRequestService.setFocusCadence(false);
    expect(batchCheckLinkedPRs).not.toHaveBeenCalled();

    await pullRequestService.start(0);
    // start() preserves the blurred cadence set while idle
    expect(batchCheckLinkedPRs).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(batchCheckLinkedPRs).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(90 * 1000);
    expect(batchCheckLinkedPRs).toHaveBeenCalledTimes(2);

    pullRequestService.destroy();
  });

  it("does not leak a duplicate timer when blur arrives mid-catchup", async () => {
    // Regression: blur during in-flight focus catch-up used to orphan the
    // background-cadence timer set by updatePollInterval(120s) when the
    // catch-up's .finally re-entered scheduleNextPoll without first clearing
    // the existing pollTimer.
    let resolveCheck: (() => void) | null = null;
    let callCount = 0;
    const batchCheckLinkedPRs = vi.fn(async () => {
      callCount++;
      // Hold the catch-up promise open so blur can interleave.
      if (callCount === 2) {
        await new Promise<void>((resolve) => {
          resolveCheck = resolve;
        });
      }
      return { results: new Map() };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/leak" })
    );

    await pullRequestService.start(0);
    expect(callCount).toBe(1);

    // Clear the 5s floor opened by start(0)'s initial check so the focus
    // catch-up below isn't throttled.
    await vi.advanceTimersByTimeAsync(6 * 1000);

    // Focus regain — fires catch-up that hangs awaiting `resolveCheck`.
    pullRequestService.setFocusCadence(true);
    await Promise.resolve();
    expect(callCount).toBe(2);

    // Blur arrives mid-catchup — sets the 120s timer.
    pullRequestService.setFocusCadence(false);

    // Resolve the in-flight catch-up; .finally calls scheduleNextPoll again.
    resolveCheck!();
    await vi.advanceTimersByTimeAsync(0);

    // Advance one full blurred cycle. With the leak, two timers would fire
    // → callCount becomes 4. Fixed: exactly one timer fires → callCount = 3.
    await vi.advanceTimersByTimeAsync(120 * 1000);
    expect(callCount).toBe(3);

    pullRequestService.destroy();
  });

  it("polls at the 30s focused cadence by default after start(0)", async () => {
    let callCount = 0;
    const batchCheckLinkedPRs = vi.fn(async () => {
      callCount++;
      return { results: new Map() };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/default" })
    );

    await pullRequestService.start(0);
    expect(callCount).toBe(1);

    // Under the old 60s clamp this would have required 60s
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(callCount).toBe(2);

    pullRequestService.destroy();
  });

  it("circuit breaker recovers within BACKOFF_CAP_MS (5 min)", async () => {
    let callCount = 0;
    const batchCheckLinkedPRs = vi.fn(async () => {
      callCount++;
      if (callCount <= 3) {
        return { results: new Map(), error: "Server error" };
      }
      return { results: new Map() };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/backoff" })
    );

    await pullRequestService.start(0);
    expect(pullRequestService.getStatus().consecutiveErrors).toBe(1);

    // Step two backoff polls to trip the circuit breaker.
    await vi.advanceTimersToNextTimerAsync();
    expect(pullRequestService.getStatus().consecutiveErrors).toBe(2);

    await vi.advanceTimersToNextTimerAsync();
    expect(pullRequestService.getStatus().consecutiveErrors).toBe(3);
    expect(pullRequestService.getStatus().isEnabled).toBe(false);

    // Advance past BACKOFF_CAP_MS (5 min). The 4th call succeeds, which
    // resets consecutiveErrors and re-enables the service. The cap is
    // verified by the fact recovery happens within this window: without it,
    // computeBackoff would grow unbounded for high consecutiveErrors.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(pullRequestService.getStatus().isEnabled).toBe(true);

    pullRequestService.destroy();
  });

  it("re-emits sys:pr:detected when only prCiStatus changes during revalidation", async () => {
    let pollCount = 0;
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, candidates: PRCheckCandidate[]) => {
      pollCount++;
      const ciStatus = pollCount === 1 ? "PENDING" : "SUCCESS";
      return {
        results: new Map([
          [
            candidates[0].worktreeId,
            {
              issueNumber: candidates[0].issueNumber,
              branchName: candidates[0].branchName,
              pr: {
                number: 11,
                title: "CI changes",
                url: "https://github.com/o/r/pull/11",
                state: "open" as const,
                isDraft: false,
                ciStatus: ciStatus as "PENDING" | "SUCCESS",
              },
            },
          ],
        ]),
      };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    const detected: DaintreeEventMap["sys:pr:detected"][] = [];
    const unsubscribe = events.on("sys:pr:detected", (payload) => detected.push(payload));

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-rev", branch: "feature/rev" })
    );

    // start(0) schedules the revalidation timer (refresh() alone doesn't) and
    // bypasses the startup jitter so the first check runs synchronously.
    // The first poll returns PENDING, so the adaptive boost activates and the
    // next revalidation fires at the 30s boosted cadence, not the 90s baseline.
    await pullRequestService.start(0);
    expect(detected.at(-1)?.prCiStatus).toBe("PENDING");

    // After CI flips to SUCCESS, the change-detection should re-emit.
    await vi.advanceTimersByTimeAsync(90 * 1000);

    expect(detected.length).toBeGreaterThanOrEqual(2);
    expect(detected.at(-1)?.prCiStatus).toBe("SUCCESS");

    unsubscribe();
    pullRequestService.destroy();
  });

  it("forwards prCiStatus from batchCheckLinkedPRs to the sys:pr:detected event", async () => {
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, candidates: PRCheckCandidate[]) => ({
      results: new Map([
        [
          candidates[0].worktreeId,
          {
            issueNumber: candidates[0].issueNumber,
            branchName: candidates[0].branchName,
            pr: {
              number: 99,
              title: "CI status threading",
              url: "https://github.com/o/r/pull/99",
              state: "open" as const,
              isDraft: false,
              ciStatus: "FAILURE" as const,
            },
          },
        ],
      ]),
    }));
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    const detected: DaintreeEventMap["sys:pr:detected"][] = [];
    const unsubscribe = events.on("sys:pr:detected", (payload) => detected.push(payload));

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-ci", branch: "feature/ci-failing" })
    );
    await pullRequestService.refresh();

    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      worktreeId: "wt-ci",
      prNumber: 99,
      prCiStatus: "FAILURE",
    });

    unsubscribe();
    pullRequestService.destroy();
  });

  it("boosts revalidation cadence to 30s when CI is PENDING", async () => {
    let checkCallCount = 0;
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, candidates: PRCheckCandidate[]) => {
      checkCallCount++;
      return {
        results: new Map(
          candidates.map((c) => [
            c.worktreeId,
            {
              issueNumber: c.issueNumber,
              branchName: c.branchName,
              pr: {
                number: 10,
                title: "Pending PR",
                url: "https://github.com/o/r/pull/10",
                state: "open" as const,
                isDraft: false,
                ciStatus: "PENDING" as const,
              },
            },
          ])
        ),
      };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/boost" })
    );

    await pullRequestService.start(0);
    expect(checkCallCount).toBe(1);

    // 30s boosted revalidation fires because the first poll returned PENDING.
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(checkCallCount).toBe(2);

    // Still boosted — every revalidation keeps returning PENDING so the window
    // slides forward and the next tick is again 30s out.
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(checkCallCount).toBe(3);

    pullRequestService.destroy();
  });

  it("treats EXPECTED ciStatus as in-flight and boosts revalidation", async () => {
    let checkCallCount = 0;
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, candidates: PRCheckCandidate[]) => {
      checkCallCount++;
      return {
        results: new Map(
          candidates.map((c) => [
            c.worktreeId,
            {
              issueNumber: c.issueNumber,
              branchName: c.branchName,
              pr: {
                number: 12,
                title: "Expected PR",
                url: "https://github.com/o/r/pull/12",
                state: "open" as const,
                isDraft: false,
                ciStatus: "EXPECTED" as const,
              },
            },
          ])
        ),
      };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/expected" })
    );

    await pullRequestService.start(0);
    expect(checkCallCount).toBe(1);

    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(checkCallCount).toBe(2);

    pullRequestService.destroy();
  });

  it("decays boost back to 90s once CI resolves to a terminal state", async () => {
    let checkCallCount = 0;
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, candidates: PRCheckCandidate[]) => {
      checkCallCount++;
      // First two polls return PENDING (initial check + one boosted reval).
      // The third call onwards returns SUCCESS, which should clear the boost.
      const ciStatus = checkCallCount <= 2 ? "PENDING" : "SUCCESS";
      return {
        results: new Map(
          candidates.map((c) => [
            c.worktreeId,
            {
              issueNumber: c.issueNumber,
              branchName: c.branchName,
              pr: {
                number: 10,
                title: "Decaying PR",
                url: "https://github.com/o/r/pull/10",
                state: "open" as const,
                isDraft: false,
                ciStatus: ciStatus as "PENDING" | "SUCCESS",
              },
            },
          ])
        ),
      };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/decay" })
    );

    await pullRequestService.start(0);
    expect(checkCallCount).toBe(1); // initial check, PENDING → boost armed

    // 30s boosted reval fires, also returns PENDING (extends the boost).
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(checkCallCount).toBe(2);

    // 30s later, the third reval fires (still boosted), returns SUCCESS — boost clears.
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(checkCallCount).toBe(3);

    // Boost cleared → next revalidation should be at the 90s baseline.
    // 30s after the SUCCESS reval there must be no extra call.
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(checkCallCount).toBe(3);

    // 90s after the SUCCESS reval the baseline timer fires.
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(checkCallCount).toBe(4);

    pullRequestService.destroy();
  });

  it("does not boost revalidation when CI is already SUCCESS", async () => {
    let checkCallCount = 0;
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, candidates: PRCheckCandidate[]) => {
      checkCallCount++;
      return {
        results: new Map(
          candidates.map((c) => [
            c.worktreeId,
            {
              issueNumber: c.issueNumber,
              branchName: c.branchName,
              pr: {
                number: 10,
                title: "Green PR",
                url: "https://github.com/o/r/pull/10",
                state: "open" as const,
                isDraft: false,
                ciStatus: "SUCCESS" as const,
              },
            },
          ])
        ),
      };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/green" })
    );

    await pullRequestService.start(0);
    expect(checkCallCount).toBe(1);

    // 30s should NOT fire a revalidation — boost is not armed for SUCCESS.
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(checkCallCount).toBe(1);

    // 90s baseline cadence still fires.
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(checkCallCount).toBe(2);

    pullRequestService.destroy();
  });

  it("ceiling expires after 15 min when revalidations stop refreshing the boost", async () => {
    let checkCallCount = 0;
    let failNextRevalidations = false;
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, candidates: PRCheckCandidate[]) => {
      checkCallCount++;
      if (failNextRevalidations) {
        // result.error short-circuits revalidateResolvedPRs before the boost
        // recompute — the boost keeps its existing expiry and decays naturally.
        return { results: new Map(), error: "Simulated revalidation failure" };
      }
      return {
        results: new Map(
          candidates.map((c) => [
            c.worktreeId,
            {
              issueNumber: c.issueNumber,
              branchName: c.branchName,
              pr: {
                number: 10,
                title: "Hung PR",
                url: "https://github.com/o/r/pull/10",
                state: "open" as const,
                isDraft: false,
                ciStatus: "PENDING" as const,
              },
            },
          ])
        ),
      };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));
    vi.doMock("../../utils/logger.js", () => ({
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logDebug: vi.fn(),
    }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/ceiling" })
    );

    await pullRequestService.start(0);
    expect(checkCallCount).toBe(1); // PENDING → boost armed, expires in 15 min

    // From here on, every revalidation returns result.error. The boost
    // window cannot be refreshed, so once 15 min pass the boost decays.
    failNextRevalidations = true;

    // First boosted revalidation at 30s — fires, returns error, leaves boost
    // expiry untouched.
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(checkCallCount).toBe(2);

    // Advance to just before the 15 min ceiling (15 min after start, ~14:30
    // since the boosted reval). Many boosted ticks fire in this window — all
    // return errors and don't refresh the boost.
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000 - 60 * 1000);
    const callsBeforeCeiling = checkCallCount;
    expect(callsBeforeCeiling).toBeGreaterThan(2);

    // Cross the ceiling (15 min + a bit). After boostExpiresAt elapses, the
    // next scheduleRevalidation picks the 90s baseline. Confirm by advancing
    // 30s past the ceiling and checking that the call rate has slowed.
    await vi.advanceTimersByTimeAsync(60 * 1000); // past the ceiling
    const callsJustAfterCeiling = checkCallCount;

    // 30s later — under boost we would have added one more call. Under the
    // 90s baseline, fewer than one call fires in 30s.
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(checkCallCount - callsJustAfterCeiling).toBeLessThanOrEqual(1);

    // 90s after the ceiling-elapsed reschedule, a baseline tick must have
    // fired at most once (proves cadence dropped, not that polling stopped).
    await vi.advanceTimersByTimeAsync(120 * 1000);
    expect(checkCallCount).toBeGreaterThan(callsJustAfterCeiling);

    pullRequestService.destroy();
  });

  it("refresh() clears the boost window so the cadence is re-evaluated from scratch", async () => {
    let checkCallCount = 0;
    let returnPending = true;
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, candidates: PRCheckCandidate[]) => {
      checkCallCount++;
      const ciStatus = returnPending ? "PENDING" : "SUCCESS";
      return {
        results: new Map(
          candidates.map((c) => [
            c.worktreeId,
            {
              issueNumber: c.issueNumber,
              branchName: c.branchName,
              pr: {
                number: 10,
                title: "Refresh PR",
                url: "https://github.com/o/r/pull/10",
                state: "open" as const,
                isDraft: false,
                ciStatus: ciStatus as "PENDING" | "SUCCESS",
              },
            },
          ])
        ),
      };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/refresh-clears-boost" })
    );

    await pullRequestService.start(0);
    expect(checkCallCount).toBe(1); // PENDING → boost armed

    // Flip CI to SUCCESS and refresh — refresh should clear the boost, run a
    // fresh check (which returns SUCCESS), and schedule the next revalidation
    // at the 90s baseline.
    returnPending = false;
    await pullRequestService.refresh();
    expect(checkCallCount).toBe(2);

    // 30s after refresh — no boosted tick.
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(checkCallCount).toBe(2);

    // 90s after refresh — baseline cadence fires.
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(checkCallCount).toBe(3);

    pullRequestService.destroy();
  });

  it("clears boost state when a tracked worktree flips to isMainWorktree without branch change", async () => {
    let checkCallCount = 0;
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, candidates: PRCheckCandidate[]) => {
      checkCallCount++;
      return {
        results: new Map(
          candidates.map((c) => [
            c.worktreeId,
            {
              issueNumber: c.issueNumber,
              branchName: c.branchName,
              pr: {
                number: 10,
                title: "Soon-to-be-main PR",
                url: "https://github.com/o/r/pull/10",
                state: "open" as const,
                isDraft: false,
                ciStatus: "PENDING" as const,
              },
            },
          ])
        ),
      };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/de-track" })
    );

    await pullRequestService.start(0);
    expect(checkCallCount).toBe(1); // PENDING → boost armed

    // Same branch, but the worktree is now the main worktree — de-track without
    // a branch change. A stale detectedPRs entry would keep the boost armed
    // for 15 min; the fix clears PR state on any de-track of a previously
    // tracked candidate.
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({
        worktreeId: "wt-1",
        branch: "feature/de-track",
        isMainWorktree: true,
      })
    );

    expect(pullRequestService.getStatus().candidateCount).toBe(0);
    expect(pullRequestService.getStatus().resolvedCount).toBe(0);

    // 30s after de-track — no boosted tick (no candidates to poll either, but
    // crucially no zombie timer; the boost timer was armed at start() and the
    // de-track must not leave its detectedPRs entry behind to keep boosting).
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(checkCallCount).toBe(1);

    pullRequestService.destroy();
  });

  it("reset() clears the boost window", async () => {
    let checkCallCount = 0;
    let returnPending = true;
    const batchCheckLinkedPRs = vi.fn(async (_cwd: string, candidates: PRCheckCandidate[]) => {
      checkCallCount++;
      const ciStatus = returnPending ? "PENDING" : "SUCCESS";
      return {
        results: new Map(
          candidates.map((c) => [
            c.worktreeId,
            {
              issueNumber: c.issueNumber,
              branchName: c.branchName,
              pr: {
                number: 10,
                title: "Reset PR",
                url: "https://github.com/o/r/pull/10",
                state: "open" as const,
                isDraft: false,
                ciStatus: ciStatus as "PENDING" | "SUCCESS",
              },
            },
          ])
        ),
      };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/reset-clears-boost" })
    );

    await pullRequestService.start(0);
    expect(checkCallCount).toBe(1); // PENDING → boost armed

    // Reset wipes all state; restart with a non-pending result, the cadence
    // must fall back to the 90s baseline rather than the 30s boost.
    pullRequestService.reset();
    returnPending = false;

    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-2", branch: "feature/reset-clears-boost-2" })
    );
    await pullRequestService.start(0);
    expect(checkCallCount).toBe(2);

    // 30s after restart — no boost.
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(checkCallCount).toBe(2);

    // 90s after restart — baseline cadence.
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(checkCallCount).toBe(3);

    pullRequestService.destroy();
  });

  it("delays the first check by a randomised startup jitter (default start())", async () => {
    const batchCheckLinkedPRs = vi.fn(async () => ({ results: new Map() }));
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/jitter" })
    );

    const started = pullRequestService.start();
    // No synchronous burst — the post-restart fleet decorrelation guarantee.
    expect(batchCheckLinkedPRs).not.toHaveBeenCalled();

    // Below STARTUP_JITTER_MIN_MS (500ms) the check cannot have fired yet.
    await vi.advanceTimersByTimeAsync(499);
    expect(batchCheckLinkedPRs).not.toHaveBeenCalled();

    // Past STARTUP_JITTER_MAX_MS (2500ms) it must have fired exactly once.
    await vi.advanceTimersByTimeAsync(2500);
    await started;
    expect(batchCheckLinkedPRs).toHaveBeenCalledTimes(1);

    pullRequestService.destroy();
  });

  it("stop() during the startup jitter cancels the check and resolves start()", async () => {
    const batchCheckLinkedPRs = vi.fn(async () => ({ results: new Map() }));
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/jitter-stop" })
    );

    const started = pullRequestService.start();
    pullRequestService.stop();

    // start() must not hang when the pending jitter is cancelled.
    await started;
    await vi.advanceTimersByTimeAsync(5000);
    expect(batchCheckLinkedPRs).not.toHaveBeenCalled();

    pullRequestService.destroy();
  });

  it("reset() during the startup jitter cancels the check and resolves start()", async () => {
    const batchCheckLinkedPRs = vi.fn(async () => ({ results: new Map() }));
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/jitter-reset" })
    );

    const started = pullRequestService.start();
    pullRequestService.reset();

    await started;
    await vi.advanceTimersByTimeAsync(5000);
    expect(batchCheckLinkedPRs).not.toHaveBeenCalled();

    pullRequestService.destroy();
  });

  it("manual refresh() bypasses the 5s floor opened by the prior check", async () => {
    let callCount = 0;
    const batchCheckLinkedPRs = vi.fn(async () => {
      callCount++;
      return { results: new Map() };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/refresh-bypass" })
    );

    await pullRequestService.start(0);
    expect(callCount).toBe(1);

    // Immediately (well inside the 5s floor) a manual refresh still runs.
    await pullRequestService.refresh();
    expect(callCount).toBe(2);

    pullRequestService.destroy();
  });

  it("does not bypass the startup jitter via a debounced worktree update", async () => {
    const batchCheckLinkedPRs = vi.fn(async () => ({ results: new Map() }));
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/seed" })
    );

    const started = pullRequestService.start();

    // A worktree update arrives during the jitter window (e.g. the
    // WorkspaceService initial scan after a host restart) → 100ms debounce.
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-2", branch: "feature/burst" })
    );

    // Past the debounce (100ms) but still inside the jitter floor (<500ms):
    // the debounced check must defer to the pending jitter, not fire.
    await vi.advanceTimersByTimeAsync(400);
    expect(batchCheckLinkedPRs).not.toHaveBeenCalled();

    // Once the jitter clears, a single initial check covers both candidates.
    await vi.advanceTimersByTimeAsync(2500);
    await started;
    expect(batchCheckLinkedPRs).toHaveBeenCalledTimes(1);
    expect((batchCheckLinkedPRs.mock.calls[0] as unknown[])[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ worktreeId: "wt-1" }),
        expect.objectContaining({ worktreeId: "wt-2" }),
      ])
    );

    pullRequestService.destroy();
  });

  it("wires the normal poll timer after the jittered initial check", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0); // jitter → 500ms
    let callCount = 0;
    const batchCheckLinkedPRs = vi.fn(async () => {
      callCount++;
      return { results: new Map() };
    });
    const clearPRCaches = vi.fn();
    vi.doMock("../GitHubService.js", () => ({ batchCheckLinkedPRs, clearPRCaches }));

    const { pullRequestService } = await import("../PullRequestService.js");
    const { events } = await import("../events.js");

    pullRequestService.initialize("/repo");
    events.emit(
      "sys:worktree:update",
      makeWorktreeSnapshot({ worktreeId: "wt-1", branch: "feature/jitter-poll" })
    );

    const started = pullRequestService.start();
    await vi.advanceTimersByTimeAsync(500);
    await started;
    expect(callCount).toBe(1); // jittered initial check

    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(callCount).toBe(2); // normal 30s poll wired in the jittered path

    randomSpy.mockRestore();
    pullRequestService.destroy();
  });
});
