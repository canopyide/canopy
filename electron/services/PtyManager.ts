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
import {
  nextAgentState,
  getStateChangeTimestamp,
  detectBusyState,
  detectPrompt,
  type AgentEvent,
} from "./AgentStateMachine.js";
import type { AgentState } from "../types/index.js";
import {
  AgentSpawnedSchema,
  AgentStateChangedSchema,
  AgentOutputSchema,
  AgentCompletedSchema,
  AgentFailedSchema,
  AgentKilledSchema,
} from "../schemas/agent.js";

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

/** Buffer size for sliding window (characters) - enough to capture busy patterns across split packets */
const OUTPUT_BUFFER_SIZE = 2000;

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
  /**
   * Sliding window buffer for pattern detection.
   * Keeps last ~2000 chars to handle split packets (busy strings split across chunks).
   */
  outputBuffer: string;
  /** Optional trace ID for tracking event chains (from context injection, etc.) */
  traceId?: string;

  // Timing metadata for silence detection and AI analysis throttling
  /** Timestamp of last user input (write() call) */
  lastInputTime: number;
  /** Timestamp of last PTY output (onData event) */
  lastOutputTime: number;
  /** Timestamp of last state check (AI/heuristic analysis) */
  lastCheckTime: number;

  /**
   * Semantic buffer for AI analysis.
   * Maintains last ~50 lines as array of strings for line-based context.
   * Separate from outputBuffer (char-based) to cleanly separate pattern detection from AI analysis.
   */
  semanticBuffer: string[];
}

export interface PtyManagerEvents {
  data: (id: string, data: string) => void;
  exit: (id: string, exitCode: number) => void;
  error: (id: string, error: string) => void;
}

/**
 * Snapshot of terminal state for external analysis (AI, heuristics).
 * Allows services like AgentObserver to access terminal data without
 * direct coupling to PtyManager internals.
 */
export interface TerminalSnapshot {
  /** Terminal identifier */
  id: string;
  /** Last ~50 lines of output for AI analysis */
  lines: string[];
  /** Timestamp of last user input (write() call) */
  lastInputTime: number;
  /** Timestamp of last PTY output (onData event) */
  lastOutputTime: number;
  /** Timestamp of last state check (AI/heuristic analysis) */
  lastCheckTime: number;
  /** Terminal type */
  type?: "shell" | "claude" | "gemini" | "custom";
  /** Associated worktree ID */
  worktreeId?: string;
  /** Agent ID (for agent terminals) */
  agentId?: string;
  /** Current agent state */
  agentState?: AgentState;
  /** Timestamp when agentState last changed (for AI analysis/throttling) */
  lastStateChange?: number;
  /** Error message if agentState is 'failed' (for AI context) */
  error?: string;
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

      // Build and validate state change payload
      const stateChangePayload = {
        agentId: terminal.agentId,
        state: newState,
        previousState,
        timestamp: terminal.lastStateChange,
        traceId: terminal.traceId,
      };

      const validatedStateChange = AgentStateChangedSchema.safeParse(stateChangePayload);
      if (validatedStateChange.success) {
        events.emit("agent:state-changed", validatedStateChange.data);
      } else {
        console.error(
          "[PtyManager] Invalid agent:state-changed payload:",
          validatedStateChange.error.format()
        );
      }

