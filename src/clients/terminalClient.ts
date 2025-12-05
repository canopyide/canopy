import type {
  TerminalSpawnOptions,
  AgentStateChangePayload,
  TerminalActivityPayload,
  BackendTerminalInfo,
  TerminalReconnectResult,
} from "@shared/types";

export const terminalClient = {
  spawn: (options: TerminalSpawnOptions): Promise<string> => {
    return window.electron.terminal.spawn(options);
  },

  write: (id: string, data: string): void => {
    window.electron.terminal.write(id, data);
  },

  resize: (id: string, cols: number, rows: number): void => {
    window.electron.terminal.resize(id, cols, rows);
  },

  kill: (id: string): Promise<void> => {
    return window.electron.terminal.kill(id);
  },

  trash: (id: string): Promise<void> => {
    return window.electron.terminal.trash(id);
  },

  restore: (id: string): Promise<boolean> => {
    return window.electron.terminal.restore(id);
  },

  onData: (id: string, callback: (data: string) => void): (() => void) => {
    return window.electron.terminal.onData(id, callback);
  },

  onExit: (callback: (id: string, exitCode: number) => void): (() => void) => {
    return window.electron.terminal.onExit(callback);
  },

  onAgentStateChanged: (callback: (data: AgentStateChangePayload) => void): (() => void) => {
    return window.electron.terminal.onAgentStateChanged(callback);
  },

  onActivity: (callback: (data: TerminalActivityPayload) => void): (() => void) => {
    return window.electron.terminal.onActivity(callback);
  },

  onTrashed: (callback: (data: { id: string; expiresAt: number }) => void): (() => void) => {
    return window.electron.terminal.onTrashed(callback);
  },

  onRestored: (callback: (data: { id: string }) => void): (() => void) => {
    return window.electron.terminal.onRestored(callback);
  },

  /**
   * Buffers PTY output in memory instead of emitting IPC events.
   * Reduces IPC overhead for hidden/docked terminals.
   */
  setBuffering: (id: string, enabled: boolean): Promise<void> => {
    return window.electron.terminal.setBuffering(id, enabled);
  },

  flush: (id: string): Promise<void> => {
    return window.electron.terminal.flush(id);
  },

  /**
   * Sets the activity tier for IPC batching.
   * FOCUSED: immediate flush (0ms), VISIBLE: 100ms, BACKGROUND: 1000ms
   */
  setActivityTier: (id: string, tier: "focused" | "visible" | "background"): void => {
    window.electron.terminal.setActivityTier(id, tier);
  },

  /**
   * Query backend for terminals belonging to a specific project.
   * Used during state hydration to reconcile UI with backend processes.
   */
  getForProject: (projectId: string): Promise<BackendTerminalInfo[]> => {
    return window.electron.terminal.getForProject(projectId);
  },

  /**
   * Reconnect to an existing terminal process in the backend.
   * Returns the terminal info if it exists, error otherwise.
   */
  reconnect: (terminalId: string): Promise<TerminalReconnectResult> => {
    return window.electron.terminal.reconnect(terminalId);
  },

  /**
   * Replay terminal history from backend semantic buffer.
   * Used after reconnecting to restore terminal output.
   */
  replayHistory: (terminalId: string, maxLines?: number): Promise<{ replayed: number }> => {
    return window.electron.terminal.replayHistory(terminalId, maxLines);
  },

  /**
   * Get serialized terminal state from headless xterm backend.
   * Returns full terminal state including colors, formatting, cursor position.
   * Used for fast restoration on app reload.
   */
  getSerializedState: (terminalId: string): Promise<string | null> => {
    return window.electron.terminal.getSerializedState(terminalId);
  },

  /**
   * Get SharedArrayBuffer for zero-copy terminal I/O.
   * Returns null if SharedArrayBuffer is unavailable (fallback to IPC).
   */
  getSharedBuffer: (): Promise<SharedArrayBuffer | null> => {
    return window.electron.terminal.getSharedBuffer();
  },
} as const;
