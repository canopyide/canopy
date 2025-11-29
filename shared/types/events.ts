/**
 * Event system types for Canopy Command Center
 *
 * These types support multi-agent orchestration and run tracking,
 * enabling correlation of related operations through the event stream.
 */

// ============================================================================
// EventContext - Common context embedded in all domain events
// ============================================================================

/**
 * Common context embedded in all domain events.
 * Enables filtering and correlation across the event stream.
 *
 * @example
 * // Filtering events by run
 * eventBuffer.getFiltered({ runId: 'run-123' });
 *
 * // Filtering events by issue
 * eventBuffer.getFiltered({ issueNumber: 42 });
 */
export interface EventContext {
  /** ID of the worktree this event relates to */
  worktreeId?: string;

  /** ID of the agent executing work */
  agentId?: string;

  /** ID of the task being performed */
  taskId?: string;

  /** ID of the run (multi-step workflow) */
  runId?: string;

  /** ID of the terminal involved */
  terminalId?: string;

  /** GitHub issue number if applicable */
  issueNumber?: number;

  /** GitHub PR number if applicable */
  prNumber?: number;
}

// ============================================================================
// Run State and Metadata
// ============================================================================

/**
 * State of a run (multi-agent workflow).
 * - 'queued': Run is scheduled but not started
 * - 'running': Run is actively executing
 * - 'paused': Run is paused (waiting for input)
 * - 'completed': Run finished successfully
 * - 'failed': Run encountered unrecoverable error
 * - 'cancelled': Run was cancelled by user
 */
export type RunState = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";

/**
 * Metadata about a run (multi-step workflow).
 * A "run" groups related agent/terminal operations into a cohesive workflow.
 *
 * @example
 * // Example run for "work on issue #42"
 * const run: RunMetadata = {
 *   runId: 'run-123',
 *   name: 'Work on Issue #42',
 *   context: { worktreeId: 'wt-1', issueNumber: 42 },
 *   startedAt: Date.now(),
 *   state: 'running',
 *   progress: 0.5,
 * };
 */
export interface RunMetadata {
  /** Unique identifier for this run */
  runId: string;

  /** Human-readable name for the run */
  name: string;

  /** Optional description of what the run does */
  description?: string;

  /** Context for filtering and correlation */
  context: EventContext;

  /** Unix timestamp (ms) when the run started */
  startedAt: number;

  /** Unix timestamp (ms) when the run completed/failed/cancelled */
  completedAt?: number;

  /** Duration in milliseconds (computed when run ends) */
  duration?: number;

  /** Current state of the run */
  state: RunState;

  /** Error message if state is 'failed' */
  error?: string;

  /** Progress percentage (0-1), if available */
  progress?: number;
}

// ============================================================================
// Run Event Payloads
// ============================================================================

/**
 * Payload for run:started event.
 * Emitted when a new run (multi-step workflow) begins.
 */
export interface RunStartedPayload extends EventContext {
  /** Unique identifier for this run */
  runId: string;
  /** Human-readable name for the run */
  name: string;
  /** Optional description */
  description?: string;
  /** Unix timestamp (ms) when the run started */
  timestamp: number;
}

/**
 * Payload for run:progress event.
 * Emitted to report run progress updates.
 */
export interface RunProgressPayload extends EventContext {
  /** Run identifier */
  runId: string;
  /** Progress percentage (0-1) */
  progress: number;
  /** Optional progress message */
  message?: string;
  /** Unix timestamp (ms) */
  timestamp: number;
}

/**
 * Payload for run:completed event.
 * Emitted when a run finishes successfully.
 */
export interface RunCompletedPayload extends EventContext {
  /** Run identifier */
  runId: string;
  /** Duration in milliseconds */
  duration: number;
  /** Unix timestamp (ms) when completed */
  timestamp: number;
}

/**
 * Payload for run:failed event.
 * Emitted when a run encounters an unrecoverable error.
 */
export interface RunFailedPayload extends EventContext {
  /** Run identifier */
  runId: string;
  /** Error message describing the failure */
  error: string;
  /** Duration in milliseconds until failure */
  duration: number;
  /** Unix timestamp (ms) when failed */
  timestamp: number;
}

/**
 * Payload for run:cancelled event.
 * Emitted when a run is cancelled by user action.
 */
export interface RunCancelledPayload extends EventContext {
  /** Run identifier */
  runId: string;
  /** Optional reason for cancellation */
  reason?: string;
  /** Duration in milliseconds until cancellation */
  duration: number;
  /** Unix timestamp (ms) when cancelled */
  timestamp: number;
}

/**
 * Payload for run:paused event.
 * Emitted when a run is paused (waiting for input).
 */
export interface RunPausedPayload extends EventContext {
  /** Run identifier */
  runId: string;
  /** Optional reason for pausing */
  reason?: string;
  /** Unix timestamp (ms) when paused */
  timestamp: number;
}

/**
 * Payload for run:resumed event.
 * Emitted when a paused run is resumed.
 */
export interface RunResumedPayload extends EventContext {
  /** Run identifier */
  runId: string;
  /** Unix timestamp (ms) when resumed */
  timestamp: number;
}
