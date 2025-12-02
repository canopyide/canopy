/**
 * PullRequestService - Centralized polling for PR detection across all worktrees.
 *
 * Architecture:
 * - Singleton service that subscribes to sys:worktree:update events
 * - Detects context changes (branch/issue) and emits sys:pr:cleared immediately
 * - Batches all worktree checks into a single GraphQL query
 * - Stops checking worktrees once a PR is found (resolved state)
 * - Emits sys:pr:detected and sys:pr:cleared events for UI updates
 *
 * Rate Limit Safety:
 * - Default 60s polling = 60 requests/hour = 1.2% of 5000 point budget
 * - Single GraphQL query checks all worktrees (batched)
 * - Exponential backoff on errors with circuit breaker protection
 *
 * Migrated from Canopy CLI with Electron-specific patterns.
 */

import { events } from "./events.js";
import { batchCheckLinkedPRs, type PRCheckCandidate, type LinkedPR } from "./GitHubService.js";
import { logInfo, logWarn, logDebug } from "../utils/logger.js";
import type { WorktreeState } from "./WorktreeMonitor.js";

// Default polling interval: 60 seconds (safe for rate limits - uses ~1.2% of hourly budget)
const DEFAULT_POLL_INTERVAL_MS = 60 * 1000;

// Backoff intervals for error handling
const ERROR_BACKOFF_INTERVALS = [
  5 * 60 * 1000, // 5 minutes after first error
  10 * 60 * 1000, // 10 minutes after second error
  30 * 60 * 1000, // 30 minutes after third+ error
];

// Maximum consecutive errors before disabling polling (circuit breaker)
const MAX_CONSECUTIVE_ERRORS = 3;

// Debounce delay for batching worktree updates
const UPDATE_DEBOUNCE_MS = 100;

/**
 * Tracked context for a worktree - used to detect when branch/issue changes.
 */
interface WorktreeContext {
  issueNumber?: number;
  branchName?: string;
}

/**
 * PR detection result for a single worktree.
 */
export interface PRDetectionResult {
  worktreeId: string;
  prNumber: number;
  prUrl: string;
  prState: "open" | "merged" | "closed";
}

/**
 * PullRequestService manages centralized polling for PR detection across all worktrees.
 *
 * Usage:
 * ```typescript
 * // Initialize with repo root path
 * pullRequestService.initialize('/path/to/repo');
 *
 * // Start polling (automatically registers candidates from worktree events)
 * pullRequestService.start();
 *
 * // Manual refresh (e.g., after fixing auth issues)
 * await pullRequestService.refresh();
 *
 * // Stop polling
 * pullRequestService.stop();
 *
 * // Clean up on shutdown
 * pullRequestService.destroy();
 * ```
 *
 * Events emitted:
 * - sys:pr:detected - When a PR is found for a worktree
 * - sys:pr:cleared - When PR data should be cleared (context change)
 *
 * Events consumed:
 * - sys:worktree:update - Registers/updates candidates, detects context changes
 * - sys:worktree:remove - Cleans up removed worktrees
 */
class PullRequestService {
  private pollTimer: NodeJS.Timeout | null = null;
  private pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS;
  private cwd: string = "";
  private isPolling: boolean = false;
  private consecutiveErrors: number = 0;
  private isEnabled: boolean = true;

  // Track worktrees that need PR checking
  // Key: worktreeId, Value: { issueNumber, branchName }
  private candidates = new Map<string, WorktreeContext>();

  // Track resolved worktrees (already have a PR detected)
  // These are excluded from future polling
  private resolvedWorktrees = new Set<string>();

  // Store detected PRs for quick lookup
  private detectedPRs = new Map<string, LinkedPR>();

  // Timer for debounced check after worktree updates
  private updateDebounceTimer: NodeJS.Timeout | null = null;

  // Event unsubscribe functions
  private unsubscribers: (() => void)[] = [];

  constructor() {
    // Subscribe to worktree events directly - this is the source of truth
    this.unsubscribers.push(events.on("sys:worktree:update", this.handleWorktreeUpdate.bind(this)));
    this.unsubscribers.push(events.on("sys:worktree:remove", this.handleWorktreeRemove.bind(this)));
  }

