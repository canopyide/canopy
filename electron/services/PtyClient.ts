/**
 * PtyClient - Main process stub for terminal management.
 *
 * This class provides a drop-in replacement for PtyManager in the Main process.
 * It forwards all operations to the Pty Host (UtilityProcess) via IPC,
 * keeping the Main thread responsive.
 *
 * Interface matches PtyManager for seamless integration with existing code.
 */

import { utilityProcess, UtilityProcess, dialog } from "electron";
import { EventEmitter } from "events";
import path from "path";
import { fileURLToPath } from "url";
import { events } from "./events.js";
import type {
  PtyHostRequest,
  PtyHostEvent,
  PtyHostSpawnOptions,
} from "../../shared/types/pty-host.js";
import type { TerminalSnapshot } from "./PtyManager.js";
import type { AgentStateChangeTrigger } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Configuration for PtyClient */
export interface PtyClientConfig {
  /** Maximum restart attempts before giving up */
  maxRestartAttempts?: number;
  /** Health check interval in milliseconds */
  healthCheckIntervalMs?: number;
  /** Whether to show dialog on crash */
  showCrashDialog?: boolean;
}

const DEFAULT_CONFIG: Required<PtyClientConfig> = {
  maxRestartAttempts: 3,
  healthCheckIntervalMs: 30000,
  showCrashDialog: true,
};

export class PtyClient extends EventEmitter {
  private child: UtilityProcess | null = null;
  private config: Required<PtyClientConfig>;
  private isInitialized = false;
  private isDisposed = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private restartAttempts = 0;
  private pendingSpawns: Map<string, PtyHostSpawnOptions> = new Map();
  private snapshotCallbacks: Map<string, (snapshot: TerminalSnapshot | null) => void> = new Map();
  private allSnapshotsCallback: ((snapshots: TerminalSnapshot[]) => void) | null = null;
  private transitionCallbacks: Map<string, (success: boolean) => void> = new Map();
  private readyPromise: Promise<void>;
  private readyResolve: (() => void) | null = null;

