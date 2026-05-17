import { events } from "./events.js";
import {
  batchCheckLinkedPRs,
  clearPRCaches,
  type PRCheckCandidate,
  type LinkedPR,
} from "./GitHubService.js";
import { gitHubRateLimitService } from "./github/index.js";
import { logInfo, logWarn, logDebug } from "../utils/logger.js";
import type { WorktreeSnapshot as WorktreeState } from "../../shared/types/workspace-host.js";
import { formatErrorMessage } from "../../shared/utils/errorMessage.js";

// Focus-aware polling cadence: faster when any Daintree window is focused so
// users see PR transitions promptly, slower when fully blurred to conserve the
// GitHub API quota during background sessions.
const FOCUSED_POLL_INTERVAL_MS = 30 * 1000;
const BLURRED_POLL_INTERVAL_MS = 2 * 60 * 1000;
// Minimum gap between automatic checkForPRs() invocations (focus catch-up,
// debounced branch-change recheck, post-restart startup check, poll backoff).
// Matches SWR's 5s `focusThrottleInterval` convention so rapid alt-tabbing —
// and a fleet-wide host-restart burst — don't hammer the GitHub API. Manual
// refresh() bypasses this by resetting `lastCheckAt` first.
const FOCUS_CATCHUP_THROTTLE_MS = 5 * 1000;

// Randomised delay before the first checkForPRs() after start(). The
// workspace-host's own restart is jittered, but the singleton's resolved-PR
// state wipes on restart, so without this every candidate worktree refetches
// at once — and across many windows whose hosts crashed together, that's a
// synchronised GitHub API burst right when GitHub itself may still be flaky.
// A short uniform spread (not the error-indexed `computeBackoff`) decorrelates
// the fleet. `resume()` (focus-restore) passes 0 to skip the jitter.
const STARTUP_JITTER_MIN_MS = 500;
const STARTUP_JITTER_MAX_MS = 2_500;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// AWS full-jitter backoff: sleep = random_between(floor, min(cap, base * 2^attempt))
// See https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 5 * 60_000;
const BACKOFF_FLOOR_MS = 1_000;

function computeBackoff(consecutiveErrors: number): number {
  const attempt = Math.max(0, consecutiveErrors - 1);
  const cap = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return BACKOFF_FLOOR_MS + Math.random() * (cap - BACKOFF_FLOOR_MS);
}

const MAX_CONSECUTIVE_ERRORS = 3;
const UPDATE_DEBOUNCE_MS = 100;

// Slow-cadence revalidation for resolved PRs to detect state changes (merged/closed)
const RESOLVED_REVALIDATION_INTERVAL_MS = 90 * 1000; // 90 seconds

// Adaptive boost: when any resolved PR has CI in-flight (PENDING/EXPECTED), drop
// the revalidation cadence so users see green/red transitions promptly. 30s is
// the floor — statusCheckRollup is ~10–30 GraphQL points per call, so 30s keeps
// headroom for ~8 active PRs under the 5000/hr primary limit. The ceiling caps
// boosted polling at 15 min after the last observed PENDING result, preventing
// a hung CI from indefinitely burning quota; subsequent PENDING observations
// slide the window forward.
const RESOLVED_REVALIDATION_BOOST_INTERVAL_MS = 30 * 1000; // 30 seconds
const RESOLVED_REVALIDATION_BOOST_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface WorktreeContext {
  issueNumber?: number;
  branchName?: string;
}

export interface PRDetectionResult {
  worktreeId: string;
  prNumber: number;
  prUrl: string;
  prState: "open" | "merged" | "closed";
}

function isCandidateBranch(branchName: string | undefined): boolean {
  if (!branchName) return false;
  const normalized = branchName.trim();
  if (!normalized) return false;

  const lower = normalized.toLowerCase();
  if (lower === "head") return false;
  if (lower === "main" || lower === "master") return false;
  return true;
}

