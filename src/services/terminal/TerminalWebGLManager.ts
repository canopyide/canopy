import { WebglAddon } from "@xterm/addon-webgl";
import type { IDisposable } from "@xterm/xterm";
import type { ManagedTerminal } from "./types";

const WEBGL_DISABLED = import.meta.env.DAINTREE_DISABLE_WEBGL === "1";

interface WebGLEntry {
  addon: WebglAddon;
  contextLossDisposable: IDisposable;
}

export class TerminalWebGLManager {
  // Chromium caps active WebGL contexts at 16 per renderer process.
  // Reserve 4 slots for potential non-terminal WebGL consumers in the
  // main renderer (browser/dev-preview panels are process-isolated via
  // <webview> partitions and have their own budgets).
  private static _maxContexts = 12;

  // Circuit breaker: if N genuine context-loss events occur within W ms,
  // disable WebGL for the rest of the session to avoid strobing reacquisition
  // on systems with persistent GPU faults (e.g. M-series Macs on external
  // displays at fractional scaling).
  private static readonly LOSS_THRESHOLD = 3;
  private static readonly LOSS_WINDOW_MS = 60_000;

  // When the bulk-creation path overflows Chromium's 16-context cap, the
  // upstream addon's 3000ms timer fires for every evicted addon at once —
  // so loss events arrive in a tight cluster (~ms apart). Collapse a cluster
  // of clustered losses into a single timestamp so the wave doesn't itself
  // trip the breaker. Persistent GPU faults produce losses far apart in
  // time and are not affected.
  private static readonly LOSS_CLUSTER_MS = 500;

  // Drain pending ensureContext requests in batches of this size per macrotask.
  // Spreads WebglAddon construction across separate event-loop ticks so a burst
  // of bulk-creation requests never overflows Chromium's 16-context cap in a
  // single synchronous pass. Matches QUEUE_CONCURRENCY in BulkCreateWorktreeDialog.
  private static readonly CONTEXTS_PER_DRAIN = 3;

  static get MAX_CONTEXTS(): number {
    return TerminalWebGLManager._maxContexts;
  }

  static setMaxContexts(n: number): void {
    TerminalWebGLManager._maxContexts = Math.max(1, n);
  }

  private pool = new Map<string, WebGLEntry>();
  private lruOrder: string[] = [];
  private hardwareAvailable = true;
  private hasLoggedSoftwareSkip = false;
  private lossTimestamps: number[] = [];
  private hasLoggedBreakerTrip = false;

  // Pending requests are drained asynchronously to spread allocations across
  // event-loop ticks (see CONTEXTS_PER_DRAIN). Insertion order is the drain order.
  private pending = new Map<string, ManagedTerminal>();
  private drainScheduled = false;
  // Timestamp of the most recent recorded loss. Used together with
  // LOSS_CLUSTER_MS to collapse clustered upstream loss events that all
  // belong to the same burst-overflow wave.
  private lastLossAt: number | null = null;

  setHardwareAvailable(available: boolean): void {
    this.hardwareAvailable = available;
  }

  ensureContext(id: string, managed: ManagedTerminal): void {
    if (WEBGL_DISABLED) return;
    if (!this.hardwareAvailable) {
      if (!this.hasLoggedSoftwareSkip && !this.hasLoggedBreakerTrip) {
        console.warn("[TerminalWebGLManager] Skipping WebGL: software-only GPU detected");
        this.hasLoggedSoftwareSkip = true;
      }
      return;
    }
    if (!managed.isOpened) return;

    if (this.pool.has(id)) {
      this.moveLruToEnd(id);
      return;
    }

    // Coalesce: a repeated enqueue for the same id keeps the latest managed ref.
    this.pending.set(id, managed);
    this.scheduleDrain();
  }

  releaseContext(id: string): void {
    this.pending.delete(id);
    if (this.pool.has(id)) {
      this.doRelease(id);
    }
  }

  isActive(id: string): boolean {
    return this.pool.has(id);
  }

  onTerminalDestroyed(id: string): void {
    this.pending.delete(id);
    const entry = this.pool.get(id);
    if (entry) {
      try {
        entry.contextLossDisposable.dispose();
      } catch {
        // ignore
      }
      this.pool.delete(id);
      this.removeFromLru(id);
    }
  }

