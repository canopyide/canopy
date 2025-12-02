import * as pty from "node-pty";
import { EventEmitter } from "events";
import { existsSync } from "fs";
import { events } from "./events.js";
import { nextAgentState, getStateChangeTimestamp, type AgentEvent } from "./AgentStateMachine.js";
import type { AgentState } from "../types/index.js";
import {
  AgentSpawnedSchema,
  AgentStateChangedSchema,
  AgentOutputSchema,
  AgentCompletedSchema,
  AgentFailedSchema,
  AgentKilledSchema,
  type AgentStateChangeTrigger,
} from "../schemas/agent.js";
import { type PtyPool } from "./PtyPool.js";
import { ProcessDetector, hasChildProcesses, type DetectionResult } from "./ProcessDetector.js";
import type { TerminalType } from "../../shared/types/domain.js";
import { ActivityMonitor } from "./ActivityMonitor.js";

export interface PtySpawnOptions {
  cwd: string;
  shell?: string; // Default: user's default shell
  args?: string[]; // Shell arguments (e.g., ['-l'] for login shell)
  env?: Record<string, string>;
  cols: number;
  rows: number;
  type?: TerminalType;
  title?: string;
  worktreeId?: string;
}

const OUTPUT_BUFFER_SIZE = 2000;

const DEFAULT_MAX_QUEUE_SIZE = 100;

const DEFAULT_MAX_QUEUE_BYTES = 1024 * 1024;

interface TerminalInfo {
  id: string;
  ptyProcess: pty.IPty;
  cwd: string;
  shell: string;
  type?: TerminalType;
  title?: string;
  worktreeId?: string;
  agentId?: string;
  spawnedAt: number;
  wasKilled?: boolean;
  agentState?: AgentState;
  lastStateChange?: number;
  error?: string;
  outputBuffer: string;
  traceId?: string;

  lastInputTime: number;
  lastOutputTime: number;
  lastCheckTime: number;

  /** Maintains last ~50 lines as array for AI analysis, separate from char-based outputBuffer */
  semanticBuffer: string[];

  processDetector?: ProcessDetector;
  detectedAgentType?: TerminalType;

  bufferingMode: boolean;
  outputQueue: string[];
  queuedBytes: number;
  maxQueueSize: number;
  maxQueueBytes: number;
}

export interface PtyManagerEvents {
  data: (id: string, data: string) => void;
  exit: (id: string, exitCode: number) => void;
  error: (id: string, error: string) => void;
}

export interface TerminalSnapshot {
  id: string;
  lines: string[];
  lastInputTime: number;
  lastOutputTime: number;
  lastCheckTime: number;
  type?: TerminalType;
  worktreeId?: string;
  agentId?: string;
  agentState?: AgentState;
  lastStateChange?: number;
  error?: string;
  /** Session token to prevent stale observations from affecting new terminals with reused IDs */
  spawnedAt: number;
}

export class PtyManager extends EventEmitter {
  private terminals: Map<string, TerminalInfo> = new Map();
  private trashTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private activityMonitors: Map<string, ActivityMonitor> = new Map();
  private shellActivityPollers: Map<string, NodeJS.Timeout> = new Map();
  private ptyPool: PtyPool | null = null;

  private readonly TRASH_TTL_MS = 120 * 1000;
  private readonly SHELL_POLL_INTERVAL_MS = 1000;

  constructor() {
    super();
  }

  setPtyPool(pool: PtyPool): void {
    this.ptyPool = pool;
  }

  private emitActivityState(terminalId: string, activity: "busy" | "idle"): void {
    const terminal = this.terminals.get(terminalId);
    if (!terminal || !terminal.agentId) {
      return;
    }

    // Map activity to agent events: busy -> working state, idle -> waiting state
    const event: AgentEvent = activity === "busy" ? { type: "busy" } : { type: "prompt" };

    this.updateAgentState(terminalId, event, "activity", 1.0);
  }

