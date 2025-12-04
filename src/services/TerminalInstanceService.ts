import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { terminalClient } from "@/clients";
import { TerminalRefreshTier } from "@/types";
import { InputTracker, VT100_FULL_CLEAR } from "./clearCommandDetection";

type RefreshTierProvider = () => TerminalRefreshTier;

interface ManagedTerminal {
  terminal: Terminal;
  fitAddon: FitAddon;
  webglAddon?: WebglAddon;
  hostElement: HTMLDivElement;
  isOpened: boolean;
  listeners: Array<() => void>;
  exitSubscribers: Set<(exitCode: number) => void>;
  throttledWriter: ReturnType<typeof createThrottledWriter>;
  getRefreshTier: RefreshTierProvider;
  keyHandlerInstalled: boolean;
  lastAttachAt: number;
  lastDetachAt: number;
  webglRecoveryAttempts: number;
}

const BURST_MODE_WINDOW_MS = 500;
// Debounce to catch split PTY packets (Clear + Redraw) before rendering
const INPUT_DEBOUNCE_MS = 8;
const MAX_WEBGL_RECOVERY_ATTEMPTS = 3;

function createThrottledWriter(
  terminal: Terminal,
  initialProvider: RefreshTierProvider = () => TerminalRefreshTier.FOCUSED
) {
  let buffer = "";
  let timerId: number | null = null;
  let getRefreshTier = initialProvider;
  let lastInputTime = 0;

  const flush = () => {
    if (buffer) {
      terminal.write(buffer);
      buffer = "";
    }
    timerId = null;
  };

  const scheduleFlush = (delay: number) => {
    if (timerId !== null) return;

    // Use setTimeout instead of RAF for burst mode to avoid split-packet flashing.
    // RAF can fire instantly if called near frame boundary, rendering "Clear" before "Redraw".
    if (delay <= 16) {
      timerId = window.setTimeout(flush, INPUT_DEBOUNCE_MS);
    } else {
      timerId = window.setTimeout(flush, delay);
    }
  };

  return {
    write: (data: string) => {
      buffer += data;

      const isBurstMode = Date.now() - lastInputTime < BURST_MODE_WINDOW_MS;
      const tierDelay = getRefreshTier();
      const effectiveDelay = isBurstMode ? TerminalRefreshTier.BURST : tierDelay;

      // If switching to faster mode, cancel slow timer and reschedule
      if (timerId !== null && effectiveDelay < tierDelay) {
        clearTimeout(timerId);
        timerId = null;
      }

      scheduleFlush(effectiveDelay);
    },
    dispose: () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (buffer) {
        terminal.write(buffer);
        buffer = "";
      }
    },
    updateProvider: (provider: RefreshTierProvider) => {
      getRefreshTier = provider;
    },
    notifyInput: () => {
      lastInputTime = Date.now();
      // If pending data on slow timer, switch to fast debounce
      if (buffer && timerId !== null) {
        clearTimeout(timerId);
        timerId = window.setTimeout(flush, INPUT_DEBOUNCE_MS);
      }
    },
    getDebugInfo: () => {
      const now = Date.now();
      const isBurstMode = now - lastInputTime < BURST_MODE_WINDOW_MS;
      const tierDelay = getRefreshTier();
      const effectiveDelay = isBurstMode ? TerminalRefreshTier.BURST : tierDelay;
      const fps = Math.round(1000 / effectiveDelay);
      const tierName =
        effectiveDelay === TerminalRefreshTier.BURST
          ? "BURST"
          : effectiveDelay === TerminalRefreshTier.FOCUSED
            ? "FOCUSED"
            : effectiveDelay === TerminalRefreshTier.VISIBLE
              ? "VISIBLE"
              : "BACKGROUND";
      return { tierName, fps, isBurstMode, effectiveDelay, bufferSize: buffer.length };
    },
    boost: () => {
      // Activate burst mode so subsequent writes are fast
      lastInputTime = Date.now();

      // If we have pending data and a timer running, force a quick flush.
      // This catches the case where data came in while backgrounded (long timer)
      // and we want to show it NOW because the user clicked the tab.
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = window.setTimeout(flush, INPUT_DEBOUNCE_MS);
      }
    },
    clear: () => {
      // Discard pending buffer without writing it (prevents ghost echoes after clear)
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      buffer = "";
    },
  };
}

/**
 * Applies the "jank fix" to a terminal instance.
 * Blocks cursor-home sequences during active scrolling to prevent jumpiness.
 */