  /**
   * Handle worktree update events - the core of reactive state management.
   * Detects context changes and immediately clears/updates PR data.
   */
  private handleWorktreeUpdate(state: WorktreeState): void {
    if (!this.isPolling) {
      return;
    }

    const currentContext = this.candidates.get(state.worktreeId);
    const newIssueNumber = state.issueNumber;
    const newBranchName = state.branch;

    // Detect if the "identity" of the work context changed
    const contextChanged =
      currentContext?.issueNumber !== newIssueNumber ||
      currentContext?.branchName !== newBranchName;

    if (contextChanged && currentContext) {
      // Context changed - CLEAR immediately
      logInfo("Worktree context changed - clearing PR state", {
        worktreeId: state.worktreeId,
        oldIssue: currentContext.issueNumber,
        newIssue: newIssueNumber,
        oldBranch: currentContext.branchName,
        newBranch: newBranchName,
      });

      this.resolvedWorktrees.delete(state.worktreeId);
      this.detectedPRs.delete(state.worktreeId);

      // Emit clear event so UI removes the PR button immediately
      events.emit("sys:pr:cleared", { worktreeId: state.worktreeId });
    }

    // Update or register the candidate
    if (newIssueNumber) {
      // Has an issue number - track as candidate
      this.candidates.set(state.worktreeId, {
        issueNumber: newIssueNumber,
        branchName: newBranchName,
      });

      // Schedule a debounced check if context changed or this is a new candidate
      if (contextChanged || !currentContext) {
        this.scheduleDebounceCheck();
      }
    } else {
      // No issue number - stop tracking this worktree
      if (currentContext) {
        this.candidates.delete(state.worktreeId);
        logDebug("Worktree no longer has issue number - removed from candidates", {
          worktreeId: state.worktreeId,
        });
      }
    }
  }

  /**
   * Handle worktree removal events.
   */
  private handleWorktreeRemove({ worktreeId }: { worktreeId: string }): void {
    if (this.candidates.has(worktreeId) || this.detectedPRs.has(worktreeId)) {
      this.candidates.delete(worktreeId);
      this.resolvedWorktrees.delete(worktreeId);
      this.detectedPRs.delete(worktreeId);

      // Emit clear event
      events.emit("sys:pr:cleared", { worktreeId });

      logDebug("Worktree removed - cleared PR state", { worktreeId });
    }
  }

  /**
   * Schedule a debounced PR check.
   * This batches rapid updates (e.g., multiple worktrees updating at once).
   */
  private scheduleDebounceCheck(): void {
    if (this.updateDebounceTimer) {
      clearTimeout(this.updateDebounceTimer);
    }

    this.updateDebounceTimer = setTimeout(() => {
      this.updateDebounceTimer = null;

      if (this.hasUnresolvedCandidates()) {
        logDebug("Running debounced PR check", { candidateCount: this.candidates.size });
        void this.checkForPRs();

        // Ensure polling continues if it was paused
        if (!this.pollTimer) {
          this.scheduleNextPoll();
        }
      }
    }, UPDATE_DEBOUNCE_MS);
  }

  /**
   * Initialize the service with the working directory.
   * @param cwd - Working directory (repo root)
   */
  public initialize(cwd: string): void {
    this.cwd = cwd;
    logInfo("PullRequestService initialized", { cwd });
  }

  /**
   * Start the polling loop.
   * Note: Candidates are now registered automatically via sys:worktree:update events.
   * @param intervalMs - Optional custom polling interval (default: 60000ms, minimum: 60000ms)
   */
  public start(intervalMs?: number): void {
    if (this.isPolling) {
      logWarn("PullRequestService already polling");
      return;
    }

    if (!this.cwd) {
      logWarn("PullRequestService not initialized - call initialize() first");
      return;
    }

    if (intervalMs) {
      // Enforce minimum 60s interval for rate limit safety
      if (intervalMs < DEFAULT_POLL_INTERVAL_MS) {
        logWarn("PR polling interval too short - clamping to minimum 60s for rate limit safety", {
          requested: intervalMs,
          clamped: DEFAULT_POLL_INTERVAL_MS,
        });
        this.pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
      } else {
        this.pollIntervalMs = intervalMs;
      }
    }

    this.isPolling = true;
    this.isEnabled = true;
    this.consecutiveErrors = 0;

    logInfo("PullRequestService started", { intervalMs: this.pollIntervalMs });

    // Start polling loop - initial check will happen when worktree updates arrive
    this.scheduleNextPoll();
  }

