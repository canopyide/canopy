/**
 * useSessionHistory Hook
 *
 * Provides session history state management via IPC for the React UI.
 * Connects to the TranscriptManager in the main process, handling:
 * - Fetching all sessions with optional filters
 * - Individual session retrieval
 * - Session export and deletion
 * - Filtering by agent type, worktree, and status
 */

import { useState, useEffect, useCallback } from "react";
import type { AgentSession, HistoryGetSessionsPayload } from "@shared/types";
import { historyClient } from "@/clients";

export interface SessionFilters {
  agentType?: "claude" | "gemini" | "custom" | "all";
  worktreeId?: string;
  status?: "completed" | "failed" | "all";
  searchQuery?: string;
}

export interface UseSessionHistoryReturn {
  /** Array of sessions, sorted by start time (newest first) */
  sessions: AgentSession[];
  /** Whether initial load or refresh is in progress */
  isLoading: boolean;
  /** Error message if load failed */
  error: string | null;
  /** Current filter settings */
  filters: SessionFilters;
  /** Update filters */
  setFilters: (filters: Partial<SessionFilters>) => void;
  /** Trigger a manual refresh of sessions */
  refresh: () => Promise<void>;
  /** Get a single session by ID (fetches full transcript) */
  getSession: (sessionId: string) => Promise<AgentSession | null>;
  /** Export a session to the specified format */
  exportSession: (sessionId: string, format: "json" | "markdown") => Promise<string | null>;
  /** Delete a session */
  deleteSession: (sessionId: string) => Promise<void>;
  /** Currently selected session (for detail view) */
  selectedSession: AgentSession | null;
  /** Set the selected session */
  setSelectedSession: (session: AgentSession | null) => void;
  /** Whether a session detail is loading */
  isLoadingSession: boolean;
}