function applyJankFix(terminal: Terminal): () => void {
  let blockCursorHome = false;
  let lastScrollTime = 0;
  let timeoutId: number | null = null;

  const scrollDisposable = terminal.onScroll(() => {
    lastScrollTime = Date.now();
    blockCursorHome = true;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      if (Date.now() - lastScrollTime > 100) {
        blockCursorHome = false;
      }
      timeoutId = null;
    }, 150);
  });

  const csiDisposable = terminal.parser.registerCsiHandler({ final: "H" }, (params) => {
    const row = (params.length > 0 && params[0]) || 1;
    const col = (params.length > 1 && params[1]) || 1;

    if (blockCursorHome && row === 1 && col === 1) {
      return true;
    }

    return false;
  });

  return () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    scrollDisposable.dispose();
    csiDisposable.dispose();
  };
}

class TerminalInstanceService {
  private instances = new Map<string, ManagedTerminal>();
  private jankFixDisposers = new Map<string, () => void>();
  private static readonly MAX_WEBGL_CONTEXTS = 12;
  private webglLru: string[] = [];

  getOrCreate(
    id: string,
    options: ConstructorParameters<typeof Terminal>[0],
    getRefreshTier: RefreshTierProvider = () => TerminalRefreshTier.FOCUSED
  ): ManagedTerminal {
    const existing = this.instances.get(id);
    if (existing) {
      existing.getRefreshTier = getRefreshTier;
      return existing;
    }

    const terminal = new Terminal(options);
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    const hostElement = document.createElement("div");
    hostElement.style.width = "100%";
    hostElement.style.height = "100%";
    hostElement.style.display = "flex";
    hostElement.style.flexDirection = "column";

    const throttledWriter = createThrottledWriter(terminal, getRefreshTier);
    const inputTracker = new InputTracker();

    const listeners: Array<() => void> = [];
    const exitSubscribers = new Set<(exitCode: number) => void>();

    const unsubData = terminalClient.onData(id, (data: string) => {
      throttledWriter.write(data);
    });
    listeners.push(unsubData);

    const unsubExit = terminalClient.onExit((termId, exitCode) => {
      if (termId !== id) return;
      throttledWriter.dispose();
      terminal.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
      exitSubscribers.forEach((cb) => cb(exitCode));
    });
    listeners.push(unsubExit);

    const inputDisposable = terminal.onData((data) => {
      // Check for clear command (special handling for AI agents)
      if (inputTracker.process(data)) {
        // 1. Clear pending output buffer (prevent ghost echoes)
        throttledWriter.clear();
        // 2. Force clear visual terminal state immediately
        terminal.write(VT100_FULL_CLEAR);
      }

      throttledWriter.notifyInput();
      terminalClient.write(id, data);
    });
    listeners.push(() => inputDisposable.dispose());

    const jankDispose = applyJankFix(terminal);
    this.jankFixDisposers.set(id, jankDispose);

    const managed: ManagedTerminal = {
      terminal,
      fitAddon,
      webglAddon: undefined,
      hostElement,
      isOpened: false,
      listeners,
      exitSubscribers,
      throttledWriter,
      getRefreshTier,
      keyHandlerInstalled: false,
      lastAttachAt: 0,
      lastDetachAt: 0,
      webglRecoveryAttempts: 0,
    };

    this.instances.set(id, managed);

    const initialTier = getRefreshTier ? getRefreshTier() : TerminalRefreshTier.FOCUSED;
    this.applyRendererPolicy(id, initialTier);
    return managed;
  }

  /**
   * Get an existing managed instance without creating it.
   */
  get(id: string): ManagedTerminal | null {
    return this.instances.get(id) ?? null;
  }

  /**
   * Attach terminal DOM to the provided container. Opens the terminal on first attach.
   */
  attach(id: string, container: HTMLElement): ManagedTerminal | null {
    const managed = this.instances.get(id);
    if (!managed) return null;

    if (managed.hostElement.parentElement !== container) {
      container.appendChild(managed.hostElement);
    }

    if (!managed.isOpened) {
      managed.terminal.open(managed.hostElement);
      managed.isOpened = true;
    }
    managed.lastAttachAt = Date.now();

    return managed;
  }

  /**
   * Detach the terminal DOM from its parent without disposing.
   */
  detach(id: string, container: HTMLElement | null): void {
    const managed = this.instances.get(id);
    if (!managed || !container) return;

    if (managed.hostElement.parentElement === container) {
      container.removeChild(managed.hostElement);
    }
    managed.lastDetachAt = Date.now();
  }

  /**
   * Trigger a fit and return the resulting cols/rows.
   */
  fit(id: string): { cols: number; rows: number } | null {
    const managed = this.instances.get(id);
    if (!managed) return null;

    try {
      managed.fitAddon.fit();
      const { cols, rows } = managed.terminal;
      return { cols, rows };
    } catch (error) {
      console.warn("Terminal fit failed:", error);
      return null;
    }
  }

