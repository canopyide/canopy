/**
 * PtyManager Service
 *
 * Manages node-pty terminal instances for the integrated terminals.
 * Handles spawning, input/output, resize, and cleanup of PTY processes.
 */

import * as pty from "node-pty";
import { EventEmitter } from "events";
import { existsSync } from "fs";
import { events } from "./events.js";
import { nextAgentState, getStateChangeTimestamp, type AgentEvent } from "./AgentStateMachine.js";
import type { AgentState } from "../types/index.js";

export interface PtySpawnOptions {
  cwd: string;
  shell?: string; // Default: user's default shell
  args?: string[]; // Shell arguments (e.g., ['-l'] for login shell)
  env?: Record<string, string>;
  cols: number;
  rows: number;
  type?: "shell" | "claude" | "gemini" | "custom";
  title?: string;
  worktreeId?: string;
}

interface TerminalInfo {
  id: string;
  ptyProcess: pty.IPty;
  cwd: string;
  shell: string;
  type?: "shell" | "claude" | "gemini" | "custom";
  title?: string;
  worktreeId?: string;
  /** For agent terminals, the agent ID (same as terminal ID for now) */
  agentId?: string;
  /** Timestamp when the terminal was spawned (for duration calculations) */
  spawnedAt: number;
  /** Flag indicating this terminal was explicitly killed (not a natural exit) */
  wasKilled?: boolean;
  /** Current agent state (for agent terminals only) */
  agentState?: AgentState;
  /** Timestamp when agentState last changed */
  lastStateChange?: number;
  /** Error message if agentState is 'failed' */
  error?: string;
}

export interface PtyManagerEvents {
  data: (id: string, data: string) => void;
  exit: (id: string, exitCode: number) => void;
  error: (id: string, error: string) => void;
}

export class PtyManager extends EventEmitter {
  private terminals: Map<string, TerminalInfo> = new Map();

  constructor() {
    super();
  }

  /**
   * Update agent state for a terminal and emit state-changed event
   * @param id - Terminal identifier
   * @param event - Agent event that triggers the state transition
   * @private
   */
  private updateAgentState(id: string, event: AgentEvent): void {
    const terminal = this.terminals.get(id);
    if (!terminal || !terminal.agentId) {
      return;
    }

    const previousState = terminal.agentState || "idle";
    const newState = nextAgentState(previousState, event);

    // Update error message even if staying in failed state (for better error details)
    if (event.type === "error") {
      terminal.error = event.error;
    }

    // Only update if state actually changed
    if (newState !== previousState) {
      terminal.agentState = newState;
      terminal.lastStateChange = getStateChangeTimestamp();

      // Emit agent:state-changed event
      events.emit("agent:state-changed", {
        agentId: terminal.agentId,
        state: newState,
        previousState,
        timestamp: terminal.lastStateChange,
      });

      // Emit specific completion/failure events
      if (newState === "failed" && event.type === "error") {
        events.emit("agent:failed", {
          agentId: terminal.agentId,
          error: event.error,
          timestamp: terminal.lastStateChange,
        });
      }
    }
  }

