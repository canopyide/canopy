/**
 * History IPC Client
 *
 * Provides a typed interface for agent session history IPC operations.
 * Wraps window.electron.history.* calls for testability and maintainability.
 */

import type { AgentSession, HistoryGetSessionsPayload } from "@shared/types";

/**
 * Client for history IPC operations.
 *
 * @example
 * ```typescript
 * import { historyClient } from "@/clients/historyClient";
 *
 * const sessions = await historyClient.getSessions({ worktreeId: "abc" });
 * const session = await historyClient.getSession("session-123");
 * ```
 */
export const historyClient = {
  /** Get agent sessions with optional filters */
  getSessions: (filters?: HistoryGetSessionsPayload): Promise<AgentSession[]> => {
    return window.electron.history.getSessions(filters);
  },

  /** Get a single session by ID */
  getSession: (sessionId: string): Promise<AgentSession | null> => {
    return window.electron.history.getSession(sessionId);
  },

  /** Export a session to a file */
  exportSession: (sessionId: string, format: "json" | "markdown"): Promise<string | null> => {
    return window.electron.history.exportSession(sessionId, format);
  },

  /** Delete a session */
  deleteSession: (sessionId: string): Promise<void> => {
    return window.electron.history.deleteSession(sessionId);
  },
} as const;
