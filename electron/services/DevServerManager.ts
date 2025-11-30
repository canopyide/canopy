/**
 * DevServerManager
 *
 * Manages development server processes for worktrees in the Electron main process.
 * Migrated from the original Canopy CLI with IPC integration for renderer communication.
 *
 * Responsibilities:
 * - Start/stop dev server processes per worktree
 * - Detect server URLs from stdout
 * - Emit state updates via IPC
 * - Graceful shutdown with SIGTERM → SIGKILL fallback
 * - Cross-platform process cleanup using execa
 */

import { execa, type ResultPromise, type Result } from "execa";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserWindow } from "electron";
import type { DevServerState, DevServerStatus } from "../ipc/types.js";
import { events } from "./events.js";

// URL detection patterns for common dev servers
const URL_PATTERNS = [
  // Vite
  /Local:\s+(https?:\/\/localhost:\d+\/?)/i,
  // Next.js
  /Ready on (https?:\/\/localhost:\d+\/?)/i,
  // Generic patterns - broader host matching
  /Listening on (https?:\/\/[\w.-]+:\d+\/?)/i,
  /Server (?:is )?(?:running|started) (?:on|at) (https?:\/\/[\w.-]+:\d+\/?)/i,
  // Create React App
  /Local:\s+(https?:\/\/localhost:\d+\/?)/i,
  // Angular
  /Server is listening on (https?:\/\/[\w.-]+:\d+\/?)/i,
  // Express / generic Node
  /(?:Listening|Started) on (?:port )?(\d+)/i,
  // Webpack Dev Server
  /Project is running at (https?:\/\/[\w.-]+:\d+\/?)/i,
  // Generic URL fallback - capture any http(s) URL with port
  /(https?:\/\/[\w.-]+:\d+\/?)/i,
];

// Port-only patterns (extract port number)
const PORT_PATTERNS = [/(?:Listening|Started) on (?:port )?(\d+)/i, /port[:\s]+(\d+)/i];

const FORCE_KILL_TIMEOUT_MS = 5000;
const MAX_LOG_LINES = 100;

// Cache entry for dev script detection
interface DevScriptCacheEntry {
  hasDevScript: boolean;
  command: string | null;
  checkedAt: number;
}

// Cache TTL: 5 minutes (invalidated on explicit refresh)
const DEV_SCRIPT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * DevServerManager manages dev server processes for worktrees.
 *
 * State changes are emitted via the event bus (server:update, server:error),
 * enabling observability through EventBuffer and EventInspector.
 * IPC handlers subscribe to these events and forward to renderer.
 */
export class DevServerManager {
  private servers = new Map<string, ResultPromise>();
  private states = new Map<string, DevServerState>();
  private logBuffers = new Map<string, string[]>();
  private devScriptCache = new Map<string, DevScriptCacheEntry>();

  /**
   * Initialize the manager.
   * Note: IPC communication is now handled via event bus subscriptions in handlers.ts
   */
  public initialize(
    _mainWindow: BrowserWindow,
    _sendToRenderer: (channel: string, ...args: unknown[]) => void
  ): void {
    // No-op: State updates are now emitted via event bus (server:update, server:error)
    // IPC handlers subscribe to events and forward to renderer
  }

  /**
   * Get the current state for a worktree's dev server.
   */
  public getState(worktreeId: string): DevServerState {
    return (
      this.states.get(worktreeId) ?? {
        worktreeId,
        status: "stopped",
      }
    );
  }

  /**
   * Get all server states.
   */
  public getAllStates(): Map<string, DevServerState> {
    return new Map(this.states);
  }

  /**
   * Check if a dev server is running for a worktree.
   */
  public isRunning(worktreeId: string): boolean {
    const state = this.states.get(worktreeId);
    return state?.status === "running" || state?.status === "starting";
  }

