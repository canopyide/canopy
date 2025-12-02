/** Pre-warms terminal PTYs for instant spawning */

import * as pty from "node-pty";
import type { IDisposable } from "node-pty";
import { existsSync } from "fs";
import os from "os";

export interface PtyPoolConfig {
  poolSize?: number;
  defaultCwd?: string;
}

interface PooledPty {
  process: pty.IPty;
  cwd: string;
  createdAt: number;
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

  /** Pre-fill pool */
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

  /** Create single pooled PTY */
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

      const dataDisposable = ptyProcess.onData(() => {
        // Suppress output
      });

      ptyProcess.onExit(({ exitCode }) => {
        if (process.env.CANOPY_VERBOSE) {
          console.log(`[PtyPool] Pooled PTY ${id} exited with code ${exitCode}`);
        }
        const entry = this.pool.get(id);
        if (entry) {
          entry.dataDisposable.dispose();
          this.pool.delete(id);
        }
        if (!this.isDisposed) {
          this.refillPool();
        }
      });

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

  /** Get PTY from pool (checks health) */
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

    const [id, entry] = this.pool.entries().next().value as [string, PooledPty];
    this.pool.delete(id);

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

    entry.dataDisposable.dispose();

    if (process.env.CANOPY_VERBOSE) {
      console.log(`[PtyPool] Acquired PTY ${id}, ${this.pool.size} remaining`);
    }

    this.refillPool();

    return entry.process;
  }

  /** Refill pool asynchronously */
  refillPool(): void {
    if (this.isDisposed || this.refillInProgress) {
      return;
    }

    const needed = this.poolSize - this.pool.size;
    if (needed <= 0) {
      return;
    }

    this.refillInProgress = true;

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

  /** Update default CWD */
  setDefaultCwd(cwd: string): void {
    this.defaultCwd = cwd;
  }

  /** Get current pool size */
  getPoolSize(): number {
    return this.pool.size;
  }

  /** Get max pool size */
  getMaxPoolSize(): number {
    return this.poolSize;
  }

  /** Clean up all PTYs */
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
        console.warn(`[PtyPool] Error killing pooled PTY ${id}:`, error);
      }
    }

    this.pool.clear();
    console.log("[PtyPool] Disposed");
  }

  /** Get platform default shell */
  private getDefaultShell(): string {
    if (process.platform === "win32") {
      return process.env.COMSPEC || "powershell.exe";
    }

    if (process.env.SHELL) {
      return process.env.SHELL;
    }

    const commonShells = ["/bin/zsh", "/bin/bash", "/bin/sh"];
    for (const shell of commonShells) {
      try {
        if (existsSync(shell)) {
          return shell;
        }
      } catch {
        // Continue
      }
    }

    return "/bin/sh";
  }

  /** Get shell args (login shell) */
  private getDefaultShellArgs(): string[] {
    const shellName = this.defaultShell.toLowerCase();

    if (process.platform !== "win32") {
      if (shellName.includes("zsh") || shellName.includes("bash")) {
        return ["-l"];
      }
    }

    return [];
  }

  /** Get user home dir */
  private getDefaultCwd(): string {
    return process.env.HOME || os.homedir();
  }

  /** Filter env vars */
  private getFilteredEnv(): Record<string, string> {
    const env = process.env as Record<string, string | undefined>;
    return Object.fromEntries(
      Object.entries(env).filter(([_, value]) => value !== undefined)
    ) as Record<string, string>;
  }
}

// Singleton instance
let ptyPoolInstance: PtyPool | null = null;

/** Get singleton */
export function getPtyPool(config?: PtyPoolConfig): PtyPool {
  if (!ptyPoolInstance) {
    ptyPoolInstance = new PtyPool(config);
  }
  return ptyPoolInstance;
}

/** Dispose singleton */
export function disposePtyPool(): void {
  if (ptyPoolInstance) {
    ptyPoolInstance.dispose();
    ptyPoolInstance = null;
  }
}