      // Emit specific completion/failure events
      if (newState === "failed" && event.type === "error") {
        const failedPayload = {
          agentId: terminal.agentId,
          error: event.error,
          timestamp: terminal.lastStateChange,
          traceId: terminal.traceId,
        };

        const validatedFailed = AgentFailedSchema.safeParse(failedPayload);
        if (validatedFailed.success) {
          events.emit("agent:failed", validatedFailed.data);
        } else {
          console.error(
            "[PtyManager] Invalid agent:failed payload:",
            validatedFailed.error.format()
          );
        }
      }
    }
  }

  /** Maximum number of lines in the semantic buffer */
  private static readonly SEMANTIC_BUFFER_MAX_LINES = 50;
  /** Maximum length for a single line in the semantic buffer (to prevent memory bloat) */
  private static readonly SEMANTIC_BUFFER_MAX_LINE_LENGTH = 1000;

  /**
   * Update the semantic buffer with new output data.
   * Maintains a sliding window of the last ~50 lines for AI analysis.
   * Handles CRLF normalization, carriage returns, empty lines, and line length limits.
   * @param terminal - Terminal info to update
   * @param chunk - Raw output chunk from PTY
   * @private
   */
  private updateSemanticBuffer(terminal: TerminalInfo, chunk: string): void {
    // Normalize CRLF to LF and handle carriage returns
    // Carriage returns (\r) rewrite the current line, so we treat them as newlines
    const normalized = chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Split chunk into lines, preserving partial lines
    const lines = normalized.split("\n");

    // If the buffer has content and the last line was incomplete,
    // append the first part of new data to it
    if (terminal.semanticBuffer.length > 0 && lines.length > 0 && !normalized.startsWith("\n")) {
      terminal.semanticBuffer[terminal.semanticBuffer.length - 1] += lines[0];
      lines.shift();
    }

    // Filter out empty strings from leading newlines and truncate long lines
    const processedLines = lines
      .filter((line) => line.length > 0 || terminal.semanticBuffer.length > 0) // Keep empty lines only if buffer has content
      .map((line) => {
        // Truncate very long lines to prevent memory bloat
        if (line.length > PtyManager.SEMANTIC_BUFFER_MAX_LINE_LENGTH) {
          return line.substring(0, PtyManager.SEMANTIC_BUFFER_MAX_LINE_LENGTH) + "... [truncated]";
        }
        return line;
      });

    // Add remaining lines to buffer
    terminal.semanticBuffer.push(...processedLines);

    // Trim to max lines
    if (terminal.semanticBuffer.length > PtyManager.SEMANTIC_BUFFER_MAX_LINES) {
      terminal.semanticBuffer = terminal.semanticBuffer.slice(
        -PtyManager.SEMANTIC_BUFFER_MAX_LINES
      );
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
    const isAgentTerminal =
      options.type === "claude" || options.type === "gemini" || options.type === "custom";
    // For agent terminals, use terminal ID as agent ID
    const agentId = isAgentTerminal ? id : undefined;

    let ptyProcess: pty.IPty;

    // Merge with process environment, filtering out undefined values
    const baseEnv = process.env as Record<string, string | undefined>;
    const mergedEnv = { ...baseEnv, ...options.env };
    // Filter out undefined values to prevent node-pty errors
    const env = Object.fromEntries(
      Object.entries(mergedEnv).filter(([_, value]) => value !== undefined)
    ) as Record<string, string>;

    try {
      ptyProcess = pty.spawn(shell, args, {
        name: "xterm-256color",
        cols: options.cols,
        rows: options.rows,
        cwd: options.cwd,
        env,
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

      // Track output timing for silence detection
      terminal.lastOutputTime = Date.now();

      this.emit("data", id, data);

      // For agent terminals, track state based on output
      if (isAgentTerminal) {
        // Update sliding window buffer to handle split packets
        terminal.outputBuffer += data;
        if (terminal.outputBuffer.length > OUTPUT_BUFFER_SIZE) {
          terminal.outputBuffer = terminal.outputBuffer.slice(-OUTPUT_BUFFER_SIZE);
        }

        // Update semantic buffer for AI analysis (line-based)
        this.updateSemanticBuffer(terminal, data);

        // Check for busy state patterns (e.g., "(esc to interrupt)")
        // Priority: busy > prompt > output (busy patterns override prompt detection)
        // Use only recent slice (last 200 chars) to avoid indefinite matching of stale busy tokens
        const recentSlice = terminal.outputBuffer.slice(-200);
        const isBusy = options.type && detectBusyState(recentSlice, options.type);

        if (isBusy) {
          // Busy pattern detected - signal busy state (prevents transition to 'waiting')
          this.updateAgentState(id, { type: "busy" });
        } else {
          // No busy pattern - check if recent output looks like a prompt (waiting for input)
          // Use the buffer (not just current chunk) to handle colored/split prompts
          const isPrompt = detectPrompt(recentSlice, { type: options.type });
          if (isPrompt) {
            this.updateAgentState(id, { type: "prompt" });
          } else {
            this.updateAgentState(id, { type: "output", data });
          }
        }

        // Emit agent:output event for transcript capture
        if (agentId) {
          const outputPayload = {
            agentId,
            data,
            timestamp: Date.now(),
            traceId: terminal.traceId,
          };

          const validatedOutput = AgentOutputSchema.safeParse(outputPayload);
          if (validatedOutput.success) {
            events.emit("agent:output", validatedOutput.data);
          } else {
            // Log validation failures for observability (throttled to avoid noise)
            if (Math.random() < 0.01) {
              // Log ~1% of failures to avoid overwhelming logs
              console.warn(
                `[PtyManager] Agent output validation failed (terminal ${id}):`,
                validatedOutput.error.format()
              );
            }
            // Do NOT emit invalid payloads - drop malformed output to protect consumers
          }
        }
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

      // Emit agent:completed event for agent terminals (but not if explicitly killed or already failed)
      // Only emit completed if the agent didn't fail (agentState !== "failed")
      if (isAgentTerminal && agentId && !terminal.wasKilled && terminal.agentState !== "failed") {
        const completedAt = Date.now();
        const duration = completedAt - spawnedAt;
        const completedPayload = {
          agentId,
          exitCode: exitCode ?? 0,
          duration,
          timestamp: completedAt,
          traceId: terminal.traceId,
        };

        const validatedCompleted = AgentCompletedSchema.safeParse(completedPayload);
        if (validatedCompleted.success) {
          events.emit("agent:completed", validatedCompleted.data);
        } else {
          console.error(
            "[PtyManager] Invalid agent:completed payload:",
            validatedCompleted.error.format()
          );
        }
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
      outputBuffer: "", // Initialize empty buffer for pattern detection
      // Initialize timing metadata - all start at spawn time
      lastInputTime: spawnedAt,
      lastOutputTime: spawnedAt,
      lastCheckTime: spawnedAt,
      // Initialize empty semantic buffer for AI analysis
      semanticBuffer: [],
    });

    // Emit agent:spawned event for agent terminals (Claude, Gemini)
    if (isAgentTerminal && agentId && options.type) {
      const spawnedPayload = {
        agentId,
        terminalId: id,
        type: options.type,
        worktreeId: options.worktreeId,
        timestamp: spawnedAt,
      };

      const validatedSpawned = AgentSpawnedSchema.safeParse(spawnedPayload);
      if (validatedSpawned.success) {
        events.emit("agent:spawned", validatedSpawned.data);
      } else {
        console.error(
          "[PtyManager] Invalid agent:spawned payload:",
          validatedSpawned.error.format()
        );
      }

      // Transition to working state on start
      this.updateAgentState(id, { type: "start" });
    }
  }

  /**
   * Write data to terminal stdin
   * @param id - Terminal identifier
   * @param data - Data to write
   * @param traceId - Optional trace ID for event correlation
   */
  write(id: string, data: string, traceId?: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      // Track input timing for silence detection
      terminal.lastInputTime = Date.now();

      // Store traceId if provided, or clear it if explicitly undefined
      // This ensures each traced operation gets a fresh ID and prevents cross-operation bleed
      if (traceId !== undefined) {
        terminal.traceId = traceId || undefined;
      }

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
    // Validate dimensions - check for finite positive integers
    if (
      !Number.isFinite(cols) ||
      !Number.isFinite(rows) ||
      cols <= 0 ||
      rows <= 0 ||
      cols !== Math.floor(cols) ||
      rows !== Math.floor(rows)
    ) {
      console.warn(`Invalid terminal dimensions for ${id}: ${cols}x${rows}`);
      return;
    }

    const terminal = this.terminals.get(id);
    if (terminal) {
      try {
        // Get current dimensions to check for no-op resize
        const currentCols = terminal.ptyProcess.cols;
        const currentRows = terminal.ptyProcess.rows;

        // Skip no-op resizes to avoid unnecessary PTY churn
        if (currentCols === cols && currentRows === rows) {
          return;
        }

        terminal.ptyProcess.resize(cols, rows);

        // Optional: Log resize events when verbose logging enabled
        if (process.env.CANOPY_VERBOSE) {
          console.log(
            `Resized terminal ${id} from ${currentCols}x${currentRows} to ${cols}x${rows}`
          );
        }
      } catch (error) {
        console.error(`Failed to resize terminal ${id}:`, error);
      }
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
        const killedPayload = {
          agentId: terminal.agentId,
          reason,
          timestamp: Date.now(),
          traceId: terminal.traceId,
        };

        const validatedKilled = AgentKilledSchema.safeParse(killedPayload);
        if (validatedKilled.success) {
          events.emit("agent:killed", validatedKilled.data);
        } else {
          console.error(
            "[PtyManager] Invalid agent:killed payload:",
            validatedKilled.error.format()
          );
        }
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
   * Get a snapshot of terminal state for external analysis (AI, heuristics).
   * This allows services like AgentObserver to access terminal data without
   * direct coupling to PtyManager internals.
   * @param id - Terminal identifier
   * @returns TerminalSnapshot or null if terminal not found
   */
  getTerminalSnapshot(id: string): TerminalSnapshot | null {
    const terminal = this.terminals.get(id);
    if (!terminal) return null;

    return {
      id: terminal.id,
      lines: [...terminal.semanticBuffer], // Return copy to prevent mutation
      lastInputTime: terminal.lastInputTime,
      lastOutputTime: terminal.lastOutputTime,
      lastCheckTime: terminal.lastCheckTime,
      type: terminal.type,
      worktreeId: terminal.worktreeId,
      agentId: terminal.agentId,
      agentState: terminal.agentState,
      lastStateChange: terminal.lastStateChange,
      error: terminal.error,
    };
  }

  /**
   * Get snapshots for all active terminals.
   * Useful for bulk analysis (e.g., TerminalObserver polling).
   * @returns Array of TerminalSnapshot for all active terminals
   */
  getAllTerminalSnapshots(): TerminalSnapshot[] {
    return Array.from(this.terminals.keys())
      .map((id) => this.getTerminalSnapshot(id))
      .filter((snapshot): snapshot is TerminalSnapshot => snapshot !== null);
  }

  /**
   * Mark a terminal's check time (for AI/heuristic analysis throttling).
   * External services call this after running state detection to prevent
   * redundant checks.
   * @param id - Terminal identifier
   */
  markChecked(id: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.lastCheckTime = Date.now();
    }
  }

  /**
   * Clean up all terminals (called on app quit)
   */
  dispose(): void {
    for (const [id, terminal] of this.terminals) {
      try {
        // Emit agent:killed event for agent terminals during shutdown
        if (terminal.agentId) {
          const killedPayload = {
            agentId: terminal.agentId,
            reason: "cleanup",
            timestamp: Date.now(),
            traceId: terminal.traceId,
          };

          const validatedKilled = AgentKilledSchema.safeParse(killedPayload);
          if (validatedKilled.success) {
            events.emit("agent:killed", validatedKilled.data);
          }
          // Skip error logging during cleanup to avoid noise
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
