/**
 * RunManager - Manages run lifecycle for multi-agent orchestration
 *
 * A "run" is a multi-step workflow that groups related agent/terminal operations
 * into a cohesive unit. This enables tracking of operations like "work on issue #42"
 * through multiple spawned agents, context injections, and terminal commands.
 *
 * @example
 * // Start a new run
 * const runId = runManager.startRun('Work on Issue #42', {
 *   worktreeId: 'wt-1',
 *   issueNumber: 42,
 * });
 *
 * // Update progress
 * runManager.updateProgress(runId, 0.5, 'Generating context...');
 *
 * // Complete the run
 * runManager.completeRun(runId);
 */

import { events } from "./events.js";
import type { EventContext, RunMetadata, RunState } from "@shared/types/index.js";

/**
 * Manages run lifecycle and emits run events.
 * A "run" is a multi-step workflow (e.g., "work on issue #42").
 */
export class RunManager {
  private runs = new Map<string, RunMetadata>();

  /**
   * Start a new run.
   *
   * @param name - Human-readable name for the run
   * @param context - Event context for filtering and correlation
   * @param description - Optional description of what the run does
   * @returns The unique run ID
   */
  public startRun(name: string, context: EventContext = {}, description?: string): string {
    const runId = this.generateRunId();
    const startedAt = Date.now();

    // Remove runId from context if provided to prevent override
    const { runId: _ignored, ...sanitizedContext } = context;

    const metadata: RunMetadata = {
      runId,
      name,
      description,
      context: { ...sanitizedContext, runId }, // Include generated runId in context
      startedAt,
      state: "running",
      progress: 0,
    };

    this.runs.set(runId, metadata);

    // Emit run:started event with sanitized context
    events.emit("run:started", {
      runId,
      name,
      description,
      ...sanitizedContext,
      timestamp: startedAt,
    });

    return runId;
  }

  /**
   * Update run progress.
   *
   * @param runId - The run to update
   * @param progress - Progress percentage (0-1)
   * @param message - Optional progress message
   */
  public updateProgress(runId: string, progress: number, message?: string): void {
    const run = this.runs.get(runId);
    if (!run) {
      console.warn(`[RunManager] Cannot update progress for unknown run: ${runId}`);
      return;
    }

    // Only update progress for active runs
    if (run.state !== "running" && run.state !== "paused") {
      console.warn(`[RunManager] Cannot update progress for run in terminal state: ${run.state}`);
      return;
    }

    // Validate progress is finite and clamp to 0-1
    if (!Number.isFinite(progress)) {
      console.warn(`[RunManager] Invalid progress value: ${progress}, ignoring`);
      return;
    }
    run.progress = Math.max(0, Math.min(1, progress));

    events.emit("run:progress", {
      runId,
      progress: run.progress,
      message,
      ...run.context,
      timestamp: Date.now(),
    });
  }

  /**
   * Pause a run (waiting for input).
   *
   * @param runId - The run to pause
   * @param reason - Optional reason for pausing
   */
  public pauseRun(runId: string, reason?: string): void {
    const run = this.runs.get(runId);
    if (!run) {
      console.warn(`[RunManager] Cannot pause unknown run: ${runId}`);
      return;
    }

    if (run.state !== "running") {
      console.warn(`[RunManager] Cannot pause run in state: ${run.state}`);
      return;
    }

    run.state = "paused";

    events.emit("run:paused", {
      runId,
      reason,
      ...run.context,
      timestamp: Date.now(),
    });
  }

  /**
   * Resume a paused run.
   *
   * @param runId - The run to resume
   */
  public resumeRun(runId: string): void {
    const run = this.runs.get(runId);
    if (!run) {
      console.warn(`[RunManager] Cannot resume unknown run: ${runId}`);
      return;
    }

    if (run.state !== "paused") {
      console.warn(`[RunManager] Cannot resume run in state: ${run.state}`);
      return;
    }

    run.state = "running";

    events.emit("run:resumed", {
      runId,
      ...run.context,
      timestamp: Date.now(),
    });
  }

  /**
   * Complete a run successfully.
   *
   * @param runId - The run to complete
   */
  public completeRun(runId: string): void {
    const run = this.runs.get(runId);
    if (!run) {
      console.warn(`[RunManager] Cannot complete unknown run: ${runId}`);
      return;
    }

    // Idempotent: only transition if not already in a terminal state
    if (run.state === "completed" || run.state === "failed" || run.state === "cancelled") {
      console.warn(`[RunManager] Run already in terminal state: ${run.state}`);
      return;
    }

    const completedAt = Date.now();
    run.completedAt = completedAt;
    run.duration = completedAt - run.startedAt;
    run.state = "completed";
    run.progress = 1;

    events.emit("run:completed", {
      runId,
      duration: run.duration,
      ...run.context,
      timestamp: completedAt,
    });
  }

