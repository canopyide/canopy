import type { WebglAddon as WebglAddonType } from "@xterm/addon-webgl";
import type { IDisposable } from "@xterm/xterm";
import { getMaxContexts, setMaxContexts as setConfiguredMaxContexts } from "./TerminalWebGLConfig";
import type { ManagedTerminal } from "./types";

const WEBGL_DISABLED = import.meta.env.DAINTREE_DISABLE_WEBGL === "1";

type WebglAddonConstructor = new () => WebglAddonType;

// @xterm/addon-webgl loads via dynamic import so it stays out of the renderer's
// eager critical path. ensureContext() remains synchronous: requests that arrive
// before the chunk finishes loading are queued and replayed on resolution.
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
  // Latest pending ensure request per terminal id, awaiting addon-webgl load.
  private pendingEnsures = new Map<string, ManagedTerminal>();

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

    if (WebglAddonClass) {
      this.attachWithLoadedAddon(id, managed, WebglAddonClass);
      return;
    }

    // Dedupe: latest request per id wins until the addon resolves.
    this.pendingEnsures.set(id, managed);
    void loadWebglAddon().then(
      () => this.flushPendingEnsures(),
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
      this.pool.delete(id);
      this.removeFromLru(id);
    }
  }

  dispose(): void {
    this.pendingEnsures.clear();
    for (const id of [...this.pool.keys()]) {
      this.doRelease(id);
    }
  }

  private flushPendingEnsures(): void {
    if (!WebglAddonClass) return;
    if (!this.hardwareAvailable) {
      this.pendingEnsures.clear();
      return;
    }
    const pending = this.pendingEnsures;
    this.pendingEnsures = new Map();
    for (const [id, managed] of pending) {
      if (!managed.isOpened) continue;
      this.attachWithLoadedAddon(id, managed, WebglAddonClass);
    }
  }

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
