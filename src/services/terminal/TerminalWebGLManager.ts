import type { WebglAddon as WebglAddonType } from "@xterm/addon-webgl";
import type { IDisposable } from "@xterm/xterm";
import { getMaxContexts, setMaxContexts as setConfiguredMaxContexts } from "./TerminalWebGLConfig";
import type { ManagedTerminal } from "./types";

const WEBGL_DISABLED = import.meta.env.DAINTREE_DISABLE_WEBGL === "1";

type WebglAddonConstructor = new () => WebglAddonType;

// @xterm/addon-webgl loads via dynamic import so it stays out of the renderer's
// eager critical path. ensureContext() routes every new request through a
// requestAnimationFrame drain queue (one attach per frame): without that
// stagger, a burst of synchronous attaches during bulk worktree creation
// over-subscribes Chromium's 16-context-per-renderer cap, causing silent
// eviction of older contexts that then sit blank for 3s waiting on
// webglcontextrestored before xterm's onContextLoss fires (see #7467).
let WebglAddonClass: WebglAddonConstructor | null = null;
let webglAddonLoadPromise: Promise<WebglAddonConstructor> | null = null;

function loadWebglAddon(): Promise<WebglAddonConstructor> {
  if (WebglAddonClass) return Promise.resolve(WebglAddonClass);
  if (webglAddonLoadPromise) return webglAddonLoadPromise;
  webglAddonLoadPromise = import("@xterm/addon-webgl").then(
    (mod) => {
      WebglAddonClass = mod.WebglAddon as unknown as WebglAddonConstructor;
      return WebglAddonClass;
    },
    (err) => {
      // Allow a later ensureContext call to retry after a transient failure.
      webglAddonLoadPromise = null;
      throw err;
    }
  );
  return webglAddonLoadPromise;
}

interface WebGLEntry {
  addon: WebglAddonType;
  contextLossDisposable: IDisposable;
  captureDisposable: (() => void) | null;
}

export class TerminalWebGLManager {
  // Chromium caps active WebGL contexts at 16 per renderer process.
  // Reserve 4 slots for potential non-terminal WebGL consumers in the
  // main renderer (browser/dev-preview panels are process-isolated via
  // <webview> partitions and have their own budgets). The pool size lives
  // in TerminalWebGLConfig so the eager renderer chunk can adjust it
  // without dragging @xterm/addon-webgl into the entry bundle.

  // Circuit breaker: if N genuine context-loss events occur within W ms,
  // disable WebGL for the rest of the session to avoid strobing reacquisition
  // on systems with persistent GPU faults (e.g. M-series Macs on external
  // displays at fractional scaling).
  private static readonly LOSS_THRESHOLD = 3;
  private static readonly LOSS_WINDOW_MS = 60_000;

  static get MAX_CONTEXTS(): number {
    return getMaxContexts();
  }

  static setMaxContexts(n: number): void {
    setConfiguredMaxContexts(n);
  }

  private pool = new Map<string, WebGLEntry>();
  private lruOrder: string[] = [];
  private hardwareAvailable = true;
  private hasLoggedSoftwareSkip = false;
  private lossTimestamps: number[] = [];
  private hasLoggedBreakerTrip = false;
  // Queue of pending ensure requests: drained one-per-rAF so each context
  // allocation completes its GPU IPC roundtrip before the next is requested.
  private pendingEnsures = new Map<string, ManagedTerminal>();
  // Tracked separately from the rAF id: the "scheduled" flag has different
  // semantics than the cancellation handle when rAF runs synchronously (e.g.
  // under a test shim that invokes the callback inline).
  private pendingDrainScheduled = false;
  private pendingEnsureRafId: number | null = null;

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

    // Dedupe: latest request per id wins until the queue drains.
    this.pendingEnsures.set(id, managed);

    if (WebglAddonClass) {
      this.scheduleDrain();
      return;
    }