  /**
   * Mark run as failed.
   *
   * @param runId - The run that failed
   * @param error - Error message describing the failure
   */
  public failRun(runId: string, error: string): void {
    const run = this.runs.get(runId);
    if (!run) {
      console.warn(`[RunManager] Cannot fail unknown run: ${runId}`);
      return;
    }

    // Idempotent: only transition if not already in a terminal state
    if (run.state === "completed" || run.state === "failed" || run.state === "cancelled") {
      console.warn(`[RunManager] Run already in terminal state: ${run.state}`);
      return;
    }

    const failedAt = Date.now();
    run.completedAt = failedAt;
    run.duration = failedAt - run.startedAt;
    run.state = "failed";
    run.error = error;

    events.emit("run:failed", {
      runId,
      error,
      duration: run.duration,
      ...run.context,
      timestamp: failedAt,
    });
  }

  /**
   * Cancel a run.
   *
   * @param runId - The run to cancel
   * @param reason - Optional reason for cancellation
   */
  public cancelRun(runId: string, reason?: string): void {
    const run = this.runs.get(runId);
    if (!run) {
      console.warn(`[RunManager] Cannot cancel unknown run: ${runId}`);
      return;
    }

    // Idempotent: only transition if not already in a terminal state
    if (run.state === "completed" || run.state === "failed" || run.state === "cancelled") {
      console.warn(`[RunManager] Run already in terminal state: ${run.state}`);
      return;
    }

    const cancelledAt = Date.now();
    run.completedAt = cancelledAt;
    run.duration = cancelledAt - run.startedAt;
    run.state = "cancelled";

    events.emit("run:cancelled", {
      runId,
      reason,
      duration: run.duration,
      ...run.context,
      timestamp: cancelledAt,
    });
  }

  /**
   * Get run metadata.
   *
   * @param runId - The run to retrieve
   * @returns Run metadata or undefined if not found
   */
  public getRun(runId: string): RunMetadata | undefined {
    return this.runs.get(runId);
  }

  /**
   * Get all runs.
   *
   * @returns Array of all run metadata
   */
  public getAllRuns(): RunMetadata[] {
    return Array.from(this.runs.values());
  }

  /**
   * Get all active runs (running or paused).
   *
   * @returns Array of active run metadata
   */
  public getActiveRuns(): RunMetadata[] {
    return Array.from(this.runs.values()).filter(
      (r) => r.state === "running" || r.state === "paused"
    );
  }

  /**
   * Get runs by state.
   *
   * @param state - The state to filter by
   * @returns Array of run metadata matching the state
   */
  public getRunsByState(state: RunState): RunMetadata[] {
    return Array.from(this.runs.values()).filter((r) => r.state === state);
  }

  /**
   * Get runs by context field.
   *
   * @param field - The context field to filter by
   * @param value - The value to match
   * @returns Array of run metadata matching the filter
   */
  public getRunsByContext<K extends keyof EventContext>(
    field: K,
    value: EventContext[K]
  ): RunMetadata[] {
    return Array.from(this.runs.values()).filter((r) => r.context[field] === value);
  }

  /**
   * Clear completed/failed/cancelled runs from memory.
   * Useful for garbage collection after runs are no longer needed.
   *
   * @param olderThan - Optional timestamp; only clear runs completed before this time
   * @returns Number of runs cleared
   */
  public clearFinishedRuns(olderThan?: number): number {
    const terminalStates: RunState[] = ["completed", "failed", "cancelled"];
    let cleared = 0;

    for (const [runId, run] of this.runs.entries()) {
      if (terminalStates.includes(run.state)) {
        if (olderThan === undefined || (run.completedAt && run.completedAt < olderThan)) {
          this.runs.delete(runId);
          cleared++;
        }
      }
    }

    return cleared;
  }

  /**
   * Clear all runs from memory.
   * Use with caution - typically only for testing or shutdown.
   */
  public clearAllRuns(): void {
    this.runs.clear();
  }

  /**
   * Generate a unique run ID.
   */
  private generateRunId(): string {
    return `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/** Singleton instance of RunManager */
export const runManager = new RunManager();
