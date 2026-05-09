import * as pty from "node-pty";
import type { IDisposable } from "node-pty";
import os from "os";
import { getDefaultShell, getDefaultShellArgs } from "./pty/terminalShell.js";
import {
  filterEnvironment,
  filterSensitiveOnly,
  ensureUtf8Locale,
} from "./pty/EnvironmentFilter.js";
import { POOL_ENV_EMPTY_HASH } from "./pty/ptyPoolEnvHash.js";

export interface PtyPoolConfig {
  poolSize?: number;
  defaultCwd?: string;
  /**
   * Hard cap on total pool entries across all (cwd, envHash) keys. LRU
   * eviction kicks in when warming would exceed this. Each node-pty process
   * is roughly 50-80 MB; the default cap (8) bounds overhead at ~640 MB
   * across the 2-4 active pool keys we expect at steady state.
   */
  maxEntries?: number;
}

interface PooledPty {
  process: pty.IPty;
  cwd: string;
  envHash: string;
  poolKey: string;
  env: Record<string, string>;
  createdAt: number;
  dataDisposable: IDisposable;
  /**
   * Bounded buffer of shell-init output (banner, MOTD, first prompt) emitted
   * before this entry was acquired. Replayed on acquire so the consumer's
   * xterm sees the prompt the user expects. Without this, fast Macs that
   * pre-warm the pool before the first openTerminal call would hand out a
   * shell that has already finished printing — the renderer xterm attaches
   * after the prompt and stays blank. See PR for #7625.
   */
  prelude: string;
}

const DEFAULT_POOL_SIZE = 2;
const DEFAULT_MAX_ENTRIES = 8;
/**
 * Cap on bytes of pre-acquire shell output buffered per pool entry. Sized to
 * comfortably hold zsh/bash MOTD + prompt (typically <1 KB) while bounding
 * memory if a noisy `.zshrc` keeps writing. Anything past the cap is silently
 * dropped, which matches the prior (unbuffered) behaviour for that overflow.
 */
const PRELUDE_BYTE_CAP = 64 * 1024;

export interface AcquiredPty {
  process: pty.IPty;
  /** Bytes the pooled shell emitted before acquire. May be empty. */
  prelude: string;
}

function makePoolKey(cwd: string, envHash: string): string {
  return `${cwd}\0${envHash}`;
}

export class PtyPool {
  private pool: Map<string, PooledPty> = new Map();
  private readonly poolSize: number;
  private readonly maxEntries: number;
  private readonly defaultShell: string;
  private defaultCwd: string;
  private isDisposed = false;
  private refillInProgress = false;
  /**
   * Set of pool keys currently being warmed via warmForKey. Prevents stampede
   * when concurrent acquire-misses for the same (cwd, envHash) all attempt to
   * warm a fresh slot.
   */
  private readonly warmsInFlight: Set<string> = new Set();
  /**
   * Generation counter incremented on each drainAndRefill() call.
   * Captured in createPoolEntry closures so async spawns from a prior
   * drain cycle can be rejected instead of registering at the new cwd.
   */
  private drainEpoch = 0;

  constructor(config: PtyPoolConfig = {}) {
    this.poolSize = this.resolvePoolSize(config.poolSize);
    this.maxEntries = this.resolveMaxEntries(config.maxEntries);
    this.defaultCwd = this.resolveCwd(config.defaultCwd, os.homedir());
    this.defaultShell = getDefaultShell();
  }

  async warmPool(cwd?: string): Promise<void> {
    if (this.isDisposed) {
      console.warn("[PtyPool] Cannot warm pool - already disposed");
      return;
    }

    if (cwd !== undefined) {
      const nextCwd = cwd.trim();
      if (!nextCwd) {
        console.warn("[PtyPool] Ignoring empty cwd override");
      } else {
        this.defaultCwd = nextCwd;
      }
    }

    const promises: Promise<void>[] = [];
    const existing = this.countEntriesForKey(this.defaultCwd, POOL_ENV_EMPTY_HASH);
    const needed = this.poolSize - existing;

    for (let i = 0; i < needed; i++) {
      promises.push(this.createPoolEntry(this.defaultCwd, undefined, POOL_ENV_EMPTY_HASH));
    }

    await Promise.all(promises);

    if (process.env.DAINTREE_VERBOSE) {
      console.log(
        `[PtyPool] Warmed ${needed} terminals in ${this.defaultCwd} (pool size: ${this.pool.size})`
      );
    }
  }

