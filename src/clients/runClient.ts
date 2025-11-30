/**
 * Run Orchestration IPC Client
 *
 * Provides a typed interface for run orchestration IPC operations.
 * Wraps window.electron.run.* calls for testability and maintainability.
 */

import type { EventContext, RunMetadata } from "@shared/types";

/**
 * Client for run orchestration IPC operations.
 *
 * @example
 * ```typescript
 * import { runClient } from "@/clients/runClient";
 *
 * const runId = await runClient.start("Deploy", { worktreeId: "abc" });
 * await runClient.updateProgress(runId, 0.5, "Halfway done");
 * await runClient.complete(runId);
 * ```
 */
export const runClient = {
  /** Start a new run */
  start: (name: string, context?: EventContext, description?: string): Promise<string> => {
    return window.electron.run.start(name, context, description);
  },

  /** Update run progress */
  updateProgress: (runId: string, progress: number, message?: string): Promise<void> => {
    return window.electron.run.updateProgress(runId, progress, message);
  },

  /** Pause a run */
  pause: (runId: string, reason?: string): Promise<void> => {
    return window.electron.run.pause(runId, reason);
  },

  /** Resume a paused run */
  resume: (runId: string): Promise<void> => {
    return window.electron.run.resume(runId);
  },

  /** Complete a run successfully */
  complete: (runId: string): Promise<void> => {
    return window.electron.run.complete(runId);
  },

  /** Mark a run as failed */
  fail: (runId: string, error: string): Promise<void> => {
    return window.electron.run.fail(runId, error);
  },

  /** Cancel a run */
  cancel: (runId: string, reason?: string): Promise<void> => {
    return window.electron.run.cancel(runId, reason);
  },

  /** Get a run by ID */
  get: (runId: string): Promise<RunMetadata | undefined> => {
    return window.electron.run.get(runId);
  },

  /** Get all runs */
  getAll: (): Promise<RunMetadata[]> => {
    return window.electron.run.getAll();
  },

  /** Get active runs */
  getActive: (): Promise<RunMetadata[]> => {
    return window.electron.run.getActive();
  },

  /** Clear finished runs */
  clearFinished: (olderThan?: number): Promise<number> => {
    return window.electron.run.clearFinished(olderThan);
  },

  /** Subscribe to run events. Returns cleanup function. */
  onEvent: (callback: (event: { type: string; payload: unknown }) => void): (() => void) => {
    return window.electron.run.onEvent(callback);
  },
} as const;