  constructor(config: PtyClientConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create ready promise that resolves when host is ready
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });

    this.startHost();
  }

  /** Wait for the host to be ready */
  async waitForReady(): Promise<void> {
    return this.readyPromise;
  }

  private startHost(): void {
    if (this.isDisposed) {
      console.warn("[PtyClient] Cannot start host - already disposed");
      return;
    }

    // Reset initialization state for restart
    this.isInitialized = false;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });

    // Path to compiled pty-host.js
    const hostPath = path.join(__dirname, "../pty-host.js");

    console.log(`[PtyClient] Starting Pty Host from: ${hostPath}`);

    try {
      this.child = utilityProcess.fork(hostPath, [], {
        serviceName: "canopy-pty-host",
        stdio: "inherit", // Show logs in dev
        env: process.env as Record<string, string>,
      });
    } catch (error) {
      console.error("[PtyClient] Failed to fork Pty Host:", error);
      this.emit("host-crash", -1);
      return;
    }

    this.child.on("message", (msg: PtyHostEvent) => {
      this.handleHostEvent(msg);
    });

    this.child.on("exit", (code) => {
      console.error(`[PtyClient] Pty Host exited with code ${code}`);

      // Clear health check
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      this.isInitialized = false;
      this.child = null; // Prevent posting to dead process

      if (this.isDisposed) {
        // Expected shutdown
        return;
      }

      // Try to restart
      if (this.restartAttempts < this.config.maxRestartAttempts) {
        this.restartAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.restartAttempts), 10000);
        console.log(
          `[PtyClient] Restarting Host in ${delay}ms (attempt ${this.restartAttempts}/${this.config.maxRestartAttempts})`
        );

        setTimeout(() => {
          this.startHost();
          // Re-spawn any terminals that were pending
          this.respawnPending();
        }, delay);
      } else {
        console.error("[PtyClient] Max restart attempts reached, giving up");
        this.emit("host-crash", code);

        if (this.config.showCrashDialog) {
          dialog
            .showMessageBox({
              type: "error",
              title: "Terminal Service Crashed",
              message: `The terminal backend crashed (code ${code}). Terminals may need to be restarted.`,
              buttons: ["OK"],
            })
            .catch(console.error);
        }
      }
    });

    // Start health check
    this.healthCheckInterval = setInterval(() => {
      if (this.isInitialized && this.child) {
        this.send({ type: "health-check" });
      }
    }, this.config.healthCheckIntervalMs);

    console.log("[PtyClient] Pty Host started");
  }

  private handleHostEvent(event: PtyHostEvent): void {
    switch (event.type) {
      case "ready":
        this.isInitialized = true;
        this.restartAttempts = 0; // Reset on successful init
        if (this.readyResolve) {
          this.readyResolve();
          this.readyResolve = null;
        }
        console.log("[PtyClient] Pty Host is ready");
        break;

      case "data":
        this.emit("data", event.id, event.data);
        break;

      case "exit":
        this.pendingSpawns.delete(event.id);
        this.emit("exit", event.id, event.exitCode);
        break;

      case "error":
        this.emit("error", event.id, event.error);
        break;

      case "agent-state":
        // Forward to internal event bus for other services
        events.emit("agent:state-changed", {
          agentId: event.id,
          terminalId: event.id,
          state: event.state,
          previousState: event.previousState,
          timestamp: event.timestamp,
          traceId: event.traceId,
          trigger: event.trigger as AgentStateChangeTrigger,
          confidence: event.confidence,
          worktreeId: event.worktreeId,
        });
        break;

      case "agent-detected":
        events.emit("agent:detected", {
          terminalId: event.terminalId,
          agentType: event.agentType,
          processName: event.processName,
          timestamp: event.timestamp,
        });
        break;

      case "agent-exited":
        events.emit("agent:exited", {
          terminalId: event.terminalId,
          agentType: event.agentType,
          timestamp: event.timestamp,
        });
        break;

      case "agent-spawned":
        events.emit("agent:spawned", event.payload);
        break;

      case "agent-output":
        events.emit("agent:output", event.payload);
        break;

      case "agent-completed":
        events.emit("agent:completed", event.payload);
        break;

      case "agent-failed":
        events.emit("agent:failed", event.payload);
        break;

      case "agent-killed":
        events.emit("agent:killed", event.payload);
        break;

      case "terminal-trashed":
        events.emit("terminal:trashed", { id: event.id, expiresAt: event.expiresAt });
        break;

      case "terminal-restored":
        events.emit("terminal:restored", { id: event.id });
        break;

      case "snapshot": {
        const callback = this.snapshotCallbacks.get(event.id);
        if (callback) {
          this.snapshotCallbacks.delete(event.id);
          callback(event.snapshot as TerminalSnapshot | null);
        }
        break;
      }

      case "all-snapshots": {
        if (this.allSnapshotsCallback) {
          const cb = this.allSnapshotsCallback;
          this.allSnapshotsCallback = null;
          cb(event.snapshots as TerminalSnapshot[]);
        }
        break;
      }

      case "transition-result": {
        const cb = this.transitionCallbacks.get(event.requestId);
        if (cb) {
          this.transitionCallbacks.delete(event.requestId);
          cb(event.success);
        }
        break;
      }

      case "pong":
        // Health check passed, nothing to do
        break;

      default:
        console.warn("[PtyClient] Unknown event type:", (event as { type: string }).type);
    }
  }

  private send(request: PtyHostRequest): void {
    if (!this.child) {
      console.warn("[PtyClient] Cannot send - host not running");
      return;
    }
    this.child.postMessage(request);
  }

  private respawnPending(): void {
    // Respawn terminals that were active when host crashed
    for (const [id, options] of this.pendingSpawns) {
      console.log(`[PtyClient] Respawning terminal: ${id}`);
      this.send({ type: "spawn", id, options });
    }
  }

  // Public API - matches PtyManager interface

  spawn(id: string, options: PtyHostSpawnOptions): void {
    this.pendingSpawns.set(id, options);
    this.send({ type: "spawn", id, options });
  }

  write(id: string, data: string, traceId?: string): void {
    this.send({ type: "write", id, data, traceId });
  }

  resize(id: string, cols: number, rows: number): void {
    this.send({ type: "resize", id, cols, rows });
  }

  kill(id: string, reason?: string): void {
    this.pendingSpawns.delete(id);
    this.send({ type: "kill", id, reason });
  }

  /** Check if a terminal exists (based on local tracking) */
  hasTerminal(id: string): boolean {
    return this.pendingSpawns.has(id);
  }

  trash(id: string): void {
    this.send({ type: "trash", id });
  }

  /** Restore terminal from trash. Returns true if terminal was tracked. */
  restore(id: string): boolean {
    // Optimistically return true if we know about this terminal
    const wasTracked = this.pendingSpawns.has(id);
    this.send({ type: "restore", id });
    return wasTracked;
  }

  setBuffering(id: string, enabled: boolean): void {
    this.send({ type: "set-buffering", id, enabled });
  }

  flushBuffer(id: string): void {
    this.send({ type: "flush-buffer", id });
  }

  /** Get a snapshot of terminal state (async due to IPC) */
  async getTerminalSnapshot(id: string): Promise<TerminalSnapshot | null> {
    return new Promise((resolve) => {
      this.snapshotCallbacks.set(id, resolve);
      this.send({ type: "get-snapshot", id });

      // Timeout after 5s
      setTimeout(() => {
        if (this.snapshotCallbacks.has(id)) {
          this.snapshotCallbacks.delete(id);
          resolve(null);
        }
      }, 5000);
    });
  }

  /** Get snapshots for all terminals (async due to IPC) */
  async getAllTerminalSnapshots(): Promise<TerminalSnapshot[]> {
    return new Promise((resolve) => {
      this.allSnapshotsCallback = resolve;
      this.send({ type: "get-all-snapshots" });

      // Timeout after 5s
      setTimeout(() => {
        if (this.allSnapshotsCallback) {
          this.allSnapshotsCallback = null;
          resolve([]);
        }
      }, 5000);
    });
  }

  markChecked(id: string): void {
    this.send({ type: "mark-checked", id });
  }

  async transitionState(
    id: string,
    event: { type: string; [key: string]: unknown },
    trigger: AgentStateChangeTrigger,
    confidence: number,
    spawnedAt?: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = `${id}-${Date.now()}`;
      this.transitionCallbacks.set(requestId, resolve);
      this.send({
        type: "transition-state",
        id,
        requestId,
        event,
        trigger,
        confidence,
        spawnedAt,
      });

      // Timeout after 5s
      setTimeout(() => {
        if (this.transitionCallbacks.has(requestId)) {
          this.transitionCallbacks.delete(requestId);
          resolve(false);
        }
      }, 5000);
    });
  }

  /** Handle project switch - forward to host */
  onProjectSwitch(): void {
    this.send({ type: "dispose" });
    this.pendingSpawns.clear();
    // Restart host for new project
    if (this.child) {
      this.child.kill();
    }
    setTimeout(() => {
      this.startHost();
    }, 100);
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    console.log("[PtyClient] Disposing...");

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.child) {
      this.send({ type: "dispose" });
      // Give it a moment to clean up, then force kill
      setTimeout(() => {
        if (this.child) {
          this.child.kill();
          this.child = null;
        }
      }, 1000);
    }

    this.pendingSpawns.clear();
    this.snapshotCallbacks.clear();
    this.transitionCallbacks.clear();
    this.allSnapshotsCallback = null;
    this.removeAllListeners();

    console.log("[PtyClient] Disposed");
  }

  /** Check if host is running and initialized */
  isReady(): boolean {
    return this.isInitialized && this.child !== null;
  }
}

// Singleton management
let ptyClientInstance: PtyClient | null = null;

export function getPtyClient(config?: PtyClientConfig): PtyClient {
  if (!ptyClientInstance) {
    ptyClientInstance = new PtyClient(config);
  }
  return ptyClientInstance;
}

export function disposePtyClient(): void {
  if (ptyClientInstance) {
    ptyClientInstance.dispose();
    ptyClientInstance = null;
  }
}