class PullRequestService {
  private pollTimer: NodeJS.Timeout | null = null;
  private revalidationTimer: NodeJS.Timeout | null = null;
  private pollIntervalMs: number = FOCUSED_POLL_INTERVAL_MS;
  private cwd: string = "";
  private isPolling: boolean = false;
  private consecutiveErrors: number = 0;
  private nextRetryAt: number = 0;
  private detectionStateTripped: boolean = false;
  private boostExpiresAt: number | null = null;
  private lastCheckAt: number = Number.NEGATIVE_INFINITY;
  private startupDelayTimer: NodeJS.Timeout | null = null;
  private startupDelayResolve: (() => void) | null = null;

  get isEnabled(): boolean {
    return this.nextRetryAt === 0 || Date.now() >= this.nextRetryAt;
  }

  private candidates = new Map<string, WorktreeContext>();
  private resolvedWorktrees = new Set<string>();
  private detectedPRs = new Map<string, LinkedPR>();
  private updateDebounceTimer: NodeJS.Timeout | null = null;
  private unsubscribers: (() => void)[] = [];

  constructor() {
    this.unsubscribers.push(events.on("sys:worktree:update", this.handleWorktreeUpdate.bind(this)));
    this.unsubscribers.push(events.on("sys:worktree:remove", this.handleWorktreeRemove.bind(this)));
  }

  private handleWorktreeUpdate(state: WorktreeState): void {
    const currentContext = this.candidates.get(state.worktreeId);
    const newIssueNumber = state.issueNumber;
    const newBranchName = state.branch;

    const branchChanged = currentContext?.branchName !== newBranchName;
    const issueChanged = currentContext?.issueNumber !== newIssueNumber;

    const shouldTrack = !state.isMainWorktree && isCandidateBranch(newBranchName);

    // Build the next context first
    const nextContext: WorktreeContext = {
      branchName: newBranchName,
      issueNumber: newIssueNumber,
    };

    const wasCandidate = Boolean(currentContext);

    // Update candidates BEFORE emitting any events to prevent synchronous event loops.
    // The sys:pr:cleared event triggers emitUpdate which emits sys:worktree:update,
    // causing handleWorktreeUpdate to be called again synchronously. If we don't
    // update candidates first, we'll detect the same branch change repeatedly.
    if (shouldTrack) {
      this.candidates.set(state.worktreeId, nextContext);
    } else if (currentContext) {
      this.candidates.delete(state.worktreeId);
    }

    // Drop PR state whenever we de-track a previously-tracked worktree, not
    // just on a branch change. Otherwise a worktree that flips to
    // isMainWorktree without a branch swap (e.g., user designates it the
    // root) leaves a stale detectedPRs entry behind — and any PENDING
    // ciStatus on that entry would keep the adaptive boost armed for up to
    // 15 minutes against a worktree we no longer poll.
    const shouldClearPRState = currentContext && (branchChanged || !shouldTrack);

    if (shouldClearPRState) {
      if (branchChanged) {
        logDebug("Worktree branch changed - clearing PR state", {
          worktreeId: state.worktreeId,
          oldIssue: currentContext.issueNumber,
          newIssue: newIssueNumber,
          oldBranch: currentContext.branchName,
          newBranch: newBranchName,
        });
      }

      this.resolvedWorktrees.delete(state.worktreeId);
      this.detectedPRs.delete(state.worktreeId);

      // Tag the clear with the OLD branch so the renderer drops it if the
      // worktree's branch has since moved on again — the clear is only valid
      // for the branch identity at the time it was decided.
      events.emit("sys:pr:cleared", {
        worktreeId: state.worktreeId,
        branchName: currentContext.branchName,
        timestamp: Date.now(),
      });
    }

    if (!shouldTrack) {
      return;
    }

    const shouldRecheck =
      this.isPolling &&
      (branchChanged ||
        !wasCandidate ||
        (issueChanged && !this.resolvedWorktrees.has(state.worktreeId)));

    if (shouldRecheck) {
      this.scheduleDebounceCheck();
    }
  }

