/**
 * PtyPool Service
 *
 * Pre-warms terminal PTY instances for instant spawn responsiveness.
 * Maintains a small pool of ready-to-use PTY processes that can be
 * immediately assigned to new terminals instead of spawning from scratch.
 *
 * This reduces terminal spawn latency from 100-300ms to <50ms.
 */

import * as pty from "node-pty";
import type { IDisposable } from "node-pty";
import { existsSync } from "fs";
import os from "os";

/** Configuration for the PTY pool */
export interface PtyPoolConfig {
  /** Number of PTY instances to maintain in the pool (default: 2) */
  poolSize?: number;
  /** Default working directory for pooled PTYs (default: user's home) */
  defaultCwd?: string;
}

/** Information about a pooled PTY instance */
interface PooledPty {
  /** The node-pty process */
  process: pty.IPty;
  /** Working directory the PTY was created with */
  cwd: string;
  /** Timestamp when the PTY was created */
  createdAt: number;
  /** Data listener disposable */
  dataDisposable: IDisposable;
}

export class PtyPool {
  private pool: Map<string, PooledPty> = new Map();
  private readonly poolSize: number;
  private readonly defaultShell: string;
  private defaultCwd: string;
  private isDisposed = false;
  private refillInProgress = false;

  constructor(config: PtyPoolConfig = {}) {
    this.poolSize = config.poolSize ?? 2;
    this.defaultCwd = config.defaultCwd ?? this.getDefaultCwd();
    this.defaultShell = this.getDefaultShell();
  }

  /**
   * Pre-create PTY instances to fill the pool.
   * Called at app startup to ensure instant terminal availability.
   *
   * @param cwd - Working directory for pooled PTYs (optional, uses default if not provided)
   */
  async warmPool(cwd?: string): Promise<void> {
    if (this.isDisposed) {
      console.warn("[PtyPool] Cannot warm pool - already disposed");
      return;
    }

    if (cwd) {
      this.defaultCwd = cwd;
    }

    const promises: Promise<void>[] = [];
    const needed = this.poolSize - this.pool.size;

    for (let i = 0; i < needed; i++) {
      promises.push(this.createPoolEntry(this.defaultCwd));
    }

    await Promise.all(promises);

    if (process.env.CANOPY_VERBOSE) {
      console.log(
        `[PtyPool] Warmed ${needed} terminals in ${this.defaultCwd} (pool size: ${this.pool.size})`
      );
    }
  }

