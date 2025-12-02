import type { DevServerState } from "@shared/types";

export const devServerClient = {
  start: (worktreeId: string, worktreePath: string, command?: string): Promise<DevServerState> => {
    return window.electron.devServer.start(worktreeId, worktreePath, command);
  },

  stop: (worktreeId: string): Promise<DevServerState> => {
    return window.electron.devServer.stop(worktreeId);
  },

  toggle: (worktreeId: string, worktreePath: string, command?: string): Promise<DevServerState> => {
    return window.electron.devServer.toggle(worktreeId, worktreePath, command);
  },

  getState: (worktreeId: string): Promise<DevServerState> => {
    return window.electron.devServer.getState(worktreeId);
  },

  getLogs: (worktreeId: string): Promise<string[]> => {
    return window.electron.devServer.getLogs(worktreeId);
  },

  hasDevScript: (worktreePath: string): Promise<boolean> => {
    return window.electron.devServer.hasDevScript(worktreePath);
  },

  onUpdate: (callback: (state: DevServerState) => void): (() => void) => {
    return window.electron.devServer.onUpdate(callback);
  },

  onError: (callback: (data: { worktreeId: string; error: string }) => void): (() => void) => {
    return window.electron.devServer.onError(callback);
  },
} as const;