  private handleWorktreeRemove({ worktreeId }: { worktreeId: string }): void {
    if (this.candidates.has(worktreeId) || this.detectedPRs.has(worktreeId)) {
      const branchName = this.candidates.get(worktreeId)?.branchName;
      this.candidates.delete(worktreeId);
      this.resolvedWorktrees.delete(worktreeId);
      this.detectedPRs.delete(worktreeId);

      events.emit("sys:pr:cleared", { worktreeId, branchName, timestamp: Date.now() });

      logDebug("Worktree removed - cleared PR state", { worktreeId });
    }
  }

  private scheduleDebounceCheck(delayMs: number = UPDATE_DEBOUNCE_MS): void {
    if (this.updateDebounceTimer) {
      clearTimeout(this.updateDebounceTimer);
    }

    this.updateDebounceTimer = setTimeout(() => {
      this.updateDebounceTimer = null;

      if (!this.hasUnresolvedCandidates() || !this.isEnabled) {
        return;
      }

      // Startup jitter still pending: skip entirely. handleWorktreeUpdate
      // already updated the candidate map synchronously, so the upcoming
      // jittered initial check (runInitialCheck → checkForPRs) will pick
      // this candidate up. Running here would bypass the jitter and recreate
      // the synchronised post-restart burst (#8072).
      if (this.startupDelayTimer !== null) {
        return;
      }

      // A branch-change recheck inside the 5s floor is deferred until the
      // floor clears rather than dropped to the next poll tick — keeps
      // branch switches responsive (≤5s) without bursting the API.
      const waitMs = this.msUntilCheckAllowed();
      if (waitMs > 0) {
        this.scheduleDebounceCheck(waitMs);
        return;
      }

      logDebug("Running debounced PR check", { candidateCount: this.candidates.size });
      void this.checkForPRs().catch((err) =>
        logWarn("Debounced PR check failed", {
          error: formatErrorMessage(err, "Debounced PR check failed"),
        })
      );

      if (!this.pollTimer) {
        this.scheduleNextPoll();
      }
    }, delayMs);
  }

  /**
   * Milliseconds until an automatic checkForPRs() is allowed again under the
   * 5s floor. 0 means a check may proceed now. `lastCheckAt` is only advanced
   * when a real GitHub batch is attempted, so throttled/skipped calls never
   * push this window forward (avoids a no-progress reschedule loop).
   */
  private msUntilCheckAllowed(): number {
    return Math.max(0, FOCUS_CATCHUP_THROTTLE_MS - (Date.now() - this.lastCheckAt));
  }

  public initialize(cwd: string): void {
    this.cwd = cwd;
    logInfo("PullRequestService initialized", { cwd });
  }

  /**
   * Start polling. The first check is delayed by a randomised
   * STARTUP_JITTER_MIN..MAX window so a fleet-wide host restart doesn't fire a
   * synchronised PR refetch burst. Pass `startupDelayMs = 0` to check
   * immediately (focus-restore / resume(), which is not a crash-recovery
   * path). The returned promise resolves after the (delayed) first check, or
   * immediately if stop()/reset() cancels the pending delay.
   */
  public start(startupDelayMs?: number): Promise<void> {
    if (this.isPolling) {
      logWarn("PullRequestService already polling");
      return Promise.resolve();
    }

    if (!this.cwd) {
      logWarn("PullRequestService not initialized - call initialize() first");
      return Promise.resolve();
    }

    this.isPolling = true;
    this.nextRetryAt = 0;
    this.consecutiveErrors = 0;

    const delay = startupDelayMs ?? randomBetween(STARTUP_JITTER_MIN_MS, STARTUP_JITTER_MAX_MS);

    logInfo("PullRequestService started", {
      intervalMs: this.pollIntervalMs,
      startupDelayMs: Math.round(delay),
    });

    if (delay <= 0) {
      return this.runInitialCheck();
    }

    return new Promise<void>((resolve) => {
      this.startupDelayResolve = resolve;
      this.startupDelayTimer = setTimeout(() => {
        this.startupDelayTimer = null;
        this.startupDelayResolve = null;
        void this.runInitialCheck().finally(resolve);
      }, delay);
    });
  }

  private runInitialCheck(): Promise<void> {
    return this.checkForPRs().finally(() => {
      this.scheduleNextPoll();
      this.scheduleRevalidation();
    });
  }