/**
 * Hook for managing session history in the renderer process
 *
 * @example
 * ```tsx
 * function HistoryPanel() {
 *   const {
 *     sessions,
 *     isLoading,
 *     filters,
 *     setFilters,
 *     selectedSession,
 *     setSelectedSession,
 *     deleteSession,
 *   } = useSessionHistory();
 *
 *   if (isLoading) return <LoadingSpinner />;
 *
 *   return (
 *     <div>
 *       <SessionFilters filters={filters} onChange={setFilters} />
 *       <SessionList
 *         sessions={sessions}
 *         onSelect={setSelectedSession}
 *         onDelete={deleteSession}
 *       />
 *       {selectedSession && <SessionViewer session={selectedSession} />}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSessionHistory(): UseSessionHistoryReturn {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<SessionFilters>({
    agentType: "all",
    status: "all",
  });
  const [selectedSession, setSelectedSession] = useState<AgentSession | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);

  // Build IPC payload from filters
  const buildPayload = useCallback((f: SessionFilters): HistoryGetSessionsPayload | undefined => {
    const payload: HistoryGetSessionsPayload = {};

    if (f.agentType && f.agentType !== "all") {
      payload.agentType = f.agentType;
    }

    if (f.worktreeId) {
      payload.worktreeId = f.worktreeId;
    }

    return Object.keys(payload).length > 0 ? payload : undefined;
  }, []);

  // Fetch sessions with current filters
  const fetchSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const payload = buildPayload(filters);
      const fetchedSessions = await historyClient.getSessions(payload);

      // Sort by start time (newest first) - server may not guarantee order
      const sorted = [...fetchedSessions].sort((a, b) => b.startTime - a.startTime);

      // Apply client-side filters that aren't supported by the IPC API
      let filtered = sorted;

      // Filter by status (client-side since API doesn't support it)
      if (filters.status && filters.status !== "all") {
        filtered = filtered.filter((s) => s.state === filters.status);
      }

      // Filter by search query (client-side)
      if (filters.searchQuery && filters.searchQuery.trim()) {
        const query = filters.searchQuery.toLowerCase();
        filtered = filtered.filter((s) => {
          // Search in metadata (avoid scanning all transcript content)
          const typeMatch = s.agentType.toLowerCase().includes(query);
          const worktreeMatch = s.worktreeId?.toLowerCase().includes(query) ?? false;

          // Only search transcript if metadata doesn't match (limit to last 10 entries)
          if (!typeMatch && !worktreeMatch) {
            const recentTranscript = s.transcript.slice(-10);
            const transcriptMatch = recentTranscript.some((t) =>
              (t.content || "").toLowerCase().includes(query)
            );
            return transcriptMatch;
          }

          return typeMatch || worktreeMatch;
        });
      }

      setSessions(filtered);

      // Clear selection if filtered out
      setSelectedSession((current) => {
        if (current && !filtered.find((s) => s.id === current.id)) {
          return null;
        }
        return current;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setIsLoading(false);
    }
  }, [filters, buildPayload]);

  // Initial load and refetch only when server-side filters change
  useEffect(() => {
    fetchSessions();
  }, [filters.agentType, filters.worktreeId, filters.status]);

  // Apply client-side filters without refetching
  useEffect(() => {
    if (sessions.length === 0) return;

    let filtered = sessions;

    // Re-apply search filter
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase();
      filtered = sessions.filter((s) => {
        const typeMatch = s.agentType.toLowerCase().includes(query);
        const worktreeMatch = s.worktreeId?.toLowerCase().includes(query) ?? false;

        if (!typeMatch && !worktreeMatch) {
          const recentTranscript = s.transcript.slice(-10);
          const transcriptMatch = recentTranscript.some((t) =>
            (t.content || "").toLowerCase().includes(query)
          );
          return transcriptMatch;
        }

        return typeMatch || worktreeMatch;
      });
    }

    // Update displayed sessions without re-sorting (already sorted)
    // Only update if filter actually changed the results
    const currentIds = sessions.map((s) => s.id).join(",");
    const filteredIds = filtered.map((s) => s.id).join(",");
    if (currentIds !== filteredIds) {
      setSessions(filtered);

      // Clear selection if filtered out
      setSelectedSession((current) => {
        if (current && !filtered.find((s) => s.id === current.id)) {
          return null;
        }
        return current;
      });
    }
  }, [filters.searchQuery]); // Only re-filter on search change

  // Update filters
  const setFilters = useCallback((newFilters: Partial<SessionFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...newFilters }));
  }, []);

  // Manual refresh
  const refresh = useCallback(async () => {
    await fetchSessions();
  }, [fetchSessions]);

  // Get single session (full transcript)
  const getSession = useCallback(async (sessionId: string): Promise<AgentSession | null> => {
    try {
      setIsLoadingSession(true);
      const session = await historyClient.getSession(sessionId);
      return session;
    } catch (e) {
      console.error("Failed to get session:", e);
      return null;
    } finally {
      setIsLoadingSession(false);
    }
  }, []);

  // Export session
  const exportSession = useCallback(
    async (sessionId: string, format: "json" | "markdown"): Promise<string | null> => {
      try {
        const content = await historyClient.exportSession(sessionId, format);
        return content;
      } catch (e) {
        console.error("Failed to export session:", e);
        return null;
      }
    },
    []
  );

  // Delete session
  const deleteSession = useCallback(
    async (sessionId: string): Promise<void> => {
      try {
        await historyClient.deleteSession(sessionId);
        // Remove from local state
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        // Clear selection if deleted session was selected
        if (selectedSession?.id === sessionId) {
          setSelectedSession(null);
        }
      } catch (e) {
        console.error("Failed to delete session:", e);
        throw e;
      }
    },
    [selectedSession]
  );

  return {
    sessions,
    isLoading,
    error,
    filters,
    setFilters,
    refresh,
    getSession,
    exportSession,
    deleteSession,
    selectedSession,
    setSelectedSession,
    isLoadingSession,
  };
}

/**
 * Hook for getting a single session by ID
 *
 * Useful when you need to display a specific session, such as in a detail view.
 *
 * @param sessionId - The ID of the session to fetch
 * @returns The session, or null if not found or still loading
 */
export function useSession(sessionId: string | null): {
  session: AgentSession | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    if (!sessionId) {
      setSession(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const fetchedSession = await historyClient.getSession(sessionId);
      setSession(fetchedSession);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load session");
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const refresh = useCallback(async () => {
    await fetchSession();
  }, [fetchSession]);

  return { session, isLoading, error, refresh };
}
