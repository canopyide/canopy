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
  sessions: AgentSession[];
  isLoading: boolean;
  error: string | null;
  filters: SessionFilters;
  setFilters: (filters: Partial<SessionFilters>) => void;
  refresh: () => Promise<void>;
  getSession: (sessionId: string) => Promise<AgentSession | null>;
  exportSession: (sessionId: string, format: "json" | "markdown") => Promise<string | null>;
  deleteSession: (sessionId: string) => Promise<void>;
  selectedSession: AgentSession | null;
  setSelectedSession: (session: AgentSession | null) => void;
  isLoadingSession: boolean;
}

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

  const fetchSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const payload = buildPayload(filters);
      const fetchedSessions = await historyClient.getSessions(payload);

      const sorted = [...fetchedSessions].sort((a, b) => b.startTime - a.startTime);

      let filtered = sorted;

      if (filters.status && filters.status !== "all") {
        filtered = filtered.filter((s) => s.state === filters.status);
      }

      if (filters.searchQuery && filters.searchQuery.trim()) {
        const query = filters.searchQuery.toLowerCase();
        filtered = filtered.filter((s) => {
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

      setSessions(filtered);

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

  useEffect(() => {
    fetchSessions();
  }, [filters.agentType, filters.worktreeId, filters.status]);

  useEffect(() => {
    if (sessions.length === 0) return;

    let filtered = sessions;

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

    const currentIds = sessions.map((s) => s.id).join(",");
    const filteredIds = filtered.map((s) => s.id).join(",");
    if (currentIds !== filteredIds) {
      setSessions(filtered);

      setSelectedSession((current) => {
        if (current && !filtered.find((s) => s.id === current.id)) {
          return null;
        }
        return current;
      });
    }
  }, [filters.searchQuery]);

  const setFilters = useCallback((newFilters: Partial<SessionFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const refresh = useCallback(async () => {
    await fetchSessions();
  }, [fetchSessions]);

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

  const deleteSession = useCallback(
    async (sessionId: string): Promise<void> => {
      try {
        await historyClient.deleteSession(sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
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
