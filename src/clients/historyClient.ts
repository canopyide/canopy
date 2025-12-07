import type { AgentSession } from "@shared/types";

export const historyClient = {
  getAll: (): Promise<AgentSession[]> => {
    return window.electron.history.getAll();
  },

  getSession: (id: string): Promise<AgentSession | null> => {
    return window.electron.history.getSession(id);
  },

  deleteSession: (id: string): Promise<void> => {
    return window.electron.history.deleteSession(id);
  },

  exportSession: (id: string): Promise<string | null> => {
    return window.electron.history.exportSession(id);
  },
} as const;