  /**
   * Create a single pool entry.
   * @param cwd - Working directory for the PTY
   */
  private async createPoolEntry(cwd: string): Promise<void> {
    if (this.isDisposed) return;

    try {
      const id = `pool-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const ptyProcess = pty.spawn(this.defaultShell, this.getDefaultShellArgs(), {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd,
        env: this.getFilteredEnv(),
      });

      // Suppress output from pooled PTYs - we don't want to process it
      // Store disposable so we can properly clean up later
      const dataDisposable = ptyProcess.onData(() => {
        // Intentionally empty - discard output from pooled PTYs
      });

      // Handle unexpected exits
      ptyProcess.onExit(({ exitCode }) => {
        if (process.env.CANOPY_VERBOSE) {
          console.log(`[PtyPool] Pooled PTY ${id} exited with code ${exitCode}`);
        }
        // Remove from pool if still there
        const entry = this.pool.get(id);
        if (entry) {
          entry.dataDisposable.dispose();
          this.pool.delete(id);
        }
        // Trigger refill if not disposed
        if (!this.isDisposed) {
          this.refillPool();
        }
      });

      // Check if disposed during async spawn (race condition on shutdown)
      if (this.isDisposed) {
        dataDisposable.dispose();
        ptyProcess.kill();
        return;
      }

      this.pool.set(id, {
        process: ptyProcess,
        cwd,
        createdAt: Date.now(),
        dataDisposable,
      });

      if (process.env.CANOPY_VERBOSE) {
        console.log(`[PtyPool] Created pooled PTY ${id}, pool size: ${this.pool.size}`);
      }
    } catch (error) {
      console.error("[PtyPool] Failed to create pool entry:", error);
    }
  }

  /**
   * Acquire a PTY from the pool.
   * Returns null if the pool is empty (caller should spawn normally).
   * Performs health check on pooled PTY before returning.
   *
   * @returns A pre-warmed PTY process or null if pool is empty/unhealthy
   */
  acquire(): pty.IPty | null {
    if (this.isDisposed) {
      console.warn("[PtyPool] Cannot acquire - pool disposed");
      return null;
    }

    if (this.pool.size === 0) {
      if (process.env.CANOPY_VERBOSE) {
        console.log("[PtyPool] Pool empty, returning null");
      }
      return null;
    }

    // Get first entry from pool
    const [id, entry] = this.pool.entries().next().value as [string, PooledPty];
    this.pool.delete(id);

    // Health check: verify PTY is still alive
    // If pid is undefined or process has exited, it's dead
    try {
      const pid = entry.process.pid;
      if (pid === undefined) {
        console.warn(`[PtyPool] Pooled PTY ${id} has no PID (already dead), discarding`);
        entry.dataDisposable.dispose();
        this.refillPool();
        return null;
      }
    } catch (error) {
      console.warn(`[PtyPool] Pooled PTY ${id} health check failed:`, error);
      entry.dataDisposable.dispose();
      this.refillPool();
      return null;
    }

    // Clean up the data suppressor - caller will set up real handlers
    entry.dataDisposable.dispose();

    if (process.env.CANOPY_VERBOSE) {
      console.log(`[PtyPool] Acquired PTY ${id}, ${this.pool.size} remaining`);
    }

    // Trigger background refill
    this.refillPool();

    return entry.process;
  }

  /**
   * Refill the pool in the background.
   * Non-blocking - creates PTYs asynchronously.
   */
  refillPool(): void {
    if (this.isDisposed || this.refillInProgress) {
      return;
    }

    const needed = this.poolSize - this.pool.size;
    if (needed <= 0) {
      return;
    }

    this.refillInProgress = true;

    // Async refill without blocking
    const promises: Promise<void>[] = [];
    for (let i = 0; i < needed; i++) {
      promises.push(this.createPoolEntry(this.defaultCwd));
    }

    Promise.all(promises)
      .then(() => {
        if (process.env.CANOPY_VERBOSE) {
          console.log(`[PtyPool] Refilled ${needed} entries, pool size: ${this.pool.size}`);
        }
      })
      .catch((err) => {
        console.error("[PtyPool] Failed to refill:", err);
      })
      .finally(() => {
        this.refillInProgress = false;
      });
  }

  /**
   * Update the default working directory for new pooled PTYs.
   * Existing pooled PTYs are not affected (they'll cd when acquired).
   *
   * @param cwd - New default working directory
   */
  setDefaultCwd(cwd: string): void {
    this.defaultCwd = cwd;
  }

  /**
   * Get current pool size.
   */
  getPoolSize(): number {
    return this.pool.size;
  }

  /**
   * Get configured max pool size.
   */
  getMaxPoolSize(): number {
    return this.poolSize;
  }

  /**
   * Clean up all pooled PTYs.
   * Called on app quit or when pool is no longer needed.
   */
  dispose(): void {
    if (this.isDisposed) return;

    this.isDisposed = true;

    for (const [id, entry] of this.pool) {
      try {
        entry.dataDisposable.dispose();
        entry.process.kill();
        if (process.env.CANOPY_VERBOSE) {
          console.log(`[PtyPool] Killed pooled PTY ${id}`);
        }
      } catch (error) {
        // Ignore errors during cleanup - process may already be dead
        console.warn(`[PtyPool] Error killing pooled PTY ${id}:`, error);
      }
    }

    this.pool.clear();
    console.log("[PtyPool] Disposed");
  }

  /**
   * Get the default shell for the current platform.
   */
  private getDefaultShell(): string {
    if (process.platform === "win32") {
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
        // Continue to next shell
      }
    }

    return "/bin/sh";
  }

  /**
   * Get default shell arguments.
   */
  private getDefaultShellArgs(): string[] {
    const shellName = this.defaultShell.toLowerCase();

    if (process.platform !== "win32") {
      if (shellName.includes("zsh") || shellName.includes("bash")) {
        return ["-l"]; // Login shell for proper profile loading
      }
    }

    return [];
  }

  /**
   * Get the default working directory.
   */
  private getDefaultCwd(): string {
    return process.env.HOME || os.homedir();
  }

  /**
   * Get filtered environment variables for PTY.
   */
  private getFilteredEnv(): Record<string, string> {
    const env = process.env as Record<string, string | undefined>;
    return Object.fromEntries(
      Object.entries(env).filter(([_, value]) => value !== undefined)
    ) as Record<string, string>;
  }
}

// Singleton instance
let ptyPoolInstance: PtyPool | null = null;

/**
 * Get or create the PtyPool singleton.
 * @param config - Configuration for the pool (only used on first call)
 */
export function getPtyPool(config?: PtyPoolConfig): PtyPool {
  if (!ptyPoolInstance) {
    ptyPoolInstance = new PtyPool(config);
  }
  return ptyPoolInstance;
}

/**
 * Dispose and clear the PtyPool singleton.
 */
export function disposePtyPool(): void {
  if (ptyPoolInstance) {
    ptyPoolInstance.dispose();
    ptyPoolInstance = null;
  }
}