  /**
   * Start polling for shell activity using process tree inspection.
   * This is more accurate than text-based detection for shell terminals.
   */
  private startShellActivityPoller(terminalId: string, pid: number): void {
    // Stop any existing poller for this terminal
    this.stopShellActivityPoller(terminalId);

    let lastBusyState: boolean | null = null;

    const poller = setInterval(async () => {
      const terminal = this.terminals.get(terminalId);
      if (!terminal) {
        this.stopShellActivityPoller(terminalId);
        return;
      }

      const isBusy = await hasChildProcesses(pid);

      // Only emit on state change
      if (isBusy !== lastBusyState) {
        lastBusyState = isBusy;
        events.emit("terminal:activity", {
          terminalId,
          activity: isBusy ? "busy" : "idle",
          source: "process-tree",
        });
      }
    }, this.SHELL_POLL_INTERVAL_MS);

    this.shellActivityPollers.set(terminalId, poller);
  }

  /**
   * Stop the shell activity poller for a terminal.
   */
  private stopShellActivityPoller(terminalId: string): void {
    const poller = this.shellActivityPollers.get(terminalId);
    if (poller) {
      clearInterval(poller);
      this.shellActivityPollers.delete(terminalId);
    }
  }

  private inferTrigger(event: AgentEvent): AgentStateChangeTrigger {
    switch (event.type) {
      case "input":
        return "input";
      case "output":
        return "output";
      case "busy":
        return "activity";
      case "prompt":
        return "activity";
      case "exit":
        return "exit";
      case "start":
        return "activity";
      case "error":
        return "activity";
      default:
        return "output";
    }
  }

  private inferConfidence(event: AgentEvent, trigger: AgentStateChangeTrigger): number {
    if (trigger === "input" || trigger === "exit") {
      return 1.0;
    }

    if (trigger === "output") {
      return 1.0;
    }

    // Activity-based detection is always high confidence
    if (trigger === "activity") {
      return 1.0;
    }

    if (trigger === "heuristic") {
      if (event.type === "busy") {
        return 0.9;
      }
      if (event.type === "prompt") {
        return 0.75;
      }
      if (event.type === "start") {
        return 0.7;
      }
      if (event.type === "error") {
        return 0.65;
      }
    }

    if (trigger === "ai-classification") {
      return 0.85;
    }

    if (trigger === "timeout") {
      return 0.6;
    }

    return 0.5;
  }