  /**
   * Spawn a new PTY process
   * @param id - Unique identifier for this terminal
   * @param options - Spawn options including cwd, shell, cols, rows
   * @throws Error if PTY spawn fails
   */
  spawn(id: string, options: PtySpawnOptions): void {
    // Check if terminal with this ID already exists
    if (this.terminals.has(id)) {
      console.warn(`Terminal with id ${id} already exists, killing existing instance`);
      this.kill(id);
    }

    const shell = options.shell || this.getDefaultShell();
    const args = options.args || this.getDefaultShellArgs(shell);

    const spawnedAt = Date.now();
    const isAgentTerminal = options.type === "claude" || options.type === "gemini";
    // For agent terminals, use terminal ID as agent ID
    const agentId = isAgentTerminal ? id : undefined;

    let ptyProcess: pty.IPty;

    try {
      ptyProcess = pty.spawn(shell, args, {
        name: "xterm-256color",
        cols: options.cols,
        rows: options.rows,
        cwd: options.cwd,
        env: { ...process.env, ...options.env } as Record<string, string>,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to spawn terminal ${id}:`, errorMessage);
      this.emit("error", id, errorMessage);
      throw new Error(`Failed to spawn terminal: ${errorMessage}`);
    }

    // Forward PTY data events
    ptyProcess.onData((data) => {
      // Verify this is still the active terminal (prevent race with respawn)
      const terminal = this.terminals.get(id);
      if (!terminal || terminal.ptyProcess !== ptyProcess) {
        // This is a stale data event from a previous terminal with same ID
        return;
      }

      this.emit("data", id, data);

      // For agent terminals, track state based on output
      if (isAgentTerminal) {
        // Check for prompt detection and update state accordingly
        this.updateAgentState(id, { type: "output", data });
      }
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode }) => {
      // Verify this is still the active terminal (prevent race with respawn)
      const terminal = this.terminals.get(id);
      if (!terminal || terminal.ptyProcess !== ptyProcess) {
        // This is a stale exit event from a previous terminal with same ID
        return;
      }

      this.emit("exit", id, exitCode ?? 0);

      // Update agent state on exit
      if (isAgentTerminal && !terminal.wasKilled) {
        this.updateAgentState(id, { type: "exit", code: exitCode ?? 0 });
      }

      // Emit agent:completed event for agent terminals (but not if explicitly killed)
      if (isAgentTerminal && agentId && !terminal.wasKilled) {
        const completedAt = Date.now();
        const duration = completedAt - spawnedAt;
        events.emit("agent:completed", {
          agentId,
          exitCode: exitCode ?? 0,
          duration,
          timestamp: completedAt,
        });
      }

      this.terminals.delete(id);
    });

    this.terminals.set(id, {
      id,
      ptyProcess,
      cwd: options.cwd,
      shell,
      type: options.type,
      title: options.title,
      worktreeId: options.worktreeId,
      agentId,
      spawnedAt,
      agentState: isAgentTerminal ? "idle" : undefined,
      lastStateChange: isAgentTerminal ? spawnedAt : undefined,
    });

    // Emit agent:spawned event for agent terminals (Claude, Gemini)
    if (isAgentTerminal && agentId && options.type) {
      events.emit("agent:spawned", {
        agentId,
        terminalId: id,
        type: options.type,
        worktreeId: options.worktreeId,
        timestamp: spawnedAt,
      });

      // Transition to working state on start
      this.updateAgentState(id, { type: "start" });
    }
  }

  /**
   * Write data to terminal stdin
   * @param id - Terminal identifier
   * @param data - Data to write
   */
  write(id: string, data: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.ptyProcess.write(data);

      // For agent terminals in waiting state, track input event
      if (terminal.agentId && terminal.agentState === "waiting") {
        this.updateAgentState(id, { type: "input" });
      }
    } else {
      console.warn(`Terminal ${id} not found, cannot write data`);
    }
  }

  /**
   * Resize terminal
   * @param id - Terminal identifier
   * @param cols - New column count
   * @param rows - New row count
   */
  resize(id: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.ptyProcess.resize(cols, rows);
    } else {
      console.warn(`Terminal ${id} not found, cannot resize`);
    }
  }

  /**
   * Kill a terminal process
   * @param id - Terminal identifier
   * @param reason - Optional reason for killing (for agent events)
   */
  kill(id: string, reason?: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      // Mark as killed to prevent agent:completed emission
      terminal.wasKilled = true;

      // Update agent state for all killed agent terminals
      if (terminal.agentId) {
        // If killed with a reason, mark as failed with error
        // Otherwise, mark as failed with generic kill message
        this.updateAgentState(id, {
          type: "error",
          error: reason || "Agent killed by user",
        });
      }

      // Emit agent:killed event for agent terminals before killing
      if (terminal.agentId) {
        events.emit("agent:killed", {
          agentId: terminal.agentId,
          reason,
          timestamp: Date.now(),
        });
      }
      terminal.ptyProcess.kill();
      // Don't delete here - let the exit handler do it to avoid race conditions
    }
  }

  /**
   * Get information about a terminal
   * @param id - Terminal identifier
   * @returns Terminal info or undefined if not found
   */
  getTerminal(id: string): TerminalInfo | undefined {
    return this.terminals.get(id);
  }

  /**
   * Get all active terminal IDs
   * @returns Array of terminal IDs
   */
  getActiveTerminalIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  /**
   * Get all active terminals
   * @returns Array of terminal info objects
   */
  getAll(): TerminalInfo[] {
    return Array.from(this.terminals.values());
  }

  /**
   * Check if a terminal exists
   * @param id - Terminal identifier
   * @returns True if terminal exists
   */
  hasTerminal(id: string): boolean {
    return this.terminals.has(id);
  }

  /**
   * Clean up all terminals (called on app quit)
   */
  dispose(): void {
    for (const [id, terminal] of this.terminals) {
      try {
        // Emit agent:killed event for agent terminals during shutdown
        if (terminal.agentId) {
          events.emit("agent:killed", {
            agentId: terminal.agentId,
            reason: "cleanup",
            timestamp: Date.now(),
          });
        }
        terminal.ptyProcess.kill();
      } catch (error) {
        // Ignore errors during cleanup - process may already be dead
        console.warn(`Error killing terminal ${id}:`, error);
      }
    }
    this.terminals.clear();
    this.removeAllListeners();
  }

  /**
   * Get the default shell for the current platform
   * Tries multiple fallbacks to ensure a valid shell is found
   */
  private getDefaultShell(): string {
    if (process.platform === "win32") {
      // Prefer PowerShell, fall back to cmd.exe
      return process.env.COMSPEC || "powershell.exe";
    }

    // On macOS/Linux, try SHELL env var first
    if (process.env.SHELL) {
      return process.env.SHELL;
    }

    // Try common shells in order of preference
    const commonShells = ["/bin/zsh", "/bin/bash", "/bin/sh"];

    for (const shell of commonShells) {
      try {
        if (existsSync(shell)) {
          return shell;
        }
      } catch {
        // Continue to next shell if check fails
      }
    }

    // Last resort: /bin/sh should exist on all Unix-like systems
    return "/bin/sh";
  }

  /**
   * Get default arguments for the shell
   * @param shell - Shell path
   */
  private getDefaultShellArgs(shell: string): string[] {
    const shellName = shell.toLowerCase();

    // For login shells on Unix-like systems
    if (process.platform !== "win32") {
      if (shellName.includes("zsh") || shellName.includes("bash")) {
        // Use login shell to load user's profile
        return ["-l"];
      }
    }

    return [];
  }
}

// Export singleton instance
let ptyManagerInstance: PtyManager | null = null;

export function getPtyManager(): PtyManager {
  if (!ptyManagerInstance) {
    ptyManagerInstance = new PtyManager();
  }
  return ptyManagerInstance;
}

export function disposePtyManager(): void {
  if (ptyManagerInstance) {
    ptyManagerInstance.dispose();
    ptyManagerInstance = null;
  }
}