  /**
   * Force a full redraw of the terminal canvas.
   * Useful after drag operations where WebGL canvases may have stale renders.
   */
  refresh(id: string): void {
    const managed = this.instances.get(id);
    if (!managed) return;

    // Force fit before refresh to align canvas with container
    try {
      managed.fitAddon.fit();
    } catch {
      // Ignore fit errors (e.g. if terminal is hidden)
    }

    managed.terminal.refresh(0, managed.terminal.rows - 1);
  }

  /**
   * Reset the WebGL renderer by disposing and recreating the WebGL addon.
   * Forces a full WebGL context reset to resolve rendering artifacts.
   * Used after drag operations where the canvas may have incorrect dimensions.
   */
  resetRenderer(id: string): void {
    const managed = this.instances.get(id);
    if (!managed) return;

    // Skip if terminal is detached or container has invalid dimensions
    if (!managed.hostElement.isConnected) return;
    if (managed.hostElement.clientWidth < 50 || managed.hostElement.clientHeight < 50) return;

    const hadWebgl = !!managed.webglAddon;

    // Dispose existing WebGL addon
    if (managed.webglAddon) {
      managed.webglAddon.dispose();
      managed.webglAddon = undefined;
      this.webglLru = this.webglLru.filter((existing) => existing !== id);
    }

    // Force fit to recalculate dimensions
    try {
      managed.fitAddon.fit();
    } catch {
      // Ignore fit errors
    }

    // Recreate WebGL if it was active
    if (hadWebgl) {
      const tier = managed.getRefreshTier();
      this.applyRendererPolicy(id, tier);
    }

    // Force terminal refresh
    managed.terminal.refresh(0, managed.terminal.rows - 1);
  }

  /**
   * Reset renderers for all terminal instances with active WebGL.
   * Used after drag operations to ensure all terminals render correctly.
   * Only resets terminals that have WebGL enabled to avoid unnecessary overhead.
   */
  resetAllRenderers(): void {
    this.instances.forEach((managed, id) => {
      // Only reset terminals with active WebGL addons to avoid unnecessary overhead
      if (managed.webglAddon) {
        this.resetRenderer(id);
      }
    });
  }

  /**
   * Refresh all active terminal instances.
   */
  refreshAll(): void {
    this.instances.forEach((managed) => {
      // Force fit before refresh to align canvas with container
      try {
        managed.fitAddon.fit();
      } catch {
        // Ignore fit errors
      }

      managed.terminal.refresh(0, managed.terminal.rows - 1);
    });
  }

  /**
   * Update terminal options in place (theme/font/reactive settings).
   */
  updateOptions(id: string, options: Partial<Terminal["options"]>): void {
    const managed = this.instances.get(id);
    if (!managed) return;
    Object.entries(options).forEach(([key, value]) => {
      // @ts-expect-error xterm options are indexable
      managed.terminal.options[key] = value;
    });
  }

  /**
   * Broadcast option changes (theme, font size) to all active terminals.
   */
  applyGlobalOptions(options: Partial<Terminal["options"]>): void {
    this.instances.forEach((managed) => {
      Object.entries(options).forEach(([key, value]) => {
        // @ts-expect-error xterm options are indexable
        managed.terminal.options[key] = value;
      });

      if (options.theme) {
        managed.terminal.refresh(0, managed.terminal.rows - 1);
      }
    });
  }

  /**
   * Apply renderer policy based on priority (foreground/background).
   * Focused/visible terminals keep WebGL; background terminals release it to avoid GPU exhaustion.
   */
  applyRendererPolicy(id: string, tier: TerminalRefreshTier): void {
    const managed = this.instances.get(id);
    if (!managed) return;

    const wantsWebgl =
      tier === TerminalRefreshTier.BURST ||
      tier === TerminalRefreshTier.FOCUSED ||
      tier === TerminalRefreshTier.VISIBLE;

    if (wantsWebgl && !managed.webglAddon) {
      this.acquireWebgl(id, managed);
    } else if (!wantsWebgl && managed.webglAddon) {
      this.releaseWebgl(id, managed);
    }
  }

