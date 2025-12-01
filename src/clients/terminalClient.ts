/**
 * Terminal IPC Client
 *
 * Provides a typed interface for terminal-related IPC operations.
 * Wraps window.electron.terminal.* calls for testability and maintainability.
 */

import type {
  TerminalSpawnOptions,
  AgentStateChangePayload,
  TerminalActivityPayload,
} from "@shared/types";

/**
 * Client for terminal IPC operations.
 *
 * @example
 * ```typescript
 * import { terminalClient } from "@/clients/terminalClient";
 *
 * const id = await terminalClient.spawn({ cwd: "/path/to/dir", cols: 80, rows: 24 });
 * terminalClient.write(id, "ls -la\n");
 * ```
 */
export const terminalClient = {
  /** Spawn a new terminal process */
  spawn: (options: TerminalSpawnOptions): Promise<string> => {
    return window.electron.terminal.spawn(options);
  },

  /** Write data to a terminal */
  write: (id: string, data: string): void => {
    window.electron.terminal.write(id, data);
  },

  /** Resize a terminal */
  resize: (id: string, cols: number, rows: number): void => {
    window.electron.terminal.resize(id, cols, rows);
  },

  /** Kill a terminal process */
  kill: (id: string): Promise<void> => {
    return window.electron.terminal.kill(id);
  },

  /** Move terminal to trash (pending deletion with countdown) */
  trash: (id: string): Promise<void> => {
    return window.electron.terminal.trash(id);
  },

  /** Restore terminal from trash, cancelling countdown */
  restore: (id: string): Promise<boolean> => {
    return window.electron.terminal.restore(id);
  },

  /** Subscribe to terminal data for a specific terminal. Returns cleanup function. */
  onData: (id: string, callback: (data: string) => void): (() => void) => {
    return window.electron.terminal.onData(id, callback);
  },

  /** Subscribe to terminal exit events. Returns cleanup function. */
  onExit: (callback: (id: string, exitCode: number) => void): (() => void) => {
    return window.electron.terminal.onExit(callback);
  },

  /** Subscribe to agent state change events. Returns cleanup function. */
  onAgentStateChanged: (callback: (data: AgentStateChangePayload) => void): (() => void) => {
    return window.electron.terminal.onAgentStateChanged(callback);
  },

  /** Subscribe to terminal activity events. Returns cleanup function. */
  onActivity: (callback: (data: TerminalActivityPayload) => void): (() => void) => {
    return window.electron.terminal.onActivity(callback);
  },

  /** Subscribe to terminal trashed events. Returns cleanup function. */
  onTrashed: (callback: (data: { id: string; expiresAt: number }) => void): (() => void) => {
    return window.electron.terminal.onTrashed(callback);
  },

  /** Subscribe to terminal restored events. Returns cleanup function. */
  onRestored: (callback: (data: { id: string }) => void): (() => void) => {
    return window.electron.terminal.onRestored(callback);
  },

  /**
   * Set buffering mode for a terminal.
   * When enabled, PTY output is buffered in memory instead of emitting IPC events.
   * Used to reduce IPC overhead for hidden/docked terminals.
   */
  setBuffering: (id: string, enabled: boolean): Promise<void> => {
    return window.electron.terminal.setBuffering(id, enabled);
  },

  /**
   * Flush buffered output for a terminal.
   * Combines all buffered chunks and sends them immediately.
   */
  flush: (id: string): Promise<void> => {
    return window.electron.terminal.flush(id);
  },
} as const;