  dispose(): void {
    this.pending.clear();
    for (const id of [...this.pool.keys()]) {
      this.doRelease(id);
    }
  }

  private scheduleDrain(): void {
    if (this.drainScheduled) return;
    this.drainScheduled = true;
    // setTimeout(0) (not queueMicrotask) — we need a fresh macrotask so React
    // batched state updates and rAF callbacks that all called ensureContext
    // in the same task don't end up constructing every WebglAddon back-to-back.
    setTimeout(() => this.drainNext(), 0);
  }

  private drainNext(): void {
    this.drainScheduled = false;
    if (this.pending.size === 0) return;

    let processed = 0;
    for (const [id, managed] of this.pending) {
      if (processed >= TerminalWebGLManager.CONTEXTS_PER_DRAIN) break;
      this.pending.delete(id);
      processed++;

      // Re-check liveness at drain time — the terminal may have been destroyed,
      // closed, or already reacquired through another path between enqueue and now.
      if (!this.hardwareAvailable) continue;
      if (!managed.isOpened) continue;
      if (this.pool.has(id)) {
        this.moveLruToEnd(id);
        continue;
      }

      this.allocateContext(id, managed);
    }

    if (this.pending.size > 0) {
      this.scheduleDrain();
    }
  }

  private allocateContext(id: string, managed: ManagedTerminal): void {
    if (this.pool.size >= TerminalWebGLManager.MAX_CONTEXTS) {
      const evictId = this.lruOrder[0];
      if (evictId) {
        this.doRelease(evictId);
      }
    }

    let addon: WebglAddon | null = null;
    let clDisposable: IDisposable | null = null;
    try {
      addon = new WebglAddon();
      const ownAddon = addon;
      clDisposable = addon.onContextLoss(() => {
        if (this.pool.get(id)?.addon === ownAddon) {
          // record before release; pool entry still valid here
          this.recordContextLoss();
          this.releaseContext(id);
        }
      });
      managed.terminal.loadAddon(addon);
      this.pool.set(id, { addon, contextLossDisposable: clDisposable });
      this.lruOrder.push(id);
    } catch {
      try {
        clDisposable?.dispose();
      } catch {
        // ignore
      }
      try {
        addon?.dispose();
      } catch {
        // ignore
      }
    }
  }

  private doRelease(id: string): void {
    const entry = this.pool.get(id);
    if (!entry) return;

    this.pool.delete(id);
    this.removeFromLru(id);

    try {
      entry.contextLossDisposable.dispose();
    } catch {
      // ignore
    }
    try {
      entry.addon.dispose();
    } catch {
      // ignore
    }
  }

  private recordContextLoss(): void {
    const now = Date.now();

    // Cluster collapse: when bulk-creation overflows Chromium's 16-context
    // cap, the upstream addon's 3000ms timer fires for every evicted addon
    // at once. Treat losses arriving within LOSS_CLUSTER_MS of the previous
    // one as the same wave, recording at most one timestamp per cluster.
    if (
      this.lastLossAt !== null &&
      now - this.lastLossAt < TerminalWebGLManager.LOSS_CLUSTER_MS
    ) {
      this.lastLossAt = now;
      return;
    }
    this.lastLossAt = now;

    this.lossTimestamps = this.lossTimestamps.filter(
      (t) => now - t < TerminalWebGLManager.LOSS_WINDOW_MS
    );
    this.lossTimestamps.push(now);
    if (this.lossTimestamps.length >= TerminalWebGLManager.LOSS_THRESHOLD) {
      this.setHardwareAvailable(false);
      if (!this.hasLoggedBreakerTrip) {
        console.warn(
          "[TerminalWebGLManager] WebGL circuit breaker tripped — falling back to DOM renderer"
        );
        this.hasLoggedBreakerTrip = true;
      }
    }
  }

  private moveLruToEnd(id: string): void {
    const idx = this.lruOrder.indexOf(id);
    if (idx !== -1) {
      this.lruOrder.splice(idx, 1);
    }
    this.lruOrder.push(id);
  }

  private removeFromLru(id: string): void {
    const idx = this.lruOrder.indexOf(id);
    if (idx !== -1) {
      this.lruOrder.splice(idx, 1);
    }
  }
}