  private updateAgentState(
    id: string,
    event: AgentEvent,
    trigger?: AgentStateChangeTrigger,
    confidence?: number
  ): void {
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

      // Infer trigger from event type if not explicitly provided
      const inferredTrigger = trigger ?? this.inferTrigger(event);
      const inferredConfidence = confidence ?? this.inferConfidence(event, inferredTrigger);

      // Build and validate state change payload with EventContext fields
      const stateChangePayload = {
        agentId: terminal.agentId,
        state: newState,
        previousState,
        timestamp: terminal.lastStateChange,
        traceId: terminal.traceId,
        // EventContext fields for correlation and filtering
        terminalId: terminal.id,
        worktreeId: terminal.worktreeId,
        trigger: inferredTrigger,
        confidence: inferredConfidence,
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
          // EventContext fields for correlation and filtering
          terminalId: terminal.id,
          worktreeId: terminal.worktreeId,
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

  private handleAgentDetection(id: string, result: DetectionResult): void {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return;
    }

    if (result.detected && result.agentType) {
      // Agent detected
      const previousType = terminal.detectedAgentType;

      // Only emit event if detection state changed
      if (previousType !== result.agentType) {
        terminal.detectedAgentType = result.agentType;

        // Update terminal type to match detected agent
        terminal.type = result.agentType;

        // Update title if it's not custom
        if (!terminal.title || terminal.title === previousType || terminal.title === "Shell") {
          const agentNames: Record<TerminalType, string> = {
            claude: "Claude",
            gemini: "Gemini",
            codex: "Codex",
            shell: "Shell",
            custom: "Custom",
            npm: "NPM",
            yarn: "Yarn",
            pnpm: "PNPM",
            bun: "Bun",
          };
          terminal.title = agentNames[result.agentType];
        }

        // Emit agent:detected event
        events.emit("agent:detected", {
          terminalId: id,
          agentType: result.agentType,
          processName: result.processName || result.agentType,
          timestamp: Date.now(),
        });
      }
    } else if (!result.detected && terminal.detectedAgentType) {
      // Agent exited
      const previousType = terminal.detectedAgentType;
      terminal.detectedAgentType = undefined;

      // Revert to shell type
      terminal.type = "shell";
      terminal.title = "Shell";

      // Emit agent:exited event
      events.emit("agent:exited", {
        terminalId: id,
        agentType: previousType,
        timestamp: Date.now(),
      });
    }
  }

  private static readonly SEMANTIC_BUFFER_MAX_LINES = 50;
  private static readonly SEMANTIC_BUFFER_MAX_LINE_LENGTH = 1000;

  private updateSemanticBuffer(terminal: TerminalInfo, chunk: string): void {
    // Carriage returns (\r) rewrite the current line, so we treat them as newlines
    const normalized = chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const lines = normalized.split("\n");

    if (terminal.semanticBuffer.length > 0 && lines.length > 0 && !normalized.startsWith("\n")) {
      terminal.semanticBuffer[terminal.semanticBuffer.length - 1] += lines[0];
      lines.shift();
    }

    const processedLines = lines
      .filter((line) => line.length > 0 || terminal.semanticBuffer.length > 0)
      .map((line) => {
        if (line.length > PtyManager.SEMANTIC_BUFFER_MAX_LINE_LENGTH) {
          return line.substring(0, PtyManager.SEMANTIC_BUFFER_MAX_LINE_LENGTH) + "... [truncated]";
        }
        return line;
      });

    terminal.semanticBuffer.push(...processedLines);

    if (terminal.semanticBuffer.length > PtyManager.SEMANTIC_BUFFER_MAX_LINES) {
      terminal.semanticBuffer = terminal.semanticBuffer.slice(
        -PtyManager.SEMANTIC_BUFFER_MAX_LINES
      );
    }
  }

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
      options.type === "claude" ||
      options.type === "gemini" ||
      options.type === "codex" ||
      options.type === "custom";
    // For agent terminals, use terminal ID as agent ID
    const agentId = isAgentTerminal ? id : undefined;

    // Merge with process environment, filtering out undefined values
    const baseEnv = process.env as Record<string, string | undefined>;
    const mergedEnv = { ...baseEnv, ...options.env };
    // Filter out undefined values to prevent node-pty errors
    const env = Object.fromEntries(
      Object.entries(mergedEnv).filter(([_, value]) => value !== undefined)
    ) as Record<string, string>;

    // Try to acquire from pool for shell terminals only
    // Agent terminals need fresh instances with specific configurations
    // Also exclude terminals with custom shell, env, or args (pool uses default args)
    const canUsePool =
      this.ptyPool && !isAgentTerminal && !options.shell && !options.env && !options.args;
    let pooledPty = canUsePool ? this.ptyPool!.acquire() : null;

    let ptyProcess: pty.IPty;

    if (pooledPty) {
      // Use pre-warmed PTY from pool
      // Resize to requested dimensions - treat failure as fatal
      try {
        pooledPty.resize(options.cols, options.rows);
      } catch (resizeError) {
        console.warn(
          `[PtyManager] Failed to resize pooled PTY for ${id}, falling back to spawn:`,
          resizeError
        );
        // Pooled PTY is likely dead - kill it and spawn fresh
        try {
          pooledPty.kill();
        } catch {
          // Ignore kill errors - already dead
        }
        // Fall through to spawn a fresh PTY
        pooledPty = null;
      }
    }

    if (pooledPty) {
      // Pooled PTY is healthy, use it
      ptyProcess = pooledPty;

      // Change directory if needed (send cd command)
      // Platform-specific cd to handle drive switching on Windows
      if (process.platform === "win32") {
        // cmd.exe and PowerShell need different commands
        const shellLower = shell.toLowerCase();
        if (shellLower.includes("powershell") || shellLower.includes("pwsh")) {
          ptyProcess.write(`Set-Location "${options.cwd.replace(/"/g, '""')}"\r`);
        } else {
          // cmd.exe needs /d flag to switch drives
          ptyProcess.write(`cd /d "${options.cwd.replace(/"/g, '\\"')}"\r`);
        }
      } else {
        // Unix shells
        ptyProcess.write(`cd "${options.cwd.replace(/"/g, '\\"')}"\r`);
      }

      if (process.env.CANOPY_VERBOSE) {
        console.log(`[PtyManager] Acquired terminal ${id} from pool (instant spawn)`);
      }
    } else {
      // Fall back to spawning a new PTY
      try {
        ptyProcess = pty.spawn(shell, args, {
          name: "xterm-256color",
          cols: options.cols,
          rows: options.rows,
          cwd: options.cwd,
          env,
        });

        if (process.env.CANOPY_VERBOSE && this.ptyPool) {
          console.log(`[PtyManager] Spawned terminal ${id} (pool empty or not applicable)`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to spawn terminal ${id}:`, errorMessage);
        this.emit("error", id, errorMessage);
        throw new Error(`Failed to spawn terminal: ${errorMessage}`);
      }
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

      // Check if we're in buffering mode (terminal is hidden/docked)
      if (terminal.bufferingMode) {
        // Buffer data instead of emitting IPC event
        terminal.outputQueue.push(data);
        terminal.queuedBytes += data.length;

        // Auto-flush if buffer exceeds max size or byte limit (prevents OOM)
        if (
          terminal.outputQueue.length >= terminal.maxQueueSize ||
          terminal.queuedBytes >= terminal.maxQueueBytes
        ) {
          this.flushBuffer(id);
        }
      } else {
        // Normal flow: emit immediately
        this.emit("data", id, data);
      }

      // For agent terminals, notify activity monitor and emit output events
      if (isAgentTerminal) {
        // Update sliding window buffer (needed for transcript capture)
        terminal.outputBuffer += data;
        if (terminal.outputBuffer.length > OUTPUT_BUFFER_SIZE) {
          terminal.outputBuffer = terminal.outputBuffer.slice(-OUTPUT_BUFFER_SIZE);
        }

        // Update semantic buffer (needed for transcript capture)
        this.updateSemanticBuffer(terminal, data);

        // Notify activity monitor - it handles busy/idle state transitions
        const monitor = this.activityMonitors.get(id);
        if (monitor) {
          monitor.onData();
        }

        // Emit agent:output event for transcript capture
        if (agentId) {
          const outputPayload = {
            agentId,
            data,
            timestamp: Date.now(),
            traceId: terminal.traceId,
            // EventContext fields for correlation and filtering
            terminalId: id,
            worktreeId: options.worktreeId,
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

      // Clear any pending trash timeout (prevents stale timeout from firing on reused ID)
      const timeout = this.trashTimeouts.get(id);
      if (timeout) {
        clearTimeout(timeout);
        this.trashTimeouts.delete(id);
      }

      // Stop process detector before exit to prevent memory leaks
      if (terminal.processDetector) {
        terminal.processDetector.stop();
        terminal.processDetector = undefined;
      }

      // Dispose activity monitor
      const monitor = this.activityMonitors.get(id);
      if (monitor) {
        monitor.dispose();
        this.activityMonitors.delete(id);
      }

      // Stop shell activity poller
      this.stopShellActivityPoller(id);

      // Flush any buffered output before exit to avoid data loss
      if (terminal.bufferingMode && terminal.outputQueue.length > 0) {
        this.flushBuffer(id);
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
          // EventContext fields for correlation and filtering
          terminalId: id,
          worktreeId: terminal.worktreeId,
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

    const terminal: TerminalInfo = {
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
      // Initialize buffering mode as disabled (terminals start visible)
      bufferingMode: false,
      outputQueue: [],
      queuedBytes: 0,
      maxQueueSize: DEFAULT_MAX_QUEUE_SIZE,
      maxQueueBytes: DEFAULT_MAX_QUEUE_BYTES,
    };

    this.terminals.set(id, terminal);

    // Create activity monitor for agent terminals
    if (isAgentTerminal) {
      const monitor = new ActivityMonitor(id, (termId, state) => {
        this.emitActivityState(termId, state);
      });
      this.activityMonitors.set(id, monitor);
    }

    // Start process detection for all terminals (including shell terminals)
    // This allows detection of agents launched from within shell sessions
    const ptyPid = ptyProcess.pid;
    if (ptyPid !== undefined) {
      const detector = new ProcessDetector(id, ptyPid, (result: DetectionResult) => {
        this.handleAgentDetection(id, result);
      });
      terminal.processDetector = detector;
      detector.start();

      // Start shell activity poller for shell terminals (process tree inspection)
      // This provides accurate busy/idle detection based on child processes
      if (!isAgentTerminal) {
        this.startShellActivityPoller(id, ptyPid);
      }
    }

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
   * Set buffering mode for a terminal.
   * When enabled, PTY output is buffered in memory instead of emitting IPC events.
   * Used to reduce IPC overhead for hidden/docked terminals.
   *
   * @param id - Terminal identifier
   * @param enabled - Whether to enable buffering mode
   */
  setBuffering(id: string, enabled: boolean): void {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      console.warn(`[PtyManager] Cannot set buffering: terminal ${id} not found`);
      return;
    }

    // Skip if already in desired mode
    if (terminal.bufferingMode === enabled) {
      return;
    }

    terminal.bufferingMode = enabled;

    if (enabled) {
      if (process.env.CANOPY_VERBOSE) {
        console.log(`[PtyManager] Buffering enabled for ${id}`);
      }
    } else {
      if (process.env.CANOPY_VERBOSE) {
        console.log(`[PtyManager] Buffering disabled for ${id}`);
      }
      // Note: We don't auto-flush here because the UI may not be subscribed yet.
      // The caller should explicitly call flushBuffer() after the UI is ready.
    }
  }

  /**
   * Flush buffered output for a terminal.
   * Combines all buffered chunks into a single payload and emits via IPC.
   *
   * @param id - Terminal identifier
   */
  flushBuffer(id: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal || terminal.outputQueue.length === 0) {
      return;
    }

    // Combine all buffered chunks into a single payload
    const combined = terminal.outputQueue.join("");
    const chunkCount = terminal.outputQueue.length;
    terminal.outputQueue = [];
    terminal.queuedBytes = 0;

    // Send as single IPC message for efficiency
    this.emit("data", id, combined);

    if (process.env.CANOPY_VERBOSE) {
      console.log(`[PtyManager] Flushed ${combined.length} bytes (${chunkCount} chunks) for ${id}`);
    }
  }

  /**
   * Kill a terminal process
   * @param id - Terminal identifier
   * @param reason - Optional reason for killing (for agent events)
   */
  kill(id: string, reason?: string): void {
    // Clear any pending trash timeout
    const timeout = this.trashTimeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.trashTimeouts.delete(id);
    }

    const terminal = this.terminals.get(id);
    if (terminal) {
      // Stop process detector
      if (terminal.processDetector) {
        terminal.processDetector.stop();
        terminal.processDetector = undefined;
      }

      // Dispose activity monitor
      const monitor = this.activityMonitors.get(id);
      if (monitor) {
        monitor.dispose();
        this.activityMonitors.delete(id);
      }

      // Stop shell activity poller
      this.stopShellActivityPoller(id);

      // Flush any buffered output before killing to avoid data loss
      if (terminal.bufferingMode && terminal.outputQueue.length > 0) {
        this.flushBuffer(id);
      }

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
          // EventContext fields for correlation and filtering
          terminalId: terminal.id,
          worktreeId: terminal.worktreeId,
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
   * Move a terminal to the trash. It will be auto-killed after the TTL.
   * Idempotent - calling multiple times on same terminal has no effect.
   * @param id - Terminal identifier
   */
  trash(id: string): void {
    // If already scheduled for deletion, do nothing
    if (this.trashTimeouts.has(id)) {
      return;
    }

    // Verify terminal exists
    if (!this.terminals.has(id)) {
      console.warn(`[PtyManager] Cannot trash non-existent terminal: ${id}`);
      return;
    }

    // Schedule garbage collection
    const timeout = setTimeout(() => {
      console.log(`[PtyManager] Auto-killing trashed terminal after TTL: ${id}`);
      this.kill(id, "trash-expired");
      this.trashTimeouts.delete(id);
    }, this.TRASH_TTL_MS);

    this.trashTimeouts.set(id, timeout);

    // Emit event so renderer knows it's pending GC
    events.emit("terminal:trashed", { id, expiresAt: Date.now() + this.TRASH_TTL_MS });
  }

  /**
   * Restore a terminal from the trash.
   * Returns true if terminal was in trash and restored, false otherwise.
   * @param id - Terminal identifier
   */
  restore(id: string): boolean {
    const timeout = this.trashTimeouts.get(id);

    // Only return true if we actually canceled a trash timeout
    if (timeout) {
      // Cancel pending deletion
      clearTimeout(timeout);
      this.trashTimeouts.delete(id);

      // Verify terminal still exists
      if (this.terminals.has(id)) {
        console.log(`[PtyManager] Restored terminal from trash: ${id}`);
        events.emit("terminal:restored", { id });
        return true;
      }
    }

    // Terminal was not in trash (or doesn't exist)
    return false;
  }

  /**
   * Check if a terminal is in the trash (pending deletion)
   * @param id - Terminal identifier
   */
  isInTrash(id: string): boolean {
    return this.trashTimeouts.has(id);
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
      spawnedAt: terminal.spawnedAt,
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
   * Transition agent state from an external observer.
   * Used by TerminalObserver for heuristic/AI-based state detection.
   *
   * @param id - Terminal identifier
   * @param event - Agent event that triggers the state transition
   * @param trigger - Trigger type for this state change
   * @param confidence - Confidence value for this detection
   * @param spawnedAt - Session token to prevent stale observations (optional, will be validated if provided)
   * @returns true if state was transitioned, false if rejected due to stale session
   */
  transitionState(
    id: string,
    event: AgentEvent,
    trigger: AgentStateChangeTrigger,
    confidence: number,
    spawnedAt?: number
  ): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return false;
    }

    // Validate session token if provided to prevent stale observations
    if (spawnedAt !== undefined && terminal.spawnedAt !== spawnedAt) {
      if (process.env.CANOPY_VERBOSE) {
        console.log(
          `[PtyManager] Rejected stale state transition for ${id} ` +
            `(session ${spawnedAt} vs current ${terminal.spawnedAt})`
        );
      }
      return false;
    }

    this.updateAgentState(id, event, trigger, confidence);
    return true;
  }

  /**
   * Clean up all terminals (called on app quit)
   */
  dispose(): void {
    // Clear all trash timeouts to prevent them from firing during shutdown
    for (const timeout of this.trashTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.trashTimeouts.clear();

    // Dispose all activity monitors
    for (const monitor of this.activityMonitors.values()) {
      monitor.dispose();
    }
    this.activityMonitors.clear();

    // Clear all shell activity pollers
    for (const poller of this.shellActivityPollers.values()) {
      clearInterval(poller);
    }
    this.shellActivityPollers.clear();

    for (const [id, terminal] of this.terminals) {
      try {
        // Emit agent:killed event for agent terminals during shutdown
        if (terminal.agentId) {
          const killedPayload = {
            agentId: terminal.agentId,
            reason: "cleanup",
            timestamp: Date.now(),
            traceId: terminal.traceId,
            // EventContext fields for correlation and filtering
            terminalId: terminal.id,
            worktreeId: terminal.worktreeId,
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
   * Handle project switch - kill all terminals and reset state.
   * This ensures no terminals from the previous project leak into the new project.
   * Reuses existing dispose() logic to ensure complete cleanup.
   */
  onProjectSwitch(): void {
    console.log("Handling project switch in PtyManager");

    // Use dispose() to ensure complete cleanup (stops detectors, clears buffers, kills PTYs)
    // This reuses the existing teardown logic that properly cleans up all resources
    this.dispose();

    // Note: dispose() already clears terminals and trash timeouts
    // No need to duplicate that logic here

    console.log("PtyManager state reset for project switch");
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