  /**
   * Start a dev server for a worktree.
   *
   * @param worktreeId - Worktree ID
   * @param worktreePath - Path to the worktree
   * @param command - Optional custom command (defaults to auto-detection)
   */
  public async start(worktreeId: string, worktreePath: string, command?: string): Promise<void> {
    // Don't start if already running
    if (this.isRunning(worktreeId)) {
      console.warn("Dev server already running for worktree", worktreeId);
      return;
    }

    // Detect or use provided command
    const resolvedCommand = command ?? (await this.detectDevCommandAsync(worktreePath));

    if (!resolvedCommand) {
      this.updateState(worktreeId, {
        status: "error",
        errorMessage: "No dev script found in package.json",
      });
      this.emitError(worktreeId, "No dev script found in package.json");
      return;
    }

    console.log("Starting dev server", { worktreeId, command: resolvedCommand });

    // Update state to starting (clear any previous error)
    this.updateState(worktreeId, { status: "starting", errorMessage: undefined });

    // Clear and initialize log buffer for fresh start
    this.logBuffers.set(worktreeId, []);

    try {
      // Use execa for robust cross-platform process management
      // Note: execa v9 requires command as first arg, options as second
      const proc = execa(resolvedCommand, {
        shell: true,
        cwd: worktreePath,
        buffer: false, // Don't buffer - we stream stdout/stderr
        cleanup: true, // Kill on parent exit
        reject: false, // Handle non-zero exit ourselves
      });

      this.servers.set(worktreeId, proc);
      this.updateState(worktreeId, { pid: proc.pid });

      // Handle stdout for URL detection
      if (proc.stdout) {
        proc.stdout.on("data", (data: Buffer) => {
          const output = data.toString();
          this.appendLog(worktreeId, output);
          this.detectUrl(worktreeId, output);
        });
      }

      // Handle stderr (also check for URL as some servers output there)
      if (proc.stderr) {
        proc.stderr.on("data", (data: Buffer) => {
          const output = data.toString();
          this.appendLog(worktreeId, output);
          this.detectUrl(worktreeId, output);
        });
      }

      // Handle process completion
      proc
        .then((result: Result) => {
          console.log("Dev server exited", {
            worktreeId,
            exitCode: result.exitCode,
            signal: result.signal,
          });
          this.servers.delete(worktreeId);

          const currentState = this.states.get(worktreeId);

          // Only update to stopped if not already in error state
          if (currentState?.status !== "error") {
            const exitCode = result.exitCode ?? null;
            const signal = result.signal ?? null;

            if (
              exitCode !== 0 &&
              exitCode !== null &&
              signal !== "SIGTERM" &&
              signal !== "SIGKILL"
            ) {
              const errorMessage = `Process exited with code ${exitCode}`;
              this.updateState(worktreeId, {
                status: "error",
                errorMessage,
              });
              // Emit error event for observability (EventBuffer, EventInspector)
              this.emitError(worktreeId, errorMessage);
            } else {
              this.updateState(worktreeId, {
                status: "stopped",
                url: undefined,
                port: undefined,
                pid: undefined,
                errorMessage: undefined,
              });
            }
          }
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Unknown error";
          console.error("Dev server process error", { worktreeId, error: message });
          this.servers.delete(worktreeId);
          this.updateState(worktreeId, {
            status: "error",
            errorMessage: message,
          });
          this.emitError(worktreeId, message);
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to start dev server", { worktreeId, error: message });
      this.updateState(worktreeId, {
        status: "error",
        errorMessage: message,
      });
      this.emitError(worktreeId, message);
    }
  }

  /**
   * Stop a dev server for a worktree.
   */
  public async stop(worktreeId: string): Promise<void> {
    const proc = this.servers.get(worktreeId);

    if (!proc) {
      // No process - just reset state
      this.updateState(worktreeId, {
        status: "stopped",
        url: undefined,
        port: undefined,
        pid: undefined,
        errorMessage: undefined,
      });
      return;
    }

    console.log("Stopping dev server", { worktreeId, pid: proc.pid });

    return new Promise((resolve) => {
      // Set up force kill timer
      const forceKillTimer = setTimeout(() => {
        console.warn("Force killing dev server", { worktreeId });
        try {
          proc.kill("SIGKILL");
        } catch {
          // Process may have already exited
        }
      }, FORCE_KILL_TIMEOUT_MS);

      // Listen for process completion
      proc.finally(() => {
        clearTimeout(forceKillTimer);
        this.servers.delete(worktreeId);
        this.updateState(worktreeId, {
          status: "stopped",
          url: undefined,
          port: undefined,
          pid: undefined,
        });
        resolve();
      });

      // Try graceful shutdown first
      try {
        proc.kill("SIGTERM");
      } catch {
        // Process may have already exited
        clearTimeout(forceKillTimer);
        resolve();
      }
    });
  }

  /**
   * Toggle dev server state for a worktree.
   */
  public async toggle(worktreeId: string, worktreePath: string, command?: string): Promise<void> {
    const state = this.getState(worktreeId);

    if (state.status === "stopped" || state.status === "error") {
      await this.start(worktreeId, worktreePath, command);
    } else {
      await this.stop(worktreeId);
    }
  }

  /**
   * Stop all running dev servers.
   * Should be called on app shutdown.
   */
  public async stopAll(): Promise<void> {
    console.log("Stopping all dev servers", { count: this.servers.size });

    const promises = Array.from(this.servers.keys()).map((worktreeId) => this.stop(worktreeId));

    await Promise.all(promises);
    this.servers.clear();
    this.states.clear();
    this.logBuffers.clear();
  }

  /**
   * Get logs for a worktree's dev server.
   */
  public getLogs(worktreeId: string): string[] {
    return this.logBuffers.get(worktreeId) ?? [];
  }

  /**
   * Detect dev command from package.json scripts (async version).
   * Results are cached to avoid repeated disk I/O.
   */
  public async detectDevCommandAsync(worktreePath: string): Promise<string | null> {
    // Check cache first
    const cached = this.devScriptCache.get(worktreePath);
    if (cached && Date.now() - cached.checkedAt < DEV_SCRIPT_CACHE_TTL_MS) {
      return cached.command;
    }

    const packageJsonPath = path.join(worktreePath, "package.json");

    if (!existsSync(packageJsonPath)) {
      this.devScriptCache.set(worktreePath, {
        hasDevScript: false,
        command: null,
        checkedAt: Date.now(),
      });
      return null;
    }

    try {
      const content = await readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      const scripts = pkg.scripts || {};

      // Priority order for script detection
      const candidates = ["dev", "start:dev", "serve", "start"];

      for (const script of candidates) {
        if (scripts[script]) {
          const command = `npm run ${script}`;
          this.devScriptCache.set(worktreePath, {
            hasDevScript: true,
            command,
            checkedAt: Date.now(),
          });
          return command;
        }
      }

      this.devScriptCache.set(worktreePath, {
        hasDevScript: false,
        command: null,
        checkedAt: Date.now(),
      });
      return null;
    } catch {
      this.devScriptCache.set(worktreePath, {
        hasDevScript: false,
        command: null,
        checkedAt: Date.now(),
      });
      return null;
    }
  }

  /**
   * Check if a worktree has a detectable dev script (async version).
   */
  public async hasDevScriptAsync(worktreePath: string): Promise<boolean> {
    const command = await this.detectDevCommandAsync(worktreePath);
    return command !== null;
  }

  /**
   * Invalidate the dev script cache for a specific worktree.
   */
  public invalidateCache(worktreePath: string): void {
    this.devScriptCache.delete(worktreePath);
  }

  /**
   * Clear the entire dev script cache.
   */
  public clearCache(): void {
    this.devScriptCache.clear();
  }

  /**
   * Pre-warm the cache for multiple worktrees.
   */
  public async warmCache(worktreePaths: string[]): Promise<void> {
    await Promise.all(worktreePaths.map((path) => this.hasDevScriptAsync(path)));
  }

  /**
   * Update state and emit IPC event only if state actually changed.
   */
  private updateState(
    worktreeId: string,
    updates: Partial<Omit<DevServerState, "worktreeId">>
  ): void {
    const current = this.states.get(worktreeId) ?? {
      worktreeId,
      status: "stopped" as DevServerStatus,
    };
    const next: DevServerState = { ...current, ...updates };

    // Only emit if something actually changed
    const hasChanged =
      current.status !== next.status ||
      current.url !== next.url ||
      current.port !== next.port ||
      current.pid !== next.pid ||
      current.errorMessage !== next.errorMessage;

    if (hasChanged) {
      this.states.set(worktreeId, next);
      this.emitUpdate(next);
    }
  }

  /**
   * Emit state update via event bus.
   * IPC handlers subscribe to this event and forward to renderer.
   */
  private emitUpdate(state: DevServerState): void {
    // Emit through event bus for observability (EventBuffer, EventInspector)
    events.emit("server:update", {
      ...state,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit error via event bus.
   * IPC handlers subscribe to this event and forward to renderer.
   */
  private emitError(worktreeId: string, error: string): void {
    events.emit("server:error", {
      worktreeId,
      error,
      timestamp: Date.now(),
    });
  }

  /**
   * Append output to log buffer (with size limit).
   */
  private appendLog(worktreeId: string, output: string): void {
    const logs = this.logBuffers.get(worktreeId) ?? [];

    // Split by newlines and add each line
    const lines = output.split("\n").filter((line) => line.trim());
    logs.push(...lines);

    // Trim to max size
    if (logs.length > MAX_LOG_LINES) {
      logs.splice(0, logs.length - MAX_LOG_LINES);
    }

    this.logBuffers.set(worktreeId, logs);

    // Update state with latest logs (don't emit event for log-only updates)
    const current = this.states.get(worktreeId);
    if (current) {
      this.states.set(worktreeId, { ...current, logs });
    }
  }

  /**
   * Detect URL from server output.
   */
  private detectUrl(worktreeId: string, output: string): void {
    const currentState = this.states.get(worktreeId);

    // Only detect URL if we're in starting state
    if (currentState?.status !== "starting") {
      return;
    }

    // Try URL patterns first
    for (const pattern of URL_PATTERNS) {
      const match = output.match(pattern);
      if (match?.[1]) {
        let url = match[1];

        // If just a port number, construct URL
        if (/^\d+$/.test(url)) {
          url = `http://localhost:${url}`;
        }

        // Extract port from URL
        const portMatch = url.match(/:(\d+)/);
        const port = portMatch ? parseInt(portMatch[1], 10) : undefined;

        console.log("Detected dev server URL", { worktreeId, url, port });

        this.updateState(worktreeId, {
          status: "running",
          url,
          port,
          errorMessage: undefined,
        });
        return;
      }
    }

    // Try port-only patterns
    for (const pattern of PORT_PATTERNS) {
      const match = output.match(pattern);
      if (match?.[1]) {
        const port = parseInt(match[1], 10);
        const url = `http://localhost:${port}`;

        console.log("Detected dev server port", { worktreeId, url, port });

        this.updateState(worktreeId, {
          status: "running",
          url,
          port,
          errorMessage: undefined,
        });
        return;
      }
    }
  }
}
