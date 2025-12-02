import type { AgentSession, HistoryGetSessionsPayload } from "@shared/types";

export const historyClient = {
  getSessions: (filters?: HistoryGetSessionsPayload): Promise<AgentSession[]> => {
    return window.electron.history.getSessions(filters);
  },

  getSession: (sessionId: string): Promise<AgentSession | null> => {
    return window.electron.history.getSession(sessionId);
  },

  exportSession: (sessionId: string, format: "json" | "markdown"): Promise<string | null> => {
    return window.electron.history.exportSession(sessionId, format);
  },

  deleteSession: (sessionId: string): Promise<void> => {
    return window.electron.history.deleteSession(sessionId);
  },
} as const;
