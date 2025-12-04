import * as pty from "node-pty";
import { EventEmitter } from "events";
import { existsSync } from "fs";
import { Terminal as HeadlessTerminal } from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";
import { events } from "./events.js";
import { nextAgentState, getStateChangeTimestamp, type AgentEvent } from "./AgentStateMachine.js";
import type { AgentState } from "../types/index.js";
import {
  AgentSpawnedSchema,
  AgentStateChangedSchema,
  AgentCompletedSchema,
  AgentFailedSchema,
  AgentKilledSchema,
  type AgentStateChangeTrigger,
} from "../schemas/agent.js";
import { type PtyPool } from "./PtyPool.js";
import { ProcessDetector, type DetectionResult } from "./ProcessDetector.js";
import type { TerminalType } from "../../shared/types/domain.js";
import { ActivityMonitor } from "./ActivityMonitor.js";
import type { ActivityTier } from "../../shared/types/pty-host.js";
export type { ActivityTier } from "../../shared/types/pty-host.js";

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
  projectId?: string; // Which project owns this terminal (for multi-tenancy)
}

const OUTPUT_BUFFER_SIZE = 2000;

const DEFAULT_MAX_QUEUE_SIZE = 100;

const DEFAULT_MAX_QUEUE_BYTES = 1024 * 1024;

// Circuit breaker: pause PTY when output rate exceeds threshold (prevents IPC flooding after wake)
const FLOOD_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5MB per second
const FLOOD_CHECK_INTERVAL_MS = 1000;
const FLOOD_RESUME_THRESHOLD = FLOOD_THRESHOLD_BYTES * 0.5; // Resume when rate drops to 50%

// Input chunking constants (VS Code pattern: prevent data corruption on large pastes)
const WRITE_MAX_CHUNK_SIZE = 50; // chars per chunk
const WRITE_INTERVAL_MS = 5; // delay between chunks

// Watermark-based queue limits for visible terminals (prevents renderer overload)
const SOFT_QUEUE_LIMIT_BYTES = 256 * 1024; // 256KB - trigger aggressive flushing
const HARD_QUEUE_LIMIT_BYTES = 1024 * 1024; // 1MB - drop oldest chunks
const AGGRESSIVE_FLUSH_INTERVAL_MS = 10; // Fast flush when near limit
const QUEUE_STATE_HYSTERESIS_MS = 500; // Stay in soft mode for 500ms after dropping below threshold

// Scrollback configuration per terminal type (headless terminal)
const SCROLLBACK_BY_TYPE: Record<TerminalType, number> = {
  claude: 10000,
  gemini: 10000,
  codex: 10000,
  custom: 10000,
  shell: 2000,
  npm: 500,
  yarn: 500,
  pnpm: 500,
  bun: 500,
};
const DEFAULT_SCROLLBACK = 1000;

/**
 * Split input into chunks for safe PTY writing.
 * Chunks at max size OR before escape sequences to prevent mid-sequence splits.
 * Based on VS Code's terminalProcess.ts implementation.
 */
function chunkInput(data: string): string[] {
  // Fast path: empty or small inputs
  if (data.length === 0) {
    return [];
  }
  if (data.length <= WRITE_MAX_CHUNK_SIZE) {
    return [data];
  }

  const chunks: string[] = [];
  let start = 0;

  for (let i = 0; i < data.length - 1; i++) {
    // Chunk at max size OR before escape sequences (don't split ESC sequences)
    if (i - start + 1 >= WRITE_MAX_CHUNK_SIZE || data[i + 1] === "\x1b") {
      chunks.push(data.substring(start, i + 1));
      start = i + 1;
      // Don't skip next char - we need to check every position for escape sequences
    }
  }

  // Push remaining data
  if (start < data.length) {
    chunks.push(data.substring(start));
  }

  return chunks;
}

interface TerminalInfo {
  id: string;
  projectId?: string; // Which project owns this terminal (for multi-tenancy)
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

  /** Pending semantic buffer data awaiting flush */
  pendingSemanticData: string;
  /** Timer for batched semantic buffer updates */
  semanticFlushTimer: NodeJS.Timeout | null;

  // Circuit breaker state for flood protection
  bytesThisSecond: number;
  isFlooded: boolean;
  lastResumedAt: number;

  // Input write queue for chunked writes (prevents data corruption on large pastes)
  inputWriteQueue: string[];
  inputWriteTimeout: NodeJS.Timeout | null;