  /**
   * Stop the polling loop.
   */
  public stop(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.updateDebounceTimer) {
      clearTimeout(this.updateDebounceTimer);
      this.updateDebounceTimer = null;
    }
    this.isPolling = false;
    logInfo("PullRequestService stopped");
  }

  /**
   * Force an immediate PR check (e.g., on manual refresh).
   * Re-enables polling if it was disabled due to errors.
   */
  public async refresh(): Promise<void> {
    if (!this.cwd) {
      return;
    }
    // Re-enable if disabled due to errors
    this.isEnabled = true;
    this.consecutiveErrors = 0;
    await this.checkForPRs();

    // Resume polling if it was paused
    if (this.isPolling && !this.pollTimer && this.hasUnresolvedCandidates()) {
      this.scheduleNextPoll();
    }
  }

  /**
   * Clear all state and stop polling.
   */
  public reset(): void {
    this.stop();
    this.candidates.clear();
    this.resolvedWorktrees.clear();
    this.detectedPRs.clear();
    this.consecutiveErrors = 0;
    this.isEnabled = true;
  }

  /**
   * Clean up event subscriptions.
   * Should be called on app shutdown.
   */
  public destroy(): void {
    this.reset();
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }

  /**
   * Schedule the next poll with appropriate interval.
   * Uses exponential backoff if errors have occurred.
   */
  private scheduleNextPoll(): void {
    if (!this.isPolling || !this.isEnabled) {
      return;
    }

    // Don't schedule if there's nothing to check
    if (!this.hasUnresolvedCandidates()) {
      logDebug("All candidates resolved - pausing polling until new candidates appear");
      return;
    }

    // Calculate backoff if we have errors
    let interval = this.pollIntervalMs;
    if (this.consecutiveErrors > 0) {
      const backoffIndex = Math.min(this.consecutiveErrors - 1, ERROR_BACKOFF_INTERVALS.length - 1);
      interval = ERROR_BACKOFF_INTERVALS[backoffIndex];
      logDebug("Using backoff interval", { errors: this.consecutiveErrors, intervalMs: interval });
    }

    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.checkForPRs().then(() => this.scheduleNextPoll());
    }, interval);
  }

  /**
   * Check if there are any unresolved candidates that need checking.
   */
  private hasUnresolvedCandidates(): boolean {
    for (const worktreeId of this.candidates.keys()) {
      if (!this.resolvedWorktrees.has(worktreeId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Execute a PR check for all registered candidates.
   */
  private async checkForPRs(): Promise<void> {
    // Get candidates that haven't been resolved yet
    const activeCandidates: PRCheckCandidate[] = [];
    for (const [worktreeId, context] of this.candidates) {
      if (!this.resolvedWorktrees.has(worktreeId)) {
        activeCandidates.push({
          worktreeId,
          issueNumber: context.issueNumber,
          branchName: context.branchName,
        });
      }
    }

    if (activeCandidates.length === 0) {
      logDebug("No candidates to check for PRs - all resolved or none registered");
      return;
    }

    logDebug("Checking PRs for candidates", { count: activeCandidates.length });

    try {
      const result = await batchCheckLinkedPRs(this.cwd, activeCandidates);

      if (result.error) {
        this.handleError(result.error);
        return;
      }

      // Reset error count on success
      this.consecutiveErrors = 0;

      // Process results
      for (const [worktreeId, checkResult] of result.results) {
        if (checkResult.pr) {
          // PR found! Mark as resolved and emit event
          this.resolvedWorktrees.add(worktreeId);
          this.detectedPRs.set(worktreeId, checkResult.pr);

          logInfo("PR detected for worktree", {
            worktreeId,
            prNumber: checkResult.pr.number,
            prState: checkResult.pr.state,
          });

          // Emit event for UI update
          events.emit("sys:pr:detected", {
            worktreeId,
            prNumber: checkResult.pr.number,
            prUrl: checkResult.pr.url,
            prState: checkResult.pr.state,
            issueNumber: checkResult.issueNumber!,
          });
        }
      }
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : "Unknown error");
    }
  }

  /**
   * Handle errors with backoff logic and circuit breaker.
   */
  private handleError(errorMsg: string): void {
    this.consecutiveErrors++;
    logWarn("PR check failed", { error: errorMsg, consecutiveErrors: this.consecutiveErrors });

    if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      logWarn("Too many consecutive errors - disabling PR polling until manual refresh");
      this.isEnabled = false;
      events.emit("ui:notify", {
        type: "warning",
        message: "PR detection paused due to errors. Refresh to retry.",
        id: "pr-service-circuit-breaker",
      });
    }
  }

  /**
   * Get current service status for debugging.
   */
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

// Export singleton instance
export const pullRequestService = new PullRequestService();