  private async createPoolEntry(
    cwd: string,
    callerEnv: Record<string, string> | undefined,
    envHash: string
  ): Promise<void> {
    if (this.isDisposed) return;

    // Capture the current drain epoch. If it changes before we finish
    // registering this entry, a drainAndRefill() happened and this spawn
    // is stale — kill it instead of registering at the wrong cwd.
    const epoch = this.drainEpoch;
    const poolKey = makePoolKey(cwd, envHash);

    // Evict an idle entry if we're at the global cap. We evict from a
    // *different* key when possible so the warm we're about to perform
    // actually grows this key's slot count.
    this.evictIfAtCapacity(poolKey);

    try {
      const id = `pool-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const env = this.buildSpawnEnv(callerEnv);

      const ptyProcess = pty.spawn(this.defaultShell, getDefaultShellArgs(this.defaultShell), {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd,
        env,
      });

      // Hold a reference so the data listener can append into the same entry
      // without a Map lookup on every chunk.
      const entryRef: { current: PooledPty | null } = { current: null };
      const dataDisposable = ptyProcess.onData((data) => {
        const entry = entryRef.current;
        if (!entry) return;
        if (entry.prelude.length >= PRELUDE_BYTE_CAP) return;
        const remaining = PRELUDE_BYTE_CAP - entry.prelude.length;
        entry.prelude += data.length <= remaining ? data : data.slice(0, remaining);
      });

      ptyProcess.onExit(({ exitCode }) => {
        if (process.env.DAINTREE_VERBOSE) {
          console.log(`[PtyPool] Pooled PTY ${id} exited with code ${exitCode}`);
        }
        const entry = this.pool.get(id);
        if (!entry) {
          // Entry was already removed (drain, evict, or acquire path). Those
          // paths handle their own followup; refilling here would race them.
          return;
        }
        entry.dataDisposable.dispose();
        this.pool.delete(id);
        // Skip refill if this entry belonged to a prior drain cycle — a
        // newer drainAndRefill() already initiated its own refill.
        if (!this.isDisposed && this.drainEpoch === epoch) {
          this.refillPool();
        }
      });

      if (this.isDisposed || this.drainEpoch !== epoch) {
        dataDisposable.dispose();
        try {
          ptyProcess.kill();
        } catch {
          // already dead
        }
        return;
      }

      const entry: PooledPty = {
        process: ptyProcess,
        cwd,
        envHash,
        poolKey,
        env,
        createdAt: Date.now(),
        dataDisposable,
        prelude: "",
      };
      entryRef.current = entry;
      this.pool.set(id, entry);

      if (process.env.DAINTREE_VERBOSE) {
        console.log(
          `[PtyPool] Created pooled PTY ${id} for key ${poolKey}, pool size: ${this.pool.size}`
        );
      }
    } catch (error) {
      console.error("[PtyPool] Failed to create pool entry:", error);
    }
  }

  /**
   * Backward-compatible zero-arg acquire — used only by tests and legacy
   * callers. Internally targets the env-empty key at the pool's default cwd.
   */
  acquire(): AcquiredPty | null {
    return this.acquireByKey(this.defaultCwd, POOL_ENV_EMPTY_HASH);
  }

  /**
   * Acquire a pre-warmed PTY for a specific (cwd, envHash) key. Returns null
   * if no matching entry exists. Triggers a background refill of the same key
   * so the next acquire is also instant.
   *
   * The returned `prelude` is whatever the pooled shell printed before
   * acquire (banner, MOTD, first prompt). Callers MUST replay this through
   * the renderer's data path or the user will see a blank pane until they
   * type something — see #7625 for the failure mode this prevents.
   */
  acquireByKey(cwd: string, envHash: string): AcquiredPty | null {
    if (this.isDisposed) {
      console.warn("[PtyPool] Cannot acquire - pool disposed");
      return null;
    }

    const wantedKey = makePoolKey(cwd, envHash);
    let matched: { id: string; entry: PooledPty } | null = null;
    for (const [id, entry] of this.pool) {
      if (entry.poolKey === wantedKey) {
        matched = { id, entry };
        break;
      }
    }

    if (!matched) {
      if (process.env.DAINTREE_VERBOSE) {
        console.log(`[PtyPool] Miss on key ${wantedKey}; pool size: ${this.pool.size}`);
      }
      return null;
    }

    const { id, entry } = matched;
    this.pool.delete(id);

    try {
      const pid = entry.process.pid;
      if (pid === undefined) {
        console.warn(`[PtyPool] Pooled PTY ${id} has no PID (already dead), discarding`);
        entry.dataDisposable.dispose();
        this.warmForKey(cwd, entry.env, envHash);
        return null;
      }
    } catch (error) {
      console.warn(`[PtyPool] Pooled PTY ${id} health check failed:`, error);
      entry.dataDisposable.dispose();
      this.warmForKey(cwd, entry.env, envHash);
      return null;
    }

    entry.dataDisposable.dispose();
    const prelude = entry.prelude;

    if (process.env.DAINTREE_VERBOSE) {
      console.log(
        `[PtyPool] Acquired PTY ${id} for key ${wantedKey} (prelude=${prelude.length}B), ${this.pool.size} remaining`
      );
    }

    // Refill the same key so the next acquire is also instant. Fire-and-
    // forget — the spawn races shell init with the user typing, and either
    // way is fine.
    this.warmForKey(cwd, entry.env, envHash);

    return { process: entry.process, prelude };
  }

  /**
   * Fire-and-forget warm of a single (cwd, envHash) slot. Idempotent under
   * concurrent calls for the same key — the `warmsInFlight` guard prevents
   * stampede when many acquires miss simultaneously.
   *
   * `callerEnv` is the raw `options.env` from the spawn request (pre-filter,
   * pre-DAINTREE-metadata). `buildSpawnEnv` filters and finalises it.
   */
  warmForKey(cwd: string, callerEnv: Record<string, string> | undefined, envHash: string): void {
    if (this.isDisposed) return;

    const key = makePoolKey(cwd, envHash);
    if (this.warmsInFlight.has(key)) return;
    if (this.countEntriesForKey(cwd, envHash) >= this.poolSize) return;

    this.warmsInFlight.add(key);
    this.createPoolEntry(cwd, callerEnv, envHash)
      .catch((err) => {
        console.error(`[PtyPool] Failed to warm key ${key}:`, err);
      })
      .finally(() => {
        this.warmsInFlight.delete(key);
      });
  }

  refillPool(): void {
    if (this.isDisposed || this.refillInProgress) {
      return;
    }

    const existing = this.countEntriesForKey(this.defaultCwd, POOL_ENV_EMPTY_HASH);
    const needed = this.poolSize - existing;
    if (needed <= 0) {
      return;
    }

    this.refillInProgress = true;

    const promises: Promise<void>[] = [];
    for (let i = 0; i < needed; i++) {
      promises.push(this.createPoolEntry(this.defaultCwd, undefined, POOL_ENV_EMPTY_HASH));
    }

    Promise.all(promises)
      .then(() => {
        if (process.env.DAINTREE_VERBOSE) {
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

  /** Returns the cwd currently used to spawn new pool entries. */
  getDefaultCwd(): string {
    return this.defaultCwd;
  }

  /**
   * Drain existing pooled entries and refill at a new cwd.
   *
   * Callers use this when the active project changes so pooled shells
   * are pre-positioned at the project root (via node-pty's spawn cwd,
   * which kernel-level chdirs before exec) rather than relying on a
   * fragile shell-level `cd` write after acquire.
   *
   * Race protection: an epoch counter is captured into every in-flight
   * createPoolEntry() closure. Bumping the epoch here causes any pending
   * spawns from the previous cycle to reject instead of registering at
   * the stale cwd. It also suppresses the onExit→refill cascade of the
   * entries we're killing.
   */
  async drainAndRefill(cwd: string): Promise<void> {
    if (this.isDisposed) {
      console.warn("[PtyPool] Cannot drainAndRefill - pool disposed");
      return;
    }

    const nextCwd = this.resolveCwd(cwd, "");
    if (!nextCwd) {
      console.warn("[PtyPool] Ignoring blank cwd in drainAndRefill");
      return;
    }

    if (
      nextCwd === this.defaultCwd &&
      this.countEntriesForKey(nextCwd, POOL_ENV_EMPTY_HASH) >= this.poolSize
    ) {
      // Already at the requested cwd and the env-empty key is fully warmed —
      // nothing to do. (Other env-keyed entries from prior agent launches may
      // exist and stay; they'll be evicted naturally by LRU as needed.)
      return;
    }

    // Bump epoch BEFORE killing so onExit handlers (and any in-flight
    // createPoolEntry promises) see the mismatch and skip refilling.
    this.drainEpoch++;
    this.defaultCwd = nextCwd;

    const snapshot = Array.from(this.pool.values());
    this.pool.clear();

    for (const entry of snapshot) {
      try {
        entry.dataDisposable.dispose();
      } catch {
        // ignore
      }
      try {
        entry.process.kill();
      } catch (error) {
        if (process.env.DAINTREE_VERBOSE) {
          console.warn("[PtyPool] Error killing pooled PTY during drain:", error);
        }
      }
    }

    if (process.env.DAINTREE_VERBOSE) {
      console.log(
        `[PtyPool] Drained ${snapshot.length} entries; refilling at ${nextCwd} (epoch ${this.drainEpoch})`
      );
    }

    await this.warmPool();
  }

  getPoolSize(): number {
    return this.pool.size;
  }

  getMaxPoolSize(): number {
    return this.poolSize;
  }

  getMaxEntries(): number {
    return this.maxEntries;
  }

  /** Number of entries currently held for a specific (cwd, envHash) key. */
  countEntriesForKey(cwd: string, envHash: string): number {
    const key = makePoolKey(cwd, envHash);
    let count = 0;
    for (const entry of this.pool.values()) {
      if (entry.poolKey === key) count++;
    }
    return count;
  }

  dispose(): void {
    if (this.isDisposed) return;

    this.isDisposed = true;

    for (const [id, entry] of this.pool) {
      try {
        entry.dataDisposable.dispose();
        entry.process.kill();
        if (process.env.DAINTREE_VERBOSE) {
          console.log(`[PtyPool] Killed pooled PTY ${id}`);
        }
      } catch (error) {
        console.warn(`[PtyPool] Error killing pooled PTY ${id}:`, error);
      }
    }

    this.pool.clear();
    console.log("[PtyPool] Disposed");
  }

  /**
   * If the pool is at the global cap, evict the oldest entry whose key does
   * NOT match `incomingKey` (so the warm we're about to do actually grows
   * that key's count). If only same-key entries exist, fall back to evicting
   * the oldest of those — the slot count for that key stays equal post-warm.
   */
  private evictIfAtCapacity(incomingKey: string): void {
    if (this.pool.size < this.maxEntries) return;

    let victim: { id: string; entry: PooledPty } | null = null;
    let fallbackVictim: { id: string; entry: PooledPty } | null = null;
    for (const [id, entry] of this.pool) {
      if (entry.poolKey !== incomingKey) {
        if (!victim || entry.createdAt < victim.entry.createdAt) {
          victim = { id, entry };
        }
      } else if (!fallbackVictim || entry.createdAt < fallbackVictim.entry.createdAt) {
        fallbackVictim = { id, entry };
      }
    }

    const chosen = victim ?? fallbackVictim;
    if (!chosen) return;

    this.pool.delete(chosen.id);
    try {
      chosen.entry.dataDisposable.dispose();
    } catch {
      // ignore
    }
    try {
      chosen.entry.process.kill();
    } catch {
      // already dead
    }

    if (process.env.DAINTREE_VERBOSE) {
      console.log(
        `[PtyPool] Evicted ${chosen.id} (key ${chosen.entry.poolKey}) to make room for ${incomingKey}`
      );
    }
  }

  /**
   * Build the env that's actually written into the spawned shell.
   *
   * Two different filter strengths are applied:
   *
   *   - **Inherited `process.env`** runs through the full `filterEnvironment`,
   *     which strips both sensitive vars AND `DAINTREE_*` keys. The latter is
   *     anti-spoofing: only `injectDaintreeMetadata` (fresh-spawn path) is
   *     allowed to set DAINTREE_*; anything inherited from the OS env is
   *     dropped.
   *
   *   - **Caller `options.env`** runs through `filterSensitiveOnly`, which
   *     strips only credentials. Pool entries outlive a single acquire, so a
   *     shell warmed with one caller's secrets could be handed to a future
   *     caller whose hash matches — filtering at warm time guarantees no
   *     secret persists in an idle pool process. But `DAINTREE_*` keys are
   *     **kept** here: the caller is intentionally setting them (e.g. e2e
   *     presets pass DAINTREE_E2E_AGENT_COLOR through so the agent CLI can
   *     read it). Stripping them caused #7625-class regressions where the
   *     pool key collapsed to env-empty and warm shells were served without
   *     the caller's metadata.
   *
   * DAINTREE_* metadata for live panes (PANE_ID, CWD, PROJECT_ID, WORKTREE_ID)
   * is NOT injected here — pool entries don't have a paneId until acquire
   * time, and that metadata is meaningful only for the assigned terminal.
   */
  private buildSpawnEnv(callerEnv: Record<string, string> | undefined): Record<string, string> {
    const filtered = filterEnvironment(process.env as Record<string, string | undefined>);

    if (callerEnv) {
      Object.assign(filtered, filterSensitiveOnly(callerEnv));
    }

    // TUI reliability: ensure rich terminal capabilities for Claude/Gemini CLIs.
    // Mirrors `buildTerminalEnv` so agent CLIs get the same color-rendering
    // hints whether they spawn fresh or come out of the pool.
    filtered.TERM = "xterm-256color";
    filtered.FORCE_COLOR = filtered.FORCE_COLOR ?? "3";
    filtered.COLORTERM = "truecolor";

    // Avoid tools treating the environment as CI/non-interactive
    delete filtered.CI;

    return ensureUtf8Locale(filtered);
  }

  private resolvePoolSize(poolSize: number | undefined): number {
    if (
      typeof poolSize === "number" &&
      Number.isInteger(poolSize) &&
      Number.isFinite(poolSize) &&
      poolSize > 0
    ) {
      return poolSize;
    }
    return DEFAULT_POOL_SIZE;
  }

  private resolveMaxEntries(maxEntries: number | undefined): number {
    if (
      typeof maxEntries === "number" &&
      Number.isInteger(maxEntries) &&
      Number.isFinite(maxEntries) &&
      maxEntries > 0
    ) {
      return Math.max(maxEntries, this.poolSize);
    }
    return Math.max(DEFAULT_MAX_ENTRIES, this.poolSize);
  }

  private resolveCwd(cwd: string | undefined, fallback: string): string {
    if (typeof cwd !== "string") {
      return fallback;
    }
    const trimmed = cwd.trim();
    return trimmed || fallback;
  }
}

let ptyPoolInstance: PtyPool | null = null;

export function getPtyPool(config?: PtyPoolConfig): PtyPool {
  if (!ptyPoolInstance) {
    ptyPoolInstance = new PtyPool(config);
  }
  return ptyPoolInstance;
}

export function disposePtyPool(): void {
  if (ptyPoolInstance) {
    ptyPoolInstance.dispose();
    ptyPoolInstance = null;
  }
}