  // Watermark-based queue state for visible terminals
  queueState: "normal" | "soft" | "hard";
  lastQueueStateChange: number;

  // IPC batching state for activity-tiered output coalescing
  activityTier: ActivityTier;
  lastTierChangeAt: number;

  // Batching state for visible terminals (separate from buffering mode for hidden terminals)
  batchBuffer: string[];
  batchBytes: number;
  batchTimer: NodeJS.Timeout | null;

  /** Headless xterm instance for persistent terminal state */
  headlessTerminal: HeadlessTerminal;
  /** Serialize addon attached to headless terminal */
  serializeAddon: SerializeAddon;
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
  private ptyPool: PtyPool | null = null;
  private lastKnownProjectId: string | null = null;
  private activeProjectId: string | null = null; // Filter IPC events by this project
  private floodCheckInterval: NodeJS.Timeout | null = null;

  private readonly TRASH_TTL_MS = 120 * 1000;

  constructor() {
    super();
    // Start flood monitoring
    this.floodCheckInterval = setInterval(() => this.checkFlooding(), FLOOD_CHECK_INTERVAL_MS);
  }

  /** Check all terminals for output flooding and apply circuit breaker */
  private checkFlooding(): void {
    const now = Date.now();
    for (const [id, terminal] of this.terminals) {
      if (terminal.bytesThisSecond > FLOOD_THRESHOLD_BYTES) {
        if (!terminal.isFlooded) {
          terminal.isFlooded = true;
          // Pause the PTY to stop output
          try {
            terminal.ptyProcess.pause();
          } catch {
            // Ignore pause errors (process may already be dead)
          }

          const mbPerSecond = (terminal.bytesThisSecond / 1024 / 1024).toFixed(1);
          this.emitData(
            id,
            `\r\n\x1b[31m[CANOPY] Output flood detected (${mbPerSecond} MB/s). Process paused to prevent crash.\x1b[0m\r\n`
          );

          events.emit("ui:notify", {
            type: "error",
            message: `Terminal ${terminal.title || id} paused due to excessive output.`,
          });
        }
        // Don't reset counter while flooded - let it accumulate to prove sustained low rate
      } else if (terminal.isFlooded && terminal.bytesThisSecond < FLOOD_RESUME_THRESHOLD) {
        // Require at least 2 seconds of low output before resuming to avoid oscillation
        const timeSinceResume = now - terminal.lastResumedAt;
        if (timeSinceResume > 2000) {
          terminal.isFlooded = false;
          terminal.lastResumedAt = now;
          try {
            terminal.ptyProcess.resume();
          } catch {
            // Ignore resume errors
          }

          this.emitData(
            id,
            `\r\n\x1b[32m[CANOPY] Output rate normalized. Process resumed.\x1b[0m\r\n`
          );
        }
        // Reset counter to start tracking low-rate period
        terminal.bytesThisSecond = 0;
      } else if (!terminal.isFlooded) {
        // Normal operation - reset counter for next interval
        terminal.bytesThisSecond = 0;
      }
    }
  }

  /**
   * Set the active project for IPC event filtering.
   * Only terminals belonging to the active project will emit data events to the renderer.
   * Backgrounded projects continue running but emit nothing over IPC.
   */
  setActiveProject(projectId: string | null): void {
    const previousProjectId = this.activeProjectId;
    this.activeProjectId = projectId;

    if (process.env.CANOPY_VERBOSE) {
      console.log(
        `[PtyManager] Active project changed: ${previousProjectId || "none"} → ${projectId || "none"}`
      );
    }
  }

  /**
   * Get the current active project ID.
   */
  getActiveProjectId(): string | null {
    return this.activeProjectId;
  }

  /**
   * Emit terminal data with project-based filtering.
   * Only emits if the terminal belongs to the active project.
   * Uses lastKnownProjectId fallback for legacy terminals without projectId.
   */
  private emitData(id: string, data: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return;
    }

    // No active project filter → emit all (useful for debugging or single-project mode)
    if (!this.activeProjectId) {
      this.emit("data", id, data);
      return;
    }

    // Use same classification logic as onProjectSwitch for consistency
    const terminalProjectId = terminal.projectId || this.lastKnownProjectId;