  private acquireWebgl(id: string, managed: ManagedTerminal): void {
    // Evict LRU if we're at capacity
    if (this.webglLru.length >= TerminalInstanceService.MAX_WEBGL_CONTEXTS) {
      const evictId = this.webglLru.shift();
      if (evictId && evictId !== id) {
        const evictManaged = this.instances.get(evictId);
        if (evictManaged?.webglAddon) {
          evictManaged.webglAddon.dispose();
          evictManaged.webglAddon = undefined;
        }
      }
    }

    try {
      const webglAddon = new WebglAddon();
      // Reset recovery counter on successful WebGL acquisition
      managed.webglRecoveryAttempts = 0;
      webglAddon.onContextLoss(() => {
        console.warn(`[XtermAdapter] WebGL context lost for ${id}. Attempting recovery...`);
        webglAddon.dispose();
        managed.webglAddon = undefined;
        this.webglLru = this.webglLru.filter((existing) => existing !== id);

        // Auto-recovery: wait for GPU to stabilize, then attempt to restore
        setTimeout(() => {
          // Verify terminal still exists (not destroyed)
          if (!this.instances.has(id)) {
            console.log(`[XtermAdapter] Terminal ${id} destroyed, skipping WebGL recovery`);
            return;
          }

          const currentManaged = this.instances.get(id);
          if (!currentManaged || !currentManaged.terminal.element) {
            console.log(`[XtermAdapter] Terminal ${id} detached, skipping WebGL recovery`);
            return;
          }

          // Force canvas refresh as fallback
          try {
            currentManaged.terminal.refresh(0, currentManaged.terminal.rows - 1);
            console.log(`[XtermAdapter] Canvas fallback active for ${id}`);

            // Attempt to re-acquire WebGL if terminal is visible/focused and under retry limit
            const tier = currentManaged.getRefreshTier();
            if (
              (tier === TerminalRefreshTier.FOCUSED || tier === TerminalRefreshTier.VISIBLE) &&
              currentManaged.webglRecoveryAttempts < MAX_WEBGL_RECOVERY_ATTEMPTS
            ) {
              currentManaged.webglRecoveryAttempts++;
              console.log(
                `[XtermAdapter] Attempting WebGL recovery for ${id} (attempt ${currentManaged.webglRecoveryAttempts}/${MAX_WEBGL_RECOVERY_ATTEMPTS})`
              );
              this.acquireWebgl(id, currentManaged);
            } else if (currentManaged.webglRecoveryAttempts >= MAX_WEBGL_RECOVERY_ATTEMPTS) {
              console.warn(
                `[XtermAdapter] Max WebGL recovery attempts reached for ${id}, staying in canvas mode`
              );
            }
          } catch (error) {
            console.error(`[XtermAdapter] Recovery failed for ${id}:`, error);
            // Terminal continues with canvas renderer
          }
        }, 1000);
      });
      managed.terminal.loadAddon(webglAddon);
      managed.webglAddon = webglAddon;
      this.webglLru = this.webglLru.filter((existing) => existing !== id);
      this.webglLru.push(id);
    } catch (error) {
      console.warn("WebGL addon failed to load:", error);
    }
  }

  private releaseWebgl(id: string, managed: ManagedTerminal): void {
    if (managed.webglAddon) {
      managed.webglAddon.dispose();
      managed.webglAddon = undefined;
    }
    this.webglLru = this.webglLru.filter((existing) => existing !== id);
  }

  /**
   * Update refresh tier provider for the throttled writer.
   */
  updateRefreshTierProvider(id: string, provider: RefreshTierProvider): void {
    const managed = this.instances.get(id);
    if (!managed) return;
    managed.getRefreshTier = provider;
    managed.throttledWriter.updateProvider(provider);
  }

  /**
   * Boosts the refresh rate for a specific terminal.
   * Call this when a terminal is focused or interacted with to ensure
   * immediate rendering of any buffered background output.
   */
  boostRefreshRate(id: string): void {
    const managed = this.instances.get(id);
    if (!managed) return;

    // Trigger the writer boost logic
    managed.throttledWriter.boost();

    // Also ensure WebGL is acquired if it was dropped in background
    this.applyRendererPolicy(id, TerminalRefreshTier.BURST);
  }

  addExitListener(id: string, cb: (exitCode: number) => void): () => void {
    const managed = this.instances.get(id);
    if (!managed) return () => {};
    managed.exitSubscribers.add(cb);
    return () => managed.exitSubscribers.delete(cb);
  }

  destroy(id: string): void {
    const managed = this.instances.get(id);
    if (!managed) return;

    managed.listeners.forEach((cleanup) => cleanup());
    managed.throttledWriter.dispose();
    managed.webglAddon?.dispose();
    this.webglLru = this.webglLru.filter((existing) => existing !== id);

    const disposeJank = this.jankFixDisposers.get(id);
    if (disposeJank) {
      disposeJank();
      this.jankFixDisposers.delete(id);
    }

    managed.terminal.dispose();
    managed.hostElement.remove();
    this.instances.delete(id);
  }

  has(id: string): boolean {
    return this.instances.has(id);
  }

  getInstanceCount(): number {
    return this.instances.size;
  }

  getDebugInfo(id: string) {
    const managed = this.instances.get(id);
    if (!managed) return null;
    return managed.throttledWriter.getDebugInfo();
  }
}

export const terminalInstanceService = new TerminalInstanceService();
