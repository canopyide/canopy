/**
 * Pty Host - UtilityProcess entry point for terminal management.
 *
 * This process handles all terminal I/O and state tracking, keeping the
 * Main process responsive. It runs PtyManager and PtyPool in an isolated
 * context, communicating with Main via IPC messages.
 *
 * State detection uses activity-based monitoring (data flow) rather than
 * pattern matching or AI classification.
 */

import { MessagePort } from "node:worker_threads";
import os from "node:os";
import { PtyManager } from "./services/PtyManager.js";
import { PtyPool, getPtyPool } from "./services/PtyPool.js";
import { events } from "./services/events.js";
import type { AgentEvent } from "./services/AgentStateMachine.js";
import type { PtyHostEvent, PtyHostTerminalSnapshot } from "../shared/types/pty-host.js";

// Validate we're running in UtilityProcess context
if (!process.parentPort) {
  throw new Error("[PtyHost] Must run in UtilityProcess context");
}

const port = process.parentPort as unknown as MessagePort;

// Global error handlers to prevent silent crashes
process.on("uncaughtException", (err) => {
  console.error("[PtyHost] Uncaught Exception:", err);
  sendEvent({ type: "error", id: "system", error: err.message });
});

process.on("unhandledRejection", (reason) => {
  console.error("[PtyHost] Unhandled Rejection:", reason);
  sendEvent({
    type: "error",
    id: "system",
    error: String(reason instanceof Error ? reason.message : reason),
  });
});

// Initialize services
const ptyManager = new PtyManager();
let ptyPool: PtyPool | null = null;

// Helper to send events to Main process
function sendEvent(event: PtyHostEvent): void {
  port.postMessage(event);
}

// Wire up PtyManager events
ptyManager.on("data", (id: string, data: string) => {
  sendEvent({ type: "data", id, data });
});

ptyManager.on("exit", (id: string, exitCode: number) => {
  sendEvent({ type: "exit", id, exitCode });
});

ptyManager.on("error", (id: string, error: string) => {
  sendEvent({ type: "error", id, error });
});

// Forward internal event bus events to Main
events.on("agent:state-changed", (payload) => {
  // Only forward if terminalId is defined
  if (payload.terminalId) {
    sendEvent({
      type: "agent-state",
      id: payload.terminalId,
      state: payload.state,
      previousState: payload.previousState,
      timestamp: payload.timestamp,
      traceId: payload.traceId,
      trigger: payload.trigger,
      confidence: payload.confidence,
      worktreeId: payload.worktreeId,
    });
  }
});

events.on("agent:detected", (payload) => {
  sendEvent({
    type: "agent-detected",
    terminalId: payload.terminalId,
    agentType: payload.agentType,
    processName: payload.processName,
    timestamp: payload.timestamp,
  });
});

events.on("agent:exited", (payload) => {
  sendEvent({
    type: "agent-exited",
    terminalId: payload.terminalId,
    agentType: payload.agentType,
    timestamp: payload.timestamp,
  });
});

events.on("agent:spawned", (payload) => {
  sendEvent({
    type: "agent-spawned",
    payload: {
      agentId: payload.agentId,
      terminalId: payload.terminalId,
      type: payload.type,
      worktreeId: payload.worktreeId,
      timestamp: payload.timestamp,
    },
  });
});

events.on("agent:output", (payload) => {
  sendEvent({
    type: "agent-output",
    payload: {
      agentId: payload.agentId,
      data: payload.data,
      timestamp: payload.timestamp,
      traceId: payload.traceId,
      terminalId: payload.terminalId,
      worktreeId: payload.worktreeId,
    },
  });
});

events.on("agent:completed", (payload) => {
  sendEvent({
    type: "agent-completed",
    payload: {
      agentId: payload.agentId,
      exitCode: payload.exitCode,
      duration: payload.duration,
      timestamp: payload.timestamp,
      traceId: payload.traceId,
      terminalId: payload.terminalId,
      worktreeId: payload.worktreeId,
    },
  });
});

events.on("agent:failed", (payload) => {
  sendEvent({
    type: "agent-failed",
    payload: {
      agentId: payload.agentId,
      error: payload.error,
      timestamp: payload.timestamp,
      traceId: payload.traceId,
      terminalId: payload.terminalId,
      worktreeId: payload.worktreeId,
    },
  });
});

events.on("agent:killed", (payload) => {
  sendEvent({
    type: "agent-killed",
    payload: {
      agentId: payload.agentId,
      reason: payload.reason,
      timestamp: payload.timestamp,
      traceId: payload.traceId,
      terminalId: payload.terminalId,
      worktreeId: payload.worktreeId,
    },
  });
});

