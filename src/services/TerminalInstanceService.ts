import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { terminalClient } from "@/clients";
import { TerminalRefreshTier } from "@/types";

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
}

/**
 * Lightweight throttled writer that adapts to the current refresh tier.
 * Mirrors the behavior previously inside XtermAdapter but is now owned
 * by the terminal instance so it survives React remounts.
 */
function createThrottledWriter(
  terminal: Terminal,
  initialProvider: RefreshTierProvider = () => TerminalRefreshTier.FOCUSED
) {
  let buffer = "";
  let timerId: number | null = null;
  let getRefreshTier = initialProvider;
  let currentTier: TerminalRefreshTier = getRefreshTier();

  const flush = () => {
    if (buffer) {
      terminal.write(buffer);
      buffer = "";
    }
    timerId = null;
  };

  return {
    write: (data: string) => {
      const newTier = getRefreshTier();

      // If tier improves (lower value), flush pending data immediately
      if (newTier < currentTier) {
        if (timerId !== null) {
          cancelAnimationFrame(timerId);
          clearTimeout(timerId);
          timerId = null;
        }
        if (buffer) {
          flush();
        }
        currentTier = newTier;
      }

      currentTier = newTier;

      // Low-latency fast-path: If terminal is focused and we receive a small chunk
      // (like a keystroke echo), write immediately to bypass ~16ms RAF lag.
      // Only when buffer is empty to maintain strict ordering with any pending content.
      const isTypingChunk = data.length < 256;
      if (currentTier === TerminalRefreshTier.FOCUSED && !buffer && isTypingChunk) {
        terminal.write(data);
        return;
      }

      // Standard buffering for bulk output
      buffer += data;

      if (timerId) {
        return;
      }

      if (currentTier === TerminalRefreshTier.FOCUSED) {
        timerId = requestAnimationFrame(flush);
      } else {
        timerId = window.setTimeout(flush, currentTier);
      }
    },
    dispose: () => {
      if (timerId !== null) {
        cancelAnimationFrame(timerId);
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
      currentTier = provider();
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

    const wantsWebgl = tier === TerminalRefreshTier.FOCUSED || tier === TerminalRefreshTier.VISIBLE;

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
      webglAddon.onContextLoss(() => {
        console.warn(`[XtermAdapter] ⚠️ WebGL Context LOST for ${id} (Too many active contexts?)`);
        webglAddon.dispose();
        managed.webglAddon = undefined;
        this.webglLru = this.webglLru.filter((existing) => existing !== id);
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
}

export const terminalInstanceService = new TerminalInstanceService();