    void loadWebglAddon().then(
      () => this.scheduleDrain(),
      () => {
        // Retain pending; a subsequent ensureContext call will retry the load.
      }
    );
  }

  releaseContext(id: string): void {
    this.pendingEnsures.delete(id);
    if (this.pool.has(id)) {
      this.doRelease(id);
    }
  }

  isActive(id: string): boolean {
    return this.pool.has(id);
  }

  onTerminalDestroyed(id: string): void {
    this.pendingEnsures.delete(id);
    const entry = this.pool.get(id);
    if (entry) {
      try {
        entry.contextLossDisposable.dispose();
      } catch {
        // ignore
      }
      try {
        entry.captureDisposable?.();
      } catch {
        // ignore
      }
      this.pool.delete(id);
      this.removeFromLru(id);
    }
  }

  dispose(): void {
    if (this.pendingEnsureRafId !== null) {
      try {
        cancelAnimationFrame(this.pendingEnsureRafId);
      } catch {
        // ignore
      }
    }
    this.pendingEnsureRafId = null;
    this.pendingDrainScheduled = false;
    this.pendingEnsures.clear();
    for (const id of [...this.pool.keys()]) {
      this.doRelease(id);
    }
  }

  private scheduleDrain(): void {
    if (this.pendingDrainScheduled) return;
    if (this.pendingEnsures.size === 0) return;
    this.pendingDrainScheduled = true;
    const id = requestAnimationFrame(this.drainOne);
    // If drainOne ran synchronously (test shim or unusual host), it will have
    // already cleared pendingDrainScheduled and there is no rAF id to cancel.
    if (this.pendingDrainScheduled) {
      this.pendingEnsureRafId = id;
    }
  }

  private drainOne = (): void => {
    this.pendingDrainScheduled = false;
    this.pendingEnsureRafId = null;
    if (!WebglAddonClass) return;
    if (!this.hardwareAvailable) {
      this.pendingEnsures.clear();
      return;
    }
    const next = this.pendingEnsures.entries().next();
    if (next.done) return;
    const [id, managed] = next.value;
    this.pendingEnsures.delete(id);
    if (managed.isOpened) {
      // attachWithLoadedAddon dedups via pool.has(id) and routes the
      // already-active case through moveLruToEnd so the touch semantics of
      // a repeat ensure are preserved.
      this.attachWithLoadedAddon(id, managed, WebglAddonClass);
    }
    if (this.pendingEnsures.size > 0) {
      this.scheduleDrain();
    }
  };

  private attachWithLoadedAddon(
    id: string,
    managed: ManagedTerminal,
    AddonClass: WebglAddonConstructor
  ): void {
    if (this.pool.has(id)) {
      this.moveLruToEnd(id);
      return;
    }

    if (this.pool.size >= getMaxContexts()) {
      const evictId = this.lruOrder[0];
      if (evictId) {
        this.doRelease(evictId);
      }
    }

    let addon: WebglAddonType | null = null;
    let clDisposable: IDisposable | null = null;
    let captureDisposable: (() => void) | null = null;
    try {
      addon = new AddonClass();
      const ownAddon = addon;
      clDisposable = addon.onContextLoss(() => {
        if (this.pool.get(id)?.addon === ownAddon) {
          // record before release; pool entry still valid here
          this.recordContextLoss();
          this.releaseContext(id);
        }
      });
      managed.terminal.loadAddon(addon);
      // Capture-phase listener on the terminal element fires before xterm's
      // own webglcontextlost handler (which would otherwise sit on a 3s
      // restore timer before notifying us). Pre-empting that timer eliminates
      // the visible blank window when Chromium evicts the context.
      const element = managed.terminal.element;
      if (element) {
        const captureHandler = (): void => {
          if (this.pool.get(id)?.addon !== ownAddon) return;
          this.recordContextLoss();
          this.releaseContext(id);
          try {
            if (managed.isOpened && managed.terminal.rows > 0) {
              managed.terminal.refresh(0, managed.terminal.rows - 1);
            }
          } catch {
            // ignore — DOM-renderer fallback paints on next frame regardless
          }
        };
        element.addEventListener("webglcontextlost", captureHandler, { capture: true });
        captureDisposable = () => {
          element.removeEventListener("webglcontextlost", captureHandler, { capture: true });
        };
      }
      this.pool.set(id, { addon, contextLossDisposable: clDisposable, captureDisposable });
      this.lruOrder.push(id);
    } catch {
      try {
        clDisposable?.dispose();
      } catch {
        // ignore
      }
      try {
        captureDisposable?.();
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

    // Delete from pool/lru first so the capture-phase listener (and stale
    // onContextLoss fires) treat the loseContext below as a self-initiated
    // release rather than a real eviction.
    this.pool.delete(id);
    this.removeFromLru(id);

    try {
      entry.contextLossDisposable.dispose();
    } catch {
      // ignore
    }
    try {
      entry.captureDisposable?.();
    } catch {
      // ignore
    }
    // Force synchronous GPU-side context release before addon.dispose() so the
    // 16-context Chromium budget actually frees this slot before the next
    // getContext() call. Reaches into addon internals; guarded by try/catch.
    try {
      const gl = (
        entry.addon as unknown as {
          _renderer?: { _gl?: WebGL2RenderingContext | WebGLRenderingContext };
        }
      )._renderer?._gl;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      // ignore — internal addon shape may have changed in a future version
    }
    try {
      entry.addon.dispose();
    } catch {
      // ignore
    }
  }

  private recordContextLoss(): void {
    const now = Date.now();
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

// Internal hooks — exposed only for tests in this repo. Not part of the public API.
export const __testing = {
  setWebglAddonClass(cls: WebglAddonConstructor | null): void {
    WebglAddonClass = cls;
  },
  resetLoaderState(): void {
    WebglAddonClass = null;
    webglAddonLoadPromise = null;
  },
  isLoaded(): boolean {
    return WebglAddonClass !== null;
  },
};
