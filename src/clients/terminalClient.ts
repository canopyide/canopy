/**
 * Terminal IPC Client
 *
 * Provides a typed interface for terminal-related IPC operations.
 * Wraps window.electron.terminal.* calls for testability and maintainability.
 */

import type { TerminalSpawnOptions, AgentStateChangePayload } from "@shared/types";

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
} as const;