    // Only emit if terminal belongs to active project
    // Terminals without any projectId (even after fallback) are backgrounded to be safe
    if (terminalProjectId && terminalProjectId === this.activeProjectId) {
      this.emit("data", id, data);
    }
    // Else: backgrounded terminal - output is still buffered, just not sent over IPC
  }

  /**
   * Replay recent terminal history for seamless project restoration.
   * Sends the last N lines from the semantic buffer as a single data event.
   * Uses direct emit (bypasses filtering) since this is an explicit replay request.
   */
  replayHistory(terminalId: string, maxLines: number = 100): number {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      return 0;
    }

    const bufferSize = terminal.semanticBuffer.length;
    const linesToReplay = Math.min(maxLines, bufferSize);

    if (linesToReplay === 0) {
      return 0;
    }

    const recentLines = terminal.semanticBuffer.slice(-linesToReplay);
    const historyChunk = recentLines.join("\n") + "\n";

    // Direct emit (bypass filtering) since this is explicit replay
    this.emit("data", terminalId, historyChunk);

    if (process.env.CANOPY_VERBOSE) {
      console.log(
        `[PtyManager] Replayed ${linesToReplay}/${bufferSize} lines for terminal ${terminalId}`
      );
    }

    return linesToReplay;
  }

  /**
   * Replay history for all terminals in a specific project.
   * Uses same classification logic as onProjectSwitch for consistency.
   * Useful when foregrounding a project to restore all terminal states.
   */
  replayProjectHistory(projectId: string, maxLines: number = 100): number {
    let count = 0;

    for (const [id, terminal] of this.terminals) {
      // Use same fallback logic as onProjectSwitch and emitData
      const terminalProjectId = terminal.projectId || this.lastKnownProjectId;
      if (terminalProjectId === projectId) {
        const replayed = this.replayHistory(id, maxLines);
        if (replayed > 0) {
          count++;
        }
      }
    }

    if (process.env.CANOPY_VERBOSE) {
      console.log(`[PtyManager] Replayed history for ${count} terminals in project ${projectId}`);
    }

    return count;
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

    // Handle busy/idle status for shell terminals (non-agent terminals)
    // Agent terminals use ActivityMonitor for busy/idle state
    if (!terminal.agentId && result.isBusy !== undefined) {
      events.emit("terminal:activity", {
        terminalId: id,
        activity: result.isBusy ? "busy" : "idle",
        source: "process-tree",
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

  private static readonly SEMANTIC_FLUSH_INTERVAL_MS = 100;

  /**
   * Debounce semantic buffer updates to reduce hot path overhead.
   * Accumulates chunks and flushes every 100ms.
   */
  private debouncedSemanticUpdate(terminal: TerminalInfo, data: string): void {
    terminal.pendingSemanticData += data;

    if (terminal.semanticFlushTimer) {
      // Timer already running, just accumulate
      return;
    }

    terminal.semanticFlushTimer = setTimeout(() => {
      if (terminal.pendingSemanticData) {
        this.updateSemanticBuffer(terminal, terminal.pendingSemanticData);
        terminal.pendingSemanticData = "";
      }
      terminal.semanticFlushTimer = null;
    }, PtyManager.SEMANTIC_FLUSH_INTERVAL_MS);
  }

  /**
   * Flush any pending semantic buffer data immediately.
   * Called before terminal exit to ensure no data is lost.
   */
  private flushPendingSemanticData(terminal: TerminalInfo): void {
    if (terminal.semanticFlushTimer) {
      clearTimeout(terminal.semanticFlushTimer);
      terminal.semanticFlushTimer = null;
    }
    if (terminal.pendingSemanticData) {
      this.updateSemanticBuffer(terminal, terminal.pendingSemanticData);
      terminal.pendingSemanticData = "";
    }
  }

  /**
   * Enforce queue limits for visible terminals using watermarks.
   * Soft limit (256KB): Trigger aggressive flushing
   * Hard limit (1MB): Drop oldest chunks to prevent OOM
   * Returns the byte length of incoming data (cached for hot-path optimization)
   */
  private enforceQueueLimits(terminal: TerminalInfo, incomingData: string): number {
    const incomingBytes = Buffer.byteLength(incomingData, "utf8");
    const totalBytes = terminal.batchBytes + incomingBytes;
    const now = Date.now();

    if (totalBytes > HARD_QUEUE_LIMIT_BYTES) {
      // Hard limit: drop data to keep total under HARD_QUEUE_LIMIT_BYTES
      const previousState = terminal.queueState;
      terminal.queueState = "hard";
      terminal.lastQueueStateChange = now;

      // Calculate how much to drop to fit incoming data under hard limit
      const toDrop = totalBytes - HARD_QUEUE_LIMIT_BYTES;

      let droppedBytes = 0;
      let droppedChunks = 0;

      // Drop from front of buffer until we have room
      while (droppedBytes < toDrop && terminal.batchBuffer.length > 0) {
        const chunk = terminal.batchBuffer.shift()!;
        const chunkBytes = Buffer.byteLength(chunk, "utf8");
        droppedBytes += chunkBytes;
        terminal.batchBytes -= chunkBytes;
        droppedChunks++;
      }

      // Handle single-chunk oversize: if incoming chunk alone exceeds hard limit, drop everything
      if (incomingBytes > HARD_QUEUE_LIMIT_BYTES) {
        // Clear entire buffer since single chunk is too large
        terminal.batchBuffer = [];
        terminal.batchBytes = 0;
        droppedBytes += terminal.batchBytes;

        const mbOversize = (incomingBytes / 1024 / 1024).toFixed(2);
        console.warn(
          `[PtyManager] Single chunk (${mbOversize} MB) exceeds hard limit for ${terminal.id}. ` +
            `Discarding all buffered data.`
        );
      }

      if (droppedBytes > 0 || previousState !== "hard") {
        const mbDropped = (droppedBytes / 1024 / 1024).toFixed(2);
        console.warn(
          `[PtyManager] Hard queue limit reached for ${terminal.id}. ` +
            `Dropped ${droppedChunks} chunks (${mbDropped} MB)`
        );

        // Emit UI notification on first transition to hard state or when data dropped
        if (previousState !== "hard") {
          events.emit("ui:notify", {
            type: "warning",
            message: `Terminal ${terminal.title || terminal.id} output overflow. Older data dropped.`,
          });
        }
      }
    } else if (totalBytes > SOFT_QUEUE_LIMIT_BYTES) {
      // Soft limit: aggressive flushing
      if (terminal.queueState === "normal") {
        terminal.queueState = "soft";
        terminal.lastQueueStateChange = now;
      }
    } else {
      // Check hysteresis before transitioning back to normal
      const timeSinceStateChange = now - terminal.lastQueueStateChange;
      if (terminal.queueState !== "normal" && timeSinceStateChange > QUEUE_STATE_HYSTERESIS_MS) {
        terminal.queueState = "normal";
        terminal.lastQueueStateChange = now;
      }
    }

    return incomingBytes;
  }

  /**
   * Get flush delay based on activity tier.
   * FOCUSED: 0ms (immediate), VISIBLE: 100ms, BACKGROUND: 1000ms
   */
  private getFlushDelay(tier: ActivityTier): number {
    switch (tier) {
      case "focused":
        return 0;
      case "visible":
        return 100;
      case "background":
        return 1000;
      default:
        return 100;
    }
  }

  /**
   * Schedule a batch flush with adaptive delay based on queue state and activity tier.
   */
  private scheduleBatchFlush(terminal: TerminalInfo): void {
    if (terminal.batchTimer) return;

    let delay: number;

    if (terminal.queueState === "hard") {
      // Hard limit: immediate flush
      delay = 0;
    } else if (terminal.queueState === "soft") {
      // Soft limit: fast flush (10ms)
      delay = AGGRESSIVE_FLUSH_INTERVAL_MS;
    } else {
      // Normal state: use tier-based delay
      delay = this.getFlushDelay(terminal.activityTier);
    }

    if (delay === 0) {
      this.flushBatchBuffer(terminal.id);
    } else {
      terminal.batchTimer = setTimeout(() => {
        this.flushBatchBuffer(terminal.id);
      }, delay);
    }
  }

  /**
   * Flush the batch buffer for a terminal, emitting all accumulated data as one IPC message.
   */
  private flushBatchBuffer(id: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal || terminal.batchBuffer.length === 0) return;

    const combined = terminal.batchBuffer.join("");
    terminal.batchBuffer = [];
    terminal.batchBytes = 0;
    if (terminal.batchTimer) {
      clearTimeout(terminal.batchTimer);
      terminal.batchTimer = null;
    }

    this.emitData(id, combined);
  }

  /**
   * Set the activity tier for a terminal, affecting batch flush timing.
   * FOCUSED: immediate, VISIBLE: 100ms, BACKGROUND: 1000ms.
   * If tier changes to FOCUSED, pending batch is flushed immediately.
   * Tier promotions reschedule existing timers to use faster flush delays.
   */
  setActivityTier(id: string, tier: ActivityTier): void {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      if (process.env.CANOPY_VERBOSE) {
        console.warn(`[PtyManager] Cannot set activity tier: terminal ${id} not found`);
      }
      return;
    }

    const previousTier = terminal.activityTier;
    if (previousTier === tier) return;

    // Debounce rapid tier changes (100ms) to prevent oscillation
    // Schedule deferred tier change instead of dropping it
    const now = Date.now();
    if (now - terminal.lastTierChangeAt < 100) {
      // Schedule this tier change to apply after debounce period
      setTimeout(
        () => {
          // Only apply if terminal still exists and tier hasn't changed again
          const t = this.terminals.get(id);
          if (t && t.activityTier === previousTier) {
            this.setActivityTier(id, tier);
          }
        },
        100 - (now - terminal.lastTierChangeAt)
      );
      return;
    }

    terminal.activityTier = tier;
    terminal.lastTierChangeAt = now;

    if (process.env.CANOPY_VERBOSE) {
      console.log(`[PtyManager] Activity tier for ${id}: ${previousTier} → ${tier}`);
    }

    // Handle tier changes when there's pending batch data
    if (terminal.batchBuffer.length > 0) {
      const newDelay = this.getFlushDelay(tier);

      if (newDelay === 0) {
        // FOCUSED tier: flush immediately
        if (terminal.batchTimer) {
          clearTimeout(terminal.batchTimer);
          terminal.batchTimer = null;
        }
        this.flushBatchBuffer(id);
      } else if (terminal.batchTimer) {
        // Tier promotion to faster delay: reschedule with shorter timer
        const oldDelay = this.getFlushDelay(previousTier);
        if (newDelay < oldDelay) {
          clearTimeout(terminal.batchTimer);
          terminal.batchTimer = setTimeout(() => {
            this.flushBatchBuffer(id);
          }, newDelay);
        }
      }
    }
  }

  /**
   * Get the current activity tier for a terminal.
   */
  getActivityTier(id: string): ActivityTier | undefined {
    return this.terminals.get(id)?.activityTier;
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

    // Create headless terminal for persistent state (colors, formatting, cursor position)
    const scrollback = options.type
      ? (SCROLLBACK_BY_TYPE[options.type] ?? DEFAULT_SCROLLBACK)
      : DEFAULT_SCROLLBACK;
    const headlessTerminal = new HeadlessTerminal({
      cols: options.cols,
      rows: options.rows,
      scrollback,
      allowProposedApi: true,
    });
    const serializeAddon = new SerializeAddon();
    headlessTerminal.loadAddon(serializeAddon);

    // Forward PTY data events
    ptyProcess.onData((data) => {
      // Verify this is still the active terminal (prevent race with respawn)
      const terminal = this.terminals.get(id);
      if (!terminal || terminal.ptyProcess !== ptyProcess) {
        // This is a stale data event from a previous terminal with same ID
        return;
      }

      // Track byte rate for flood protection
      terminal.bytesThisSecond += data.length;

      // Drop data if flooded to prevent IPC overflow
      if (terminal.isFlooded) {
        return;
      }

      // Track output timing for silence detection
      terminal.lastOutputTime = Date.now();

      // Write to headless terminal to maintain authoritative state (colors, cursor, wrapping)
      terminal.headlessTerminal.write(data);

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
        // Visible terminal: use watermark-based flow control AND activity tiers
        // Enforce queue limits BEFORE adding to buffer (returns cached byte length)
        const incomingBytes = this.enforceQueueLimits(terminal, data);

        // Add to batch buffer (use cached byte length to avoid recomputation)
        terminal.batchBuffer.push(data);
        terminal.batchBytes += incomingBytes;

        // Schedule flush with adaptive interval based on queue state and activity tier
        this.scheduleBatchFlush(terminal);
      }

      // For agent terminals, notify activity monitor and emit output events
      if (isAgentTerminal) {
        // Update sliding window buffer (needed for transcript capture)
        terminal.outputBuffer += data;
        if (terminal.outputBuffer.length > OUTPUT_BUFFER_SIZE) {
          terminal.outputBuffer = terminal.outputBuffer.slice(-OUTPUT_BUFFER_SIZE);
        }

        // Update semantic buffer with debouncing (needed for transcript capture)
        this.debouncedSemanticUpdate(terminal, data);

        // Notify activity monitor - it handles busy/idle state transitions
        const monitor = this.activityMonitors.get(id);
        if (monitor) {
          monitor.onData();
        }

        // Emit agent:output event for transcript capture
        // Payload is internally constructed with known-good types - skip runtime validation
        // to avoid Zod schema traversal overhead on every output chunk
        if (agentId) {
          events.emit("agent:output", {
            agentId,
            data,
            timestamp: Date.now(),
            traceId: terminal.traceId,
            terminalId: id,
            worktreeId: options.worktreeId,
          });
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

      // Flush any pending semantic buffer data before exit
      this.flushPendingSemanticData(terminal);

      // Flush any pending batch buffer before exit to avoid data loss
      if (terminal.batchBuffer.length > 0) {
        this.flushBatchBuffer(id);
      }

      // Flush any buffered output before exit to avoid data loss
      if (terminal.bufferingMode && terminal.outputQueue.length > 0) {
        this.flushBuffer(id);
      }

      // Clear pending input writes to prevent stray timers and memory leaks
      if (terminal.inputWriteTimeout) {
        clearTimeout(terminal.inputWriteTimeout);
        terminal.inputWriteTimeout = null;
      }
      terminal.inputWriteQueue = [];

      // Flush any pending batch output for visible terminals
      if (terminal.batchTimer) {
        clearTimeout(terminal.batchTimer);
        terminal.batchTimer = null;
      }
      if (terminal.batchBuffer.length > 0) {
        this.flushBatchBuffer(id);
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

      // Dispose headless terminal
      terminal.headlessTerminal.dispose();

      this.terminals.delete(id);
    });

    const terminal: TerminalInfo = {
      id,
      projectId: options.projectId, // Store project ID for multi-tenancy
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
      // Debounced semantic buffer state
      pendingSemanticData: "",
      semanticFlushTimer: null,
      // Circuit breaker state
      bytesThisSecond: 0,
      isFlooded: false,
      lastResumedAt: 0,
      // Input write queue for chunked writes
      inputWriteQueue: [],
      inputWriteTimeout: null,
      // Watermark-based queue state
      queueState: "normal",
      lastQueueStateChange: spawnedAt,
      // IPC batching state - terminals start FOCUSED (visible in UI)
      activityTier: "focused",
      lastTierChangeAt: 0,
      // Batching state for visible terminals
      batchBuffer: [],
      batchBytes: 0,
      batchTimer: null,
      // Headless terminal for persistent state
      headlessTerminal,
      serializeAddon,
    };

    this.terminals.set(id, terminal);

    // Create activity monitor for agent terminals
    if (isAgentTerminal) {
      const monitor = new ActivityMonitor(id, (termId, state) => {
        this.emitActivityState(termId, state);
      });
      this.activityMonitors.set(id, monitor);
    }

    // Start process detection for all terminals
    // ProcessDetector handles agent detection and busy/idle state for shell terminals
    const ptyPid = ptyProcess.pid;
    if (ptyPid !== undefined) {
      const detector = new ProcessDetector(id, ptyPid, (result: DetectionResult) => {
        this.handleAgentDetection(id, result);
      });
      terminal.processDetector = detector;
      detector.start();
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

      // Agent starts in idle state - ActivityMonitor will transition to working on Enter key
    }
  }

  /**
   * Write data to terminal stdin with chunking for large inputs.
   * Chunks at 50 chars or before escape sequences, with 5ms delays between chunks.
   * This prevents data corruption on large pastes and race conditions in node-pty.
   * @param id - Terminal identifier
   * @param data - Data to write
   * @param traceId - Optional trace ID for event correlation
   */
  write(id: string, data: string, traceId?: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      console.warn(`Terminal ${id} not found, cannot write data`);
      return;
    }

    // Track input timing for silence detection
    terminal.lastInputTime = Date.now();

    // Store traceId if provided, or clear it if explicitly undefined
    // This ensures each traced operation gets a fresh ID and prevents cross-operation bleed
    if (traceId !== undefined) {
      terminal.traceId = traceId || undefined;
    }

    // Notify activity monitor of input (detects Enter key for busy state)
    // ActivityMonitor is the single source of truth for busy/idle transitions
    const monitor = this.activityMonitors.get(id);
    if (monitor) {
      monitor.onInput(data);
    }

    // Chunk input and queue for writing (prevents data corruption on large pastes)
    const chunks = chunkInput(data);
    terminal.inputWriteQueue.push(...chunks);

    this._startWrite(id);
  }

  /**
   * Start the write queue processing for a terminal.
   * Writes the first chunk immediately, then schedules subsequent chunks with delays.
   */
  private _startWrite(id: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal || terminal.inputWriteTimeout !== null || terminal.inputWriteQueue.length === 0) {
      return;
    }

    // Write first chunk immediately
    this._doWrite(id);

    // Schedule next write if queue not empty
    if (terminal.inputWriteQueue.length > 0) {
      terminal.inputWriteTimeout = setTimeout(() => {
        terminal.inputWriteTimeout = null;
        this._startWrite(id);
      }, WRITE_INTERVAL_MS);
    }
  }

  /**
   * Write the next chunk from the queue to the PTY.
   */
  private _doWrite(id: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal || terminal.inputWriteQueue.length === 0) {
      return;
    }

    const chunk = terminal.inputWriteQueue.shift()!;
    terminal.ptyProcess.write(chunk);
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

        // Resize headless terminal to keep state in sync
        terminal.headlessTerminal.resize(cols, rows);

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

    // Send as single IPC message with project filtering
    this.emitData(id, combined);

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

      // Flush any pending semantic buffer data before killing
      this.flushPendingSemanticData(terminal);

      // Flush any pending batch buffer before killing to avoid data loss
      if (terminal.batchBuffer.length > 0) {
        this.flushBatchBuffer(id);
      }

      // Flush any buffered output before killing to avoid data loss
      if (terminal.bufferingMode && terminal.outputQueue.length > 0) {
        this.flushBuffer(id);
      }

      // Clear pending input writes
      if (terminal.inputWriteTimeout) {
        clearTimeout(terminal.inputWriteTimeout);
        terminal.inputWriteTimeout = null;
      }
      terminal.inputWriteQueue = [];

      // Flush any pending batch output for visible terminals
      if (terminal.batchTimer) {
        clearTimeout(terminal.batchTimer);
        terminal.batchTimer = null;
      }
      if (terminal.batchBuffer.length > 0) {
        this.flushBatchBuffer(id);
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

      // Dispose headless terminal resources
      terminal.headlessTerminal.dispose();

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
   * Get serialized terminal state for fast restoration.
   * Uses the headless xterm instance to serialize full terminal state including
   * colors, formatting, cursor position, and line wrapping.
   * @param id - Terminal identifier
   * @returns Serialized state string or null if terminal not found
   */
  getSerializedState(id: string): string | null {
    const terminal = this.terminals.get(id);
    if (!terminal) return null;

    try {
      return terminal.serializeAddon.serialize();
    } catch (error) {
      console.error(`[PtyManager] Failed to serialize terminal ${id}:`, error);
      return null;
    }
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
    // Clear flood check interval
    if (this.floodCheckInterval) {
      clearInterval(this.floodCheckInterval);
      this.floodCheckInterval = null;
    }

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

    for (const [id, terminal] of this.terminals) {
      try {
        // Stop process detector
        if (terminal.processDetector) {
          terminal.processDetector.stop();
          terminal.processDetector = undefined;
        }

        // Clear semantic flush timer
        if (terminal.semanticFlushTimer) {
          clearTimeout(terminal.semanticFlushTimer);
          terminal.semanticFlushTimer = null;
        }

        // Clear input write queue timer and empty queue
        if (terminal.inputWriteTimeout) {
          clearTimeout(terminal.inputWriteTimeout);
          terminal.inputWriteTimeout = null;
        }
        terminal.inputWriteQueue = [];

        // Clear batch timer
        if (terminal.batchTimer) {
          clearTimeout(terminal.batchTimer);
          terminal.batchTimer = null;
        }

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

        // Dispose headless terminal
        terminal.headlessTerminal.dispose();

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
   * Handle project switch - filter terminals by project instead of killing.
   * Terminals from other projects are "backgrounded" (kept alive but hidden from UI).
   * @param newProjectId - The ID of the project being switched to
   */
  onProjectSwitch(newProjectId: string): void {
    console.log(`[PtyManager] Switching to project: ${newProjectId}`);

    let backgrounded = 0;
    let foregrounded = 0;

    for (const [id, terminal] of this.terminals) {
      // For legacy terminals without projectId, use lastKnownProjectId (not newProjectId)
      // This prevents legacy terminals from appearing in every project they don't belong to
      const terminalProjectId = terminal.projectId || this.lastKnownProjectId;

      // If still no projectId (very first switch), background the terminal to be safe
      if (!terminalProjectId || terminalProjectId !== newProjectId) {
        // Terminal belongs to different project (or unknown) - background it
        backgrounded++;
        events.emit("terminal:backgrounded", {
          id,
          projectId: terminalProjectId || "unknown",
          timestamp: Date.now(),
        });

        // Enable buffering mode and stop detectors to reduce overhead for hidden terminals
        this.setBuffering(id, true);
        if (terminal.processDetector) {
          terminal.processDetector.stop();
        }
        const monitor = this.activityMonitors.get(id);
        if (monitor) {
          monitor.dispose();
          this.activityMonitors.delete(id);
        }
      } else {
        // Terminal belongs to current project - foreground it
        foregrounded++;
        events.emit("terminal:foregrounded", {
          id,
          projectId: terminalProjectId,
          timestamp: Date.now(),
        });

        // Disable buffering and flush any queued output
        this.setBuffering(id, false);
        this.flushBuffer(id);

        // Restart detectors/monitors if they were stopped
        if (!terminal.processDetector && terminal.ptyProcess.pid !== undefined) {
          const detector = new ProcessDetector(id, terminal.ptyProcess.pid, (result) => {
            this.handleAgentDetection(id, result);
          });
          terminal.processDetector = detector;
          detector.start();
        }
        if (terminal.agentId && !this.activityMonitors.has(id)) {
          const monitor = new ActivityMonitor(id, (termId, state) => {
            this.emitActivityState(termId, state);
          });
          this.activityMonitors.set(id, monitor);
        }
      }
    }

    // Update lastKnownProjectId for future legacy terminals
    this.lastKnownProjectId = newProjectId;

    console.log(
      `[PtyManager] Project switch complete: ${foregrounded} foregrounded, ${backgrounded} backgrounded`
    );
  }

  /**
   * Get terminals for a specific project.
   * Uses same classification logic as onProjectSwitch for consistency.
   * @param projectId - The project ID to filter by
   * @returns Array of terminal IDs belonging to the project
   */
  getTerminalsForProject(projectId: string): string[] {
    const result: string[] = [];
    for (const [id, terminal] of this.terminals) {
      // Use same fallback logic as onProjectSwitch
      const terminalProjectId = terminal.projectId || this.lastKnownProjectId;
      if (terminalProjectId === projectId) {
        result.push(id);
      }
    }
    return result;
  }

  /**
   * Kill all terminals for a specific project.
   * Used when explicitly closing a project to free resources.
   * @param projectId - Project ID to kill terminals for
   * @returns Number of terminals killed
   */
  killByProject(projectId: string): number {
    const terminalsToKill = Array.from(this.terminals.entries())
      .filter(([_, terminal]) => {
        const terminalProjectId = terminal.projectId || this.lastKnownProjectId;
        return terminalProjectId === projectId;
      })
      .map(([id]) => id);

    if (terminalsToKill.length === 0) {
      console.log(`[PtyManager] No terminals to kill for project ${projectId}`);
      return 0;
    }

    console.log(
      `[PtyManager] Killing ${terminalsToKill.length} terminal(s) for project ${projectId}`
    );

    let killed = 0;
    for (const terminalId of terminalsToKill) {
      try {
        this.kill(terminalId, "project-closed");
        killed++;
      } catch (error) {
        console.error(`[PtyManager] Failed to kill terminal ${terminalId}:`, error);
      }
    }

    console.log(`[PtyManager] Killed ${killed}/${terminalsToKill.length} terminals`);
    return killed;
  }

  /**
   * Get statistics about processes for a project.
   * Used for resource monitoring and UI indicators.
   * @param projectId - Project ID to get stats for
   * @returns Stats object with counts and terminal types
   */
  getProjectStats(projectId: string): {
    terminalCount: number;
    processIds: number[];
    terminalTypes: Record<string, number>;
  } {
    const projectTerminals = Array.from(this.terminals.values()).filter((t) => {
      const terminalProjectId = t.projectId || this.lastKnownProjectId;
      return terminalProjectId === projectId;
    });

    const processIds = projectTerminals
      .map((t) => t.ptyProcess.pid)
      .filter((pid): pid is number => pid !== undefined);

    const terminalTypes = projectTerminals.reduce(
      (acc, t) => {
        const type = t.type || "shell";
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      terminalCount: projectTerminals.length,
      processIds,
      terminalTypes,
    };
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
