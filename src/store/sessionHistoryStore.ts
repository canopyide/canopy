import { create, type StateCreator } from "zustand";
import Fuse from "fuse.js";
import type { AgentSession } from "@shared/types";

export interface SessionFilters {
  searchQuery: string;
  agentType?: AgentSession["agentType"];
  worktreeId?: string;
}

interface SessionHistoryState {
  sessions: AgentSession[];
  filteredSessions: AgentSession[];
  selectedSessionId: string | null;
  filters: SessionFilters;
  isLoading: boolean;
  error: string | null;

  loadSessions: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  setFilters: (filters: Partial<SessionFilters>) => void;
  clearFilters: () => void;
  selectSession: (id: string | null) => void;
  deleteSession: (id: string) => Promise<void>;
  exportSession: (id: string) => Promise<string | null>;
  reset: () => void;
}

const DEFAULT_FILTERS: SessionFilters = {
  searchQuery: "",
};

const stripAnsi = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, ""); // eslint-disable-line no-control-regex

const applyFilters = (sessions: AgentSession[], filters: SessionFilters): AgentSession[] => {
  let filtered = [...sessions];

  if (filters.agentType) {
    filtered = filtered.filter((s) => s.agentType === filters.agentType);
  }

  if (filters.worktreeId) {
    filtered = filtered.filter((s) => s.worktreeId === filters.worktreeId);
  }

  if (filters.searchQuery.trim()) {
    const sessionsWithCleanedContent = filtered.map((s) => ({
      ...s,
      transcript: s.transcript.map((t) => ({ ...t, content: stripAnsi(t.content) })),
      artifacts: s.artifacts.map((a) => ({ ...a, content: stripAnsi(a.content) })),
    }));

    const fuse = new Fuse(sessionsWithCleanedContent, {
      keys: [
        { name: "transcript.content", weight: 0.5 },
        { name: "artifacts.content", weight: 0.3 },
        { name: "agentType", weight: 0.1 },
        { name: "metadata.cwd", weight: 0.1 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: true,
    });

    const results = fuse.search(filters.searchQuery);
    return results.map((r) => filtered[sessionsWithCleanedContent.indexOf(r.item)]);
  }

  return filtered.sort((a, b) => b.startTime - a.startTime);
};

const createSessionHistoryStore: StateCreator<SessionHistoryState> = (set, get) => ({
  sessions: [],
  filteredSessions: [],
  selectedSessionId: null,
  filters: DEFAULT_FILTERS,
  isLoading: false,
  error: null,

  loadSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const sessions = await window.electron.history.getAll();
      const filters = get().filters;
      set({
        sessions,
        filteredSessions: applyFilters(sessions, filters),
        isLoading: false,
        error: null,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load sessions";
      console.error("[SessionHistoryStore] Failed to load sessions:", err);
      set({ isLoading: false, error: errorMessage });
    }
  },

  setSearchQuery: (query) => {
    const { sessions, filters, selectedSessionId } = get();
    const newFilters = { ...filters, searchQuery: query };
    const filteredSessions = applyFilters(sessions, newFilters);
    const isSelectedVisible = filteredSessions.some((s) => s.id === selectedSessionId);
    set({
      filters: newFilters,
      filteredSessions,
      selectedSessionId: isSelectedVisible ? selectedSessionId : null,
    });
  },

  setFilters: (newFilters) => {
    const { sessions, filters, selectedSessionId } = get();
    const merged = { ...filters, ...newFilters };
    const filteredSessions = applyFilters(sessions, merged);
    const isSelectedVisible = filteredSessions.some((s) => s.id === selectedSessionId);
    set({
      filters: merged,
      filteredSessions,
      selectedSessionId: isSelectedVisible ? selectedSessionId : null,
    });
  },

  clearFilters: () => {
    const { sessions } = get();
    set({
      filters: DEFAULT_FILTERS,
      filteredSessions: applyFilters(sessions, DEFAULT_FILTERS),
    });
  },

  selectSession: (id) => set({ selectedSessionId: id }),

  deleteSession: async (id) => {
    try {
      await window.electron.history.deleteSession(id);
      const { sessions, filters, selectedSessionId } = get();
      const updated = sessions.filter((s) => s.id !== id);
      set({
        sessions: updated,
        filteredSessions: applyFilters(updated, filters),
        selectedSessionId: selectedSessionId === id ? null : selectedSessionId,
      });
    } catch (err) {
      console.error("[SessionHistoryStore] Failed to delete session:", err);
    }
  },

  exportSession: async (id) => {
    try {
      return await window.electron.history.exportSession(id);
    } catch (err) {
      console.error("[SessionHistoryStore] Failed to export session:", err);
      return null;
    }
  },

  reset: () =>
    set({
      sessions: [],
      filteredSessions: [],
      selectedSessionId: null,
      filters: DEFAULT_FILTERS,
      isLoading: false,
      error: null,
    }),
});

export const useSessionHistoryStore = create<SessionHistoryState>(createSessionHistoryStore);
