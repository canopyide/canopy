/**
 * Event system types for Canopy Command Center
 *
 * These types support multi-agent orchestration and event correlation
 * across the application.
 */

// ============================================================================
// EventContext - Common context embedded in all domain events
// ============================================================================

/**
 * Common context embedded in all domain events.
 * Enables filtering and correlation across the event stream.
 *
 * @example
 * // Filtering events by worktree
 * eventBuffer.getFiltered({ worktreeId: 'wt-123' });
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

  /** ID of the terminal involved */
  terminalId?: string;

  /** GitHub issue number if applicable */
  issueNumber?: number;

  /** GitHub PR number if applicable */
  prNumber?: number;
}