  private clearStartupDelay(): void {
    if (this.startupDelayTimer) {
      clearTimeout(this.startupDelayTimer);
      this.startupDelayTimer = null;
    }
    // Resolve a still-pending start() promise so callers awaiting it (e.g.
    // PRIntegrationService.initialize) don't hang when stop()/reset() cancels
    // the jitter before the first check runs.
    if (this.startupDelayResolve) {
      const resolve = this.startupDelayResolve;
      this.startupDelayResolve = null;
      resolve();
    }
  }

  public stop(): void {
    this.clearStartupDelay();
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.revalidationTimer) {
      clearTimeout(this.revalidationTimer);
      this.revalidationTimer = null;
    }
    if (this.updateDebounceTimer) {
      clearTimeout(this.updateDebounceTimer);
      this.updateDebounceTimer = null;
    }
    this.boostExpiresAt = null;
    this.isPolling = false;
    logInfo("PullRequestService stopped");
  }

  public async refresh(): Promise<void> {
    if (!this.cwd) {
      return;
    }
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    // Manual refresh re-evaluates everything from scratch, so cancel any
    // pre-armed revalidation tick and clear the boost window — the post-check
    // reschedule below picks an interval based on the fresh CI status.
    if (this.revalidationTimer) {
      clearTimeout(this.revalidationTimer);
      this.revalidationTimer = null;
    }
    this.boostExpiresAt = null;
    this.nextRetryAt = 0;
    this.consecutiveErrors = 0;
    this.setDetectionState(false);
    clearPRCaches();
    // Force a full re-detect cycle so already-resolved worktrees re-query
    // dynamic PR fields (state, CI status). Without this, checkForPRs() skips
    // resolved worktrees and only the 90s revalidation timer would refresh
    // their CI status — which contradicts the "I want fresh data now"
    // semantics of a manual refresh.
    this.resolvedWorktrees.clear();
    // Manual refresh is an explicit "I want fresh data now" — bypass the 5s
    // floor by clearing the throttle clock before the direct checkForPRs().
    this.lastCheckAt = Number.NEGATIVE_INFINITY;
    await this.checkForPRs();

    if (this.isPolling) {
      if (this.hasUnresolvedCandidates()) {
        this.scheduleNextPoll();
      }
      this.scheduleRevalidation();
    }
  }

  public reset(): void {
    this.stop();
    this.candidates.clear();
    this.resolvedWorktrees.clear();
    this.detectedPRs.clear();
    this.consecutiveErrors = 0;
    this.nextRetryAt = 0;
    // Silent clear (no emit): reset() runs on project switch / service
    // teardown where the worktree port re-attaches and the renderer re-seeds
    // the breaker state via fetchInitialState(). Emitting here would race the
    // port handoff; clearing the tracking flag keeps a later genuine trip
    // from being suppressed as a no-op transition.
    this.detectionStateTripped = false;
    this.boostExpiresAt = null;
    this.lastCheckAt = Number.NEGATIVE_INFINITY;
  }

  /**
   * Switch poll cadence based on global window-focus state. Focused = ~30s
   * (snappy enough that PR transitions surface promptly), blurred = ~120s
   * (conserves GitHub API quota during long background sessions). Called
   * from main via the workspace-host IPC pipe; powerMonitor.ts is the focus
   * aggregator and idempotency guard, so this method is only invoked on a
   * real focus-state transition.
   *
   * On focus regain, also fires an immediate catch-up poll throttled to
   * FOCUS_CATCHUP_THROTTLE_MS (5s) — protects against rapid alt-tabbing
   * causing API bursts. The throttle is co-located with the rate-limited
   * resource (this service) rather than the IPC layer to avoid a second
   * round-trip just to decide whether to skip.
   */
  public setFocusCadence(focused: boolean): void {
    const targetInterval = focused ? FOCUSED_POLL_INTERVAL_MS : BLURRED_POLL_INTERVAL_MS;
    this.updatePollInterval(targetInterval);

    if (!focused || !this.isPolling) {
      return;
    }

    if (!this.hasUnresolvedCandidates() || !this.isEnabled) {
      return;
    }

    // Cheap pre-filter against the shared 5s floor. checkForPRs() is the
    // authoritative throttle gate (lesson #3333 — one guard at the choke
    // point), but skipping the pollTimer clear/reschedule here avoids
    // starving the poll loop when a user alt-tabs rapidly.
    if (this.msUntilCheckAllowed() > 0) {
      logDebug("Skipping PR focus catch-up — within throttle window", {
        waitMs: this.msUntilCheckAllowed(),
      });
      return;
    }

    // Cancel the scheduled poll and run an immediate check; the .finally
    // re-arms the timer at the new (focused) cadence. Avoids waiting up to
    // 30s after focus regain for the next normal tick.
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    void this.checkForPRs()
      .catch((err) => this.handleError(formatErrorMessage(err, "PR focus catch-up failed")))
      .finally(() => this.scheduleNextPoll());
  }

  private updatePollInterval(ms: number): void {
    if (this.pollIntervalMs === ms) {
      return;
    }
    this.pollIntervalMs = ms;
    logDebug("PR poll cadence updated", { intervalMs: ms });

    if (!this.isPolling) {
      return;
    }
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.scheduleNextPoll();
  }

  public destroy(): void {
    this.reset();
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }

  private scheduleNextPoll(): void {
    if (!this.isPolling) {
      return;
    }

    // Defensive clear: setFocusCadence and updatePollInterval can interleave
    // such that a `pollTimer` is already armed when the catch-up's `.finally`
    // re-enters this method. Without this clear we'd orphan the prior timer
    // and double the polling rate until `stop()`.
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    if (!this.isEnabled) {
      const delay = this.nextRetryAt - Date.now();
      if (delay > 0) {
        logDebug("Circuit breaker tripped - scheduling retry", { delayMs: delay });
        this.pollTimer = setTimeout(() => {
          this.pollTimer = null;
          if (!this.isPolling) return;
          logDebug("Circuit breaker recovery - running immediate check");
          this.consecutiveErrors = 0;
          this.nextRetryAt = 0;
          this.setDetectionState(false);
          void this.checkForPRs()
            .catch((err) => this.handleError(formatErrorMessage(err, "PR check failed")))
            .finally(() => this.scheduleNextPoll());
        }, delay);
      }
      return;
    }

    if (!this.hasUnresolvedCandidates()) {
      logDebug("All candidates resolved - pausing polling");
      return;
    }

    let interval = this.pollIntervalMs;
    if (this.consecutiveErrors > 0) {
      interval = computeBackoff(this.consecutiveErrors);
      logDebug("Using backoff interval", { errors: this.consecutiveErrors, intervalMs: interval });
    }

    // computeBackoff can return sub-5s intervals; raise the next tick to the
    // throttle boundary so the timer fires exactly when checkForPRs() would
    // be admitted again, instead of churning through throttled no-op wakeups.
    interval = Math.max(interval, this.msUntilCheckAllowed());

    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.checkForPRs()
        .catch((err) => this.handleError(formatErrorMessage(err, "PR check failed")))
        .finally(() => this.scheduleNextPoll());
    }, interval);
  }

  // Sliding boost window: if any resolved PR has CI in flight, extend
  // boostExpiresAt so the next scheduleRevalidation picks the 30s cadence.
  // A clean sweep clears it so the cadence decays back to the 90s baseline.
  // Called from the happy paths of checkForPRs and revalidateResolvedPRs —
  // a failed batch leaves the prior state alone so a transient error doesn't
  // accidentally cancel a live boost.
  private updateBoostFromDetectedPRs(): void {
    const hasPendingCi = Array.from(this.detectedPRs.values()).some(
      (pr) => pr.ciStatus === "PENDING" || pr.ciStatus === "EXPECTED"
    );
    this.boostExpiresAt = hasPendingCi
      ? Date.now() + RESOLVED_REVALIDATION_BOOST_DURATION_MS
      : null;
  }

  private hasUnresolvedCandidates(): boolean {
    for (const worktreeId of this.candidates.keys()) {
      if (!this.resolvedWorktrees.has(worktreeId)) {
        return true;
      }
    }
    return false;
  }

  private scheduleRevalidation(): void {
    if (!this.isPolling) {
      return;
    }

    if (this.revalidationTimer) {
      clearTimeout(this.revalidationTimer);
    }

    if (!this.isEnabled) {
      const delay = this.nextRetryAt - Date.now();
      if (delay > 0) {
        this.revalidationTimer = setTimeout(() => {
          this.revalidationTimer = null;
          this.scheduleRevalidation();
        }, delay);
      }
      return;
    }

    // Clear an expired boost timestamp before selecting the interval so a stale
    // value doesn't force one extra boosted tick after the ceiling has passed.
    if (this.boostExpiresAt !== null && this.boostExpiresAt <= Date.now()) {
      this.boostExpiresAt = null;
    }
    const intervalMs =
      this.boostExpiresAt !== null
        ? RESOLVED_REVALIDATION_BOOST_INTERVAL_MS
        : RESOLVED_REVALIDATION_INTERVAL_MS;

    this.revalidationTimer = setTimeout(() => {
      this.revalidationTimer = null;
      void this.revalidateResolvedPRs()
        .catch((err) =>
          logWarn("Revalidation unexpected error", {
            error: formatErrorMessage(err, "PR revalidation failed"),
          })
        )
        .finally(() => this.scheduleRevalidation());
    }, intervalMs);
  }

  private async revalidateResolvedPRs(): Promise<void> {
    if (!this.isEnabled || this.resolvedWorktrees.size === 0) {
      return;
    }

    const rateLimitBlock = gitHubRateLimitService.shouldBlockRequest();
    if (rateLimitBlock.blocked && rateLimitBlock.resumeAt) {
      this.nextRetryAt = rateLimitBlock.resumeAt;
      logDebug("Skipping PR revalidation — GitHub rate limit active", {
        reason: rateLimitBlock.reason,
        resumeAt: rateLimitBlock.resumeAt,
      });
      return;
    }

    // Collect resolved worktrees that need revalidation. Always include the
    // detected PR number so GitHubService can use ETag conditional requests
    // to skip GraphQL when nothing has changed.
    const candidatesToRevalidate: PRCheckCandidate[] = [];
    // Snapshot the lookup-time branch per worktree so a branch change during
    // the in-flight check doesn't let a stale overlay override the new state.
    const lookupBranchByWorktreeId = new Map<string, string | undefined>();
    for (const worktreeId of this.resolvedWorktrees) {
      const context = this.candidates.get(worktreeId);
      const detectedPR = this.detectedPRs.get(worktreeId);
      if (context && detectedPR) {
        candidatesToRevalidate.push({
          worktreeId,
          issueNumber: context.issueNumber,
          branchName: context.branchName,
          knownPRNumber: detectedPR.number,
        });
        lookupBranchByWorktreeId.set(worktreeId, context.branchName);
      }
    }

    if (candidatesToRevalidate.length === 0) {
      return;
    }

    logDebug("Revalidating resolved PRs", { count: candidatesToRevalidate.length });

    try {
      const result = await batchCheckLinkedPRs(this.cwd, candidatesToRevalidate);

      if (result.error) {
        logWarn("Revalidation check failed", { error: result.error });
        return;
      }

      for (const [worktreeId, checkResult] of result.results) {
        const existingPR = this.detectedPRs.get(worktreeId);
        const newPR = checkResult.pr;

        if (!newPR) {
          // PR no longer exists (deleted?) - clear state
          this.resolvedWorktrees.delete(worktreeId);
          this.detectedPRs.delete(worktreeId);

          logInfo("PR no longer found during revalidation - clearing state", { worktreeId });
          events.emit("sys:pr:cleared", {
            worktreeId,
            branchName: lookupBranchByWorktreeId.get(worktreeId),
            timestamp: Date.now(),
          });
          continue;
        }

        // Check if PR metadata changed (state, number, title, url, or CI status)
        const prChanged =
          existingPR &&
          (existingPR.state !== newPR.state ||
            existingPR.number !== newPR.number ||
            existingPR.title !== newPR.title ||
            existingPR.url !== newPR.url ||
            existingPR.ciStatus !== newPR.ciStatus);

        if (prChanged) {
          logInfo("PR metadata changed during revalidation", {
            worktreeId,
            prNumber: newPR.number,
            changes: {
              state:
                existingPR.state !== newPR.state
                  ? `${existingPR.state} → ${newPR.state}`
                  : undefined,
              number:
                existingPR.number !== newPR.number
                  ? `${existingPR.number} → ${newPR.number}`
                  : undefined,
              title: existingPR.title !== newPR.title ? true : undefined,
              url: existingPR.url !== newPR.url ? true : undefined,
              ciStatus:
                existingPR.ciStatus !== newPR.ciStatus
                  ? `${existingPR.ciStatus ?? "none"} → ${newPR.ciStatus ?? "none"}`
                  : undefined,
            },
          });

          this.detectedPRs.set(worktreeId, newPR);

          const issueNumber =
            checkResult.issueNumber ?? this.candidates.get(worktreeId)?.issueNumber;
          events.emit("sys:pr:detected", {
            worktreeId,
            prNumber: newPR.number,
            prUrl: newPR.url,
            prState: newPR.state,
            prCiStatus: newPR.ciStatus,
            prTitle: newPR.title,
            issueNumber,
            issueTitle: checkResult.issueTitle,
            branchName: lookupBranchByWorktreeId.get(worktreeId),
            timestamp: Date.now(),
          });
        }
      }

      this.updateBoostFromDetectedPRs();
    } catch (error) {
      logWarn("Revalidation check error", {
        error: formatErrorMessage(error, "PR revalidation failed"),
      });
    }
  }

  private async checkForPRs(): Promise<void> {
    const rateLimitBlock = gitHubRateLimitService.shouldBlockRequest();
    if (rateLimitBlock.blocked && rateLimitBlock.resumeAt) {
      // Park polling at the known resume time without incrementing the
      // circuit breaker. GitHub docs explicitly warn that retrying through a
      // secondary rate limit can escalate to a permanent ban, so even for
      // secondary limits we use the same one-shot resume pattern rather than
      // touching `consecutiveErrors`.
      this.nextRetryAt = rateLimitBlock.resumeAt;
      logDebug("Skipping PR check — GitHub rate limit active", {
        reason: rateLimitBlock.reason,
        resumeAt: rateLimitBlock.resumeAt,
        waitMs: rateLimitBlock.resumeAt - Date.now(),
      });
      return;
    }

    const activeCandidates: PRCheckCandidate[] = [];
    // Snapshot the lookup-time branch per worktree so a branch change during
    // the in-flight check doesn't let a stale overlay override the new state.
    const lookupBranchByWorktreeId = new Map<string, string | undefined>();
    for (const [worktreeId, context] of this.candidates) {
      if (!this.resolvedWorktrees.has(worktreeId)) {
        activeCandidates.push({
          worktreeId,
          issueNumber: context.issueNumber,
          branchName: context.branchName,
        });
        lookupBranchByWorktreeId.set(worktreeId, context.branchName);
      }
    }

    if (activeCandidates.length === 0) {
      logDebug("No candidates to check for PRs");
      return;
    }

    // Shared 5s floor across all automatic trigger paths (startup, poll,
    // backoff, focus catch-up, debounced branch-change). Manual refresh()
    // bypasses by resetting lastCheckAt first. The clock advances only here —
    // on an admitted real batch attempt — so skipped calls never push the
    // window forward.
    const waitMs = this.msUntilCheckAllowed();
    if (waitMs > 0) {
      logDebug("Skipping PR check — within throttle window", { waitMs });
      return;
    }
    this.lastCheckAt = Date.now();

    logDebug("Checking PRs for candidates", { count: activeCandidates.length });

    try {
      const result = await batchCheckLinkedPRs(this.cwd, activeCandidates);

      if (result.error) {
        this.handleError(result.error, result.rateLimit);
        return;
      }

      this.consecutiveErrors = 0;

      for (const [worktreeId, checkResult] of result.results) {
        const lookupBranch = lookupBranchByWorktreeId.get(worktreeId);
        // Emit issue metadata if we have a title (regardless of PR)
        const issueNumber = checkResult.issueNumber ?? this.candidates.get(worktreeId)?.issueNumber;
        if (issueNumber && checkResult.issueTitle) {
          events.emit("sys:issue:detected", {
            worktreeId,
            issueNumber,
            issueTitle: checkResult.issueTitle,
            branchName: lookupBranch,
            timestamp: Date.now(),
          });
        } else if (issueNumber && !checkResult.issueTitle) {
          events.emit("sys:issue:not-found", {
            worktreeId,
            issueNumber,
            timestamp: Date.now(),
          });
        }

        if (checkResult.pr) {
          this.resolvedWorktrees.add(worktreeId);
          this.detectedPRs.set(worktreeId, checkResult.pr);

          logInfo("PR detected for worktree", {
            worktreeId,
            prNumber: checkResult.pr.number,
            prState: checkResult.pr.state,
          });

          events.emit("sys:pr:detected", {
            worktreeId,
            prNumber: checkResult.pr.number,
            prUrl: checkResult.pr.url,
            prState: checkResult.pr.state,
            prCiStatus: checkResult.pr.ciStatus,
            prTitle: checkResult.pr.title,
            issueNumber,
            issueTitle: checkResult.issueTitle,
            branchName: lookupBranch,
            timestamp: Date.now(),
          });
        }
      }

      this.updateBoostFromDetectedPRs();
    } catch (error) {
      this.handleError(formatErrorMessage(error, "PR check failed"));
    }
  }

  private handleError(
    errorMsg: string,
    rateLimit?: { kind: "primary" | "secondary"; resumeAt: number }
  ): void {
    // Prefer a rate-limit marker captured synchronously alongside the
    // failing request — checking the mutable singleton here would race
    // with a concurrent 2xx clearing state between the 429 and this
    // handler. Treat a rate-limit pause distinctly from a circuit-breaker
    // trip: GitHub's docs warn that blind retry through secondary limits
    // can escalate to a permanent ban.
    if (rateLimit) {
      this.nextRetryAt = rateLimit.resumeAt;
      logWarn("PR check hit a GitHub rate limit — pausing without tripping circuit breaker", {
        reason: rateLimit.kind,
        resumeAt: rateLimit.resumeAt,
      });
      return;
    }

    this.consecutiveErrors++;
    logWarn("PR check failed", { error: errorMsg, consecutiveErrors: this.consecutiveErrors });

    if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      const backoffMs = computeBackoff(this.consecutiveErrors);
      this.nextRetryAt = Date.now() + backoffMs;
      logWarn("Too many consecutive errors - pausing PR polling", { retryInMs: backoffMs });
      events.emit("ui:notify", {
        type: "warning",
        message: "PR detection paused due to errors. Will retry automatically.",
        id: "pr-service-circuit-breaker",
      });
      this.setDetectionState(true);
    }
  }

  /**
   * Emit the circuit-breaker ambient state to the renderer, but only on a
   * genuine transition. Errors keep arriving while the breaker is tripped and
   * `refresh()` runs frequently, so an unconditional emit would flood the
   * worktree port and the PR badge store with redundant events.
   */
  private setDetectionState(tripped: boolean): void {
    if (this.detectionStateTripped === tripped) {
      return;
    }
    this.detectionStateTripped = tripped;
    events.emit("sys:pr:detection-state", { tripped, timestamp: Date.now() });
  }

  public getStatus(): {
    isPolling: boolean;
    isEnabled: boolean;
    candidateCount: number;
    resolvedCount: number;
    consecutiveErrors: number;
  } {
    return {
      isPolling: this.isPolling,
      isEnabled: this.isEnabled,
      candidateCount: this.candidates.size,
      resolvedCount: this.resolvedWorktrees.size,
      consecutiveErrors: this.consecutiveErrors,
    };
  }
}

export const pullRequestService = new PullRequestService();