events.on("terminal:trashed", (payload) => {
  sendEvent({
    type: "terminal-trashed",
    id: payload.id,
    expiresAt: payload.expiresAt,
  });
});

events.on("terminal:restored", (payload) => {
  sendEvent({
    type: "terminal-restored",
    id: payload.id,
  });
});

// Convert internal terminal snapshot to IPC-safe format
function toHostSnapshot(id: string): PtyHostTerminalSnapshot | null {
  const snapshot = ptyManager.getTerminalSnapshot(id);
  if (!snapshot) return null;

  return {
    id: snapshot.id,
    lines: snapshot.lines,
    lastInputTime: snapshot.lastInputTime,
    lastOutputTime: snapshot.lastOutputTime,
    lastCheckTime: snapshot.lastCheckTime,
    type: snapshot.type,
    worktreeId: snapshot.worktreeId,
    agentId: snapshot.agentId,
    agentState: snapshot.agentState,
    lastStateChange: snapshot.lastStateChange,
    error: snapshot.error,
    spawnedAt: snapshot.spawnedAt,
  };
}

// Handle requests from Main
port.on("message", (rawMsg: any) => {
  // Electron/Node might wrap the message in { data: ..., ports: [] }
  const msg = rawMsg?.data ? rawMsg.data : rawMsg;

  try {
    switch (msg.type) {
      case "spawn":
        ptyManager.spawn(msg.id, msg.options);
        break;

      case "write":
        ptyManager.write(msg.id, msg.data, msg.traceId);
        break;

      case "resize":
        ptyManager.resize(msg.id, msg.cols, msg.rows);
        break;

      case "kill":
        ptyManager.kill(msg.id, msg.reason);
        break;

      case "trash":
        ptyManager.trash(msg.id);
        break;

      case "restore":
        ptyManager.restore(msg.id);
        break;

      case "set-buffering":
        ptyManager.setBuffering(msg.id, msg.enabled);
        break;

      case "flush-buffer":
        ptyManager.flushBuffer(msg.id);
        break;

      case "get-snapshot":
        sendEvent({
          type: "snapshot",
          id: msg.id,
          snapshot: toHostSnapshot(msg.id),
        });
        break;

      case "get-all-snapshots":
        sendEvent({
          type: "all-snapshots",
          snapshots: ptyManager.getAllTerminalSnapshots().map((s) => ({
            id: s.id,
            lines: s.lines,
            lastInputTime: s.lastInputTime,
            lastOutputTime: s.lastOutputTime,
            lastCheckTime: s.lastCheckTime,
            type: s.type,
            worktreeId: s.worktreeId,
            agentId: s.agentId,
            agentState: s.agentState,
            lastStateChange: s.lastStateChange,
            error: s.error,
            spawnedAt: s.spawnedAt,
          })),
        });
        break;

      case "mark-checked":
        ptyManager.markChecked(msg.id);
        break;

      case "transition-state": {
        const success = ptyManager.transitionState(
          msg.id,
          msg.event as AgentEvent,
          msg.trigger as
            | "input"
            | "output"
            | "heuristic"
            | "ai-classification"
            | "timeout"
            | "exit",
          msg.confidence,
          msg.spawnedAt
        );
        sendEvent({ type: "transition-result", id: msg.id, requestId: msg.requestId, success });
        break;
      }

      case "health-check":
        sendEvent({ type: "pong" });
        break;

      case "dispose":
        cleanup();
        break;

      default:
        console.warn("[PtyHost] Unknown message type:", (msg as { type: string }).type);
    }
  } catch (error) {
    console.error("[PtyHost] Error handling message:", error);
  }
});

function cleanup(): void {
  console.log("[PtyHost] Disposing resources...");

  if (ptyPool) {
    ptyPool.dispose();
    ptyPool = null;
  }

  ptyManager.dispose();
  events.removeAllListeners();

  console.log("[PtyHost] Disposed");
}

// Handle process exit
process.on("exit", () => {
  cleanup();
});

// Initialize pool asynchronously
async function initialize(): Promise<void> {
  try {
    // Initialize pool
    ptyPool = getPtyPool({ poolSize: 2 });
    const homedir = process.env.HOME || os.homedir();
    await ptyPool.warmPool(homedir);
    ptyManager.setPtyPool(ptyPool);
    console.log("[PtyHost] PTY pool warmed");

    // Notify Main that we're ready
    sendEvent({ type: "ready" });
    console.log("[PtyHost] Initialized and ready");
  } catch (error) {
    console.error("[PtyHost] Initialization failed:", error);
    // Still send ready to unblock Main, but log the error
    sendEvent({ type: "ready" });
  }
}

// Start initialization
initialize().catch((err) => {
  console.error("[PtyHost] Fatal initialization error:", err);
});
