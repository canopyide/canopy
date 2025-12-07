import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { terminalClient, systemClient } from "@/clients";
import { TerminalRefreshTier } from "@/types";
import { InputTracker, VT100_FULL_CLEAR } from "./clearCommandDetection";
import { detectHardware, HardwareProfile } from "@/utils/hardwareDetection";
import { SharedRingBuffer, PacketParser } from "@shared/utils/SharedRingBuffer";

type RefreshTierProvider = () => TerminalRefreshTier;

interface ManagedTerminal {
  terminal: Terminal;
  fitAddon: FitAddon;
  webglAddon?: WebglAddon;
  serializeAddon: SerializeAddon;
  webLinksAddon: WebLinksAddon;
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
  // Visibility-aware LRU tracking
  isVisible: boolean;
  lastActiveTime: number;
  hasWebglError: boolean;
  // Geometry caching for resize optimization
  lastWidth: number;
  lastHeight: number;
}

const BURST_MODE_WINDOW_MS = 500;
// Debounce to catch split PTY packets (Clear + Redraw) before rendering
const INPUT_DEBOUNCE_MS = 8;
const MAX_WEBGL_RECOVERY_ATTEMPTS = 3;

/**
 * Creates a throttled writer that batches terminal output for efficient rendering.
 * Uses Uint8Array storage to reduce GC pressure from string concatenation.
 * xterm.js write() accepts both string and Uint8Array directly.
 */
function createThrottledWriter(
  terminal: Terminal,
  initialProvider: RefreshTierProvider = () => TerminalRefreshTier.FOCUSED
) {
  // Use array of chunks instead of string concatenation to reduce GC pressure
  let chunks: (string | Uint8Array)[] = [];
  let timerId: number | null = null;
  let getRefreshTier = initialProvider;
  let lastInputTime = 0;

  const flush = () => {
    if (chunks.length > 0) {
      // xterm.js efficiently handles multiple writes
      for (const chunk of chunks) {
        terminal.write(chunk);
      }
      chunks = [];
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
    write: (data: string | Uint8Array) => {
      chunks.push(data);

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
      // Flush any remaining chunks
      if (chunks.length > 0) {
        for (const chunk of chunks) {
          terminal.write(chunk);
        }
        chunks = [];
      }
    },
    updateProvider: (provider: RefreshTierProvider) => {
      getRefreshTier = provider;
    },
    notifyInput: () => {
      lastInputTime = Date.now();
      // If pending data on slow timer, switch to fast debounce
      if (chunks.length > 0 && timerId !== null) {
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
      // Calculate total buffered bytes for debug info (use byte length for strings)
      const bufferSize = chunks.reduce((sum, chunk) => {
        if (typeof chunk === "string") {
          // Use TextEncoder to get actual byte length (UTF-8)
          return sum + new TextEncoder().encode(chunk).length;
        }
        return sum + chunk.length;
      }, 0);
      return { tierName, fps, isBurstMode, effectiveDelay, bufferSize };
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
      // Discard pending chunks without writing them (prevents ghost echoes after clear)
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      chunks = [];
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
  private webglLru: string[] = [];
  private hardwareProfile: HardwareProfile;

  // Zero-copy ring buffer polling state
  private ringBuffer: SharedRingBuffer | null = null;
  private packetParser = new PacketParser();
  private pollingActive = false;
  private rafId: number | null = null;
  private sharedBufferEnabled = false;

  private static readonly TERMINAL_COUNT_THRESHOLD = 20;
  private static readonly BUDGET_SCALE_FACTOR = 0.5;
  private static readonly MIN_WEBGL_BUDGET = 2;
  private static readonly POLL_TIME_BUDGET_MS = 4; // Max time per frame for polling
  private static readonly MAX_WEBGL_CONTEXTS = 12; // Conservative limit below browser max (16)

  constructor() {
    this.hardwareProfile = detectHardware();
    console.log("[TerminalInstanceService] Hardware profile:", this.hardwareProfile);

    // Initialize SharedArrayBuffer polling
    this.initializeSharedBuffer();
  }

  /**
   * Initialize SharedArrayBuffer for zero-copy terminal I/O.
   * Falls back to IPC if unavailable.
   */
  private async initializeSharedBuffer(): Promise<void> {
    try {
      const buffer = await terminalClient.getSharedBuffer();
      if (buffer) {
        this.ringBuffer = new SharedRingBuffer(buffer);
        this.sharedBufferEnabled = true;
        this.startPolling();
        console.log("[TerminalInstanceService] SharedArrayBuffer polling enabled");
      } else {
        console.log("[TerminalInstanceService] SharedArrayBuffer unavailable, using IPC");
      }
    } catch (error) {
      console.warn("[TerminalInstanceService] Failed to initialize SharedArrayBuffer:", error);
    }
  }

  /**
   * Start the polling loop for reading from the shared ring buffer.
   * Uses requestAnimationFrame for smooth 60fps synchronization.
   */
  private startPolling(): void {
    if (this.pollingActive || !this.ringBuffer) return;
    this.pollingActive = true;
    this.poll();
  }

  /**
   * Stop the polling loop (called on service disposal).
   */
  stopPolling(): void {
    this.pollingActive = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Poll the ring buffer and dispatch data to terminals.
   * Runs within a time budget per frame to avoid blocking the main thread.
   */
  private poll = (): void => {
    if (!this.pollingActive || !this.ringBuffer) return;

    const start = performance.now();

    // Read and dispatch data within time budget
    while (performance.now() - start < TerminalInstanceService.POLL_TIME_BUDGET_MS) {
      const data = this.ringBuffer.read();
      if (!data) break; // Buffer empty

      // Parse packets and dispatch to terminals
      const packets = this.packetParser.parse(data);
      for (const packet of packets) {
        const managed = this.instances.get(packet.id);
        if (managed) {
          managed.throttledWriter.write(packet.data);
        } else {
          // Terminal not found in renderer (may have been closed)
          // Data is discarded - this is expected for terminals that closed
        }
      }
    }

    // Schedule next poll
    this.rafId = requestAnimationFrame(this.poll);
  };

  /**
   * Check if SharedArrayBuffer-based I/O is enabled.
   */
  isSharedBufferEnabled(): boolean {
    return this.sharedBufferEnabled;
  }

  private getWebGLBudget(): number {
    let budget = this.hardwareProfile.baseWebGLBudget;

    // Reduce budget when many terminals are open
    const terminalCount = this.instances.size;
    if (terminalCount > TerminalInstanceService.TERMINAL_COUNT_THRESHOLD) {
      const scaleFactor = Math.max(
        TerminalInstanceService.BUDGET_SCALE_FACTOR,
        TerminalInstanceService.TERMINAL_COUNT_THRESHOLD / terminalCount
      );
      budget = Math.floor(budget * scaleFactor);
    }

    return Math.max(TerminalInstanceService.MIN_WEBGL_BUDGET, budget);
  }

  /**
   * Enforce WebGL context budget using visibility-aware LRU eviction.
   * Prioritizes visible terminals over hidden ones.
   */
  private enforceWebglBudget(): void {
    const activeContexts: string[] = [];
    this.instances.forEach((term, id) => {
      if (term.webglAddon) {
        activeContexts.push(id);
      }
    });

    // Use the lesser of dynamic budget and hard limit
    const effectiveBudget = Math.min(
      this.getWebGLBudget(),
      TerminalInstanceService.MAX_WEBGL_CONTEXTS
    );

    if (activeContexts.length < effectiveBudget) {
      return;
    }

    // Sort by priority (lowest first - index 0 is evicted first):
    // 1. Hidden terminals sorted by lastActiveTime (oldest first)
    // 2. Visible terminals sorted by lastActiveTime (oldest first)
    activeContexts.sort((aId, bId) => {
      const a = this.instances.get(aId)!;
      const b = this.instances.get(bId)!;

      if (a.isVisible !== b.isVisible) {
        return a.isVisible ? 1 : -1;
      }
      return a.lastActiveTime - b.lastActiveTime;
    });

    // Evict contexts until under budget (handles sharp budget drops)
    while (activeContexts.length >= effectiveBudget) {
      const victimId = activeContexts.shift();
      if (!victimId) break;
      const victim = this.instances.get(victimId);

      if (victim?.webglAddon) {
        console.log(
          `[TerminalInstanceService] Evicting WebGL context for ${victimId} (Visible: ${victim.isVisible})`
        );
        this.releaseWebgl(victimId, victim);
        victim.terminal.refresh(0, victim.terminal.rows - 1);
      }
    }
  }

  /**
   * Update visibility state for a terminal.
   * Called by React's IntersectionObserver when terminal enters/leaves viewport.
   */
  setVisible(id: string, isVisible: boolean): void {
    const managed = this.instances.get(id);
    if (!managed) return;

    if (managed.isVisible !== isVisible) {
      managed.isVisible = isVisible;
      managed.lastActiveTime = Date.now();

      if (isVisible) {
        // Always bust cache when becoming visible to force fresh measurement
        managed.lastWidth = 0;
        managed.lastHeight = 0;

        // Force resize when becoming visible to sync dimensions
        const rect = managed.hostElement.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          this.resize(id, rect.width, rect.height);
        }
        // If becoming visible, try to upgrade to WebGL
        this.applyRendererPolicy(id, managed.getRefreshTier());
      } else {
        // If hiding, release WebGL immediately to free resources
        if (managed.webglAddon) {
          this.releaseWebgl(id, managed);
          managed.terminal.refresh(0, managed.terminal.rows - 1);
        }
      }
    }
  }

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

    const openLink = (url: string) => {
      let normalizedUrl = url;
      if (!/^https?:\/\//i.test(url)) {
        normalizedUrl = `https://${url}`;
      }
      console.log("[TerminalInstanceService] Opening external URL:", normalizedUrl);
      systemClient.openExternal(normalizedUrl).catch((error) => {
        console.error("[TerminalInstanceService] Failed to open URL:", error);
      });
    };

    const terminal = new Terminal({
      ...options,
      linkHandler: {
        activate: (_event, text) => openLink(text),
      },
    });
    const fitAddon = new FitAddon();
    const serializeAddon = new SerializeAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(serializeAddon);

    const webLinksAddon = new WebLinksAddon((_event, uri) => openLink(uri));
    terminal.loadAddon(webLinksAddon);

    const hostElement = document.createElement("div");
    hostElement.style.width = "100%";
    hostElement.style.height = "100%";
    hostElement.style.display = "flex";
    hostElement.style.flexDirection = "column";

    const throttledWriter = createThrottledWriter(terminal, getRefreshTier);
    const inputTracker = new InputTracker();

    const listeners: Array<() => void> = [];
    const exitSubscribers = new Set<(exitCode: number) => void>();

    // ALWAYS subscribe to IPC data events for fallback scenarios
    // When SharedArrayBuffer is enabled, normal data comes through polling,
    // but IPC handles fallback cases (buffer full, packet framing errors, etc.)
    // Now accepts both string and Uint8Array for binary optimization
    const unsubData = terminalClient.onData(id, (data: string | Uint8Array) => {
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
      serializeAddon,
      webLinksAddon,
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
      isVisible: false,
      lastActiveTime: Date.now(),
      hasWebglError: false,
      lastWidth: 0,
      lastHeight: 0,
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
   * Smart resize: accepts explicit dimensions from ResizeObserver.
   * Prevents the addon from forcing a synchronous layout read to measure the container.
   * Returns {cols, rows} if resized, null if skipped (cached) or error.
   */
  resize(id: string, width: number, height: number): { cols: number; rows: number } | null {
    const managed = this.instances.get(id);
    if (!managed) return null;

    // Geometry caching check - ignore sub-pixel changes
    if (Math.abs(managed.lastWidth - width) < 1 && Math.abs(managed.lastHeight - height) < 1) {
      return null;
    }

    // Calculate cols/rows using proposeDimensions if available (avoids DOM read)
    try {
      // FitAddon.proposeDimensions accepts optional dimensions override
      // @ts-expect-error - internal API, may not be in type definitions
      const proposed = managed.fitAddon.proposeDimensions?.({ width, height });

      if (!proposed) {
        // Fallback to fit() if proposeDimensions not available
        managed.fitAddon.fit();
        const result = { cols: managed.terminal.cols, rows: managed.terminal.rows };
        // Update cache after successful fallback fit
        managed.lastWidth = width;
        managed.lastHeight = height;
        return result;
      }

      const { cols, rows } = proposed;

      // Skip if dimensions unchanged
      if (managed.terminal.cols === cols && managed.terminal.rows === rows) {
        return null;
      }

      // Apply resize
      managed.terminal.resize(cols, rows);

      // Update cache only after successful resize
      managed.lastWidth = width;
      managed.lastHeight = height;

      return { cols, rows };
    } catch (error) {
      console.warn(`[TerminalInstanceService] Resize failed for ${id}:`, error);
      // Don't update cache on error - allow retry with same dimensions
      return null;
    }
  }

  focus(id: string): void {
    const managed = this.instances.get(id);
    managed?.terminal.focus();
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

    // Check if any text metric options are changing (affects cell size)
    const textMetricKeys = ["fontSize", "fontFamily", "lineHeight", "letterSpacing", "fontWeight"];
    const textMetricsChanged = textMetricKeys.some((key) => key in options);

    Object.entries(options).forEach(([key, value]) => {
      // @ts-expect-error xterm options are indexable
      managed.terminal.options[key] = value;
    });

    // Bust geometry cache when text metrics change so resize recalculates cols/rows
    if (textMetricsChanged) {
      managed.lastWidth = 0;
      managed.lastHeight = 0;
    }
  }

  /**
   * Broadcast option changes (theme, font size) to all active terminals.
   */
  applyGlobalOptions(options: Partial<Terminal["options"]>): void {
    // Check if any text metric options are changing (affects cell size)
    const textMetricKeys = ["fontSize", "fontFamily", "lineHeight", "letterSpacing", "fontWeight"];
    const textMetricsChanged = textMetricKeys.some((key) => key in options);

    this.instances.forEach((managed) => {
      Object.entries(options).forEach(([key, value]) => {
        // @ts-expect-error xterm options are indexable
        managed.terminal.options[key] = value;
      });

      // Bust geometry cache when text metrics change
      if (textMetricsChanged) {
        managed.lastWidth = 0;
        managed.lastHeight = 0;
      }

      if (options.theme) {
        managed.terminal.refresh(0, managed.terminal.rows - 1);
      }
    });
  }

  /**
   * Apply renderer policy based on priority tier and visibility.
   * Visible terminals with FOCUSED/BURST/VISIBLE tier get WebGL.
   * BACKGROUND terminals and hidden terminals surrender WebGL to save resources.
   * Also propagates activity tier to main process for IPC batching.
   */
  applyRendererPolicy(id: string, tier: TerminalRefreshTier): void {
    const managed = this.instances.get(id);
    if (!managed) return;

    // Update activity timestamp on focus/burst events
    if (tier === TerminalRefreshTier.FOCUSED || tier === TerminalRefreshTier.BURST) {
      managed.lastActiveTime = Date.now();
      // Clear error flag on explicit user interaction
      managed.hasWebglError = false;
    }

    // Terminal must be visible AND have appropriate tier to want WebGL
    const wantsWebgl =
      managed.isVisible &&
      (tier === TerminalRefreshTier.BURST ||
        tier === TerminalRefreshTier.FOCUSED ||
        tier === TerminalRefreshTier.VISIBLE);

    if (wantsWebgl) {
      if (!managed.webglAddon) {
        this.acquireWebgl(id, managed);
      } else if (tier === TerminalRefreshTier.FOCUSED || tier === TerminalRefreshTier.BURST) {
        // Promote FOCUSED/BURST terminals to end of LRU to protect from eviction
        const idx = this.webglLru.indexOf(id);
        if (idx !== -1 && idx < this.webglLru.length - 1) {
          this.webglLru.splice(idx, 1);
          this.webglLru.push(id);
        }
      }
    } else if (tier === TerminalRefreshTier.BACKGROUND && managed.webglAddon) {
      // Release WebGL for BACKGROUND tier (hidden tabs)
      this.releaseWebgl(id, managed);
    }

    // Map refresh tier to IPC activity tier and propagate to main process
    const activityTier = this.mapToActivityTier(tier);
    terminalClient.setActivityTier(id, activityTier);
  }

  /**
   * Map TerminalRefreshTier to IPC activity tier.
   */
  private mapToActivityTier(tier: TerminalRefreshTier): "focused" | "visible" | "background" {
    switch (tier) {
      case TerminalRefreshTier.BURST:
      case TerminalRefreshTier.FOCUSED:
        return "focused";
      case TerminalRefreshTier.VISIBLE:
        return "visible";
      case TerminalRefreshTier.BACKGROUND:
      default:
        return "background";
    }
  }

  private acquireWebgl(id: string, managed: ManagedTerminal): void {
    // Don't retry if we've hit an error state or exhausted recovery attempts
    if (managed.hasWebglError || managed.webglRecoveryAttempts >= MAX_WEBGL_RECOVERY_ATTEMPTS) {
      return;
    }

    // Use visibility-aware budget enforcement
    this.enforceWebglBudget();

    // Double-check budget (in case enforce failed or we're at limit)
    let activeCount = 0;
    this.instances.forEach((t) => {
      if (t.webglAddon) activeCount++;
    });

    const effectiveBudget = Math.min(
      this.getWebGLBudget(),
      TerminalInstanceService.MAX_WEBGL_CONTEXTS
    );

    if (activeCount >= effectiveBudget) {
      // Over budget - stay with DOM renderer
      return;
    }

    try {
      const webglAddon = new WebglAddon();
      managed.webglRecoveryAttempts = 0;

      webglAddon.onContextLoss(() => {
        console.warn(`[TerminalInstanceService] WebGL context lost for ${id}`);
        webglAddon.dispose();
        managed.webglAddon = undefined;
        this.webglLru = this.webglLru.filter((existing) => existing !== id);

        // Mark as error state to prevent thrashing loop
        managed.hasWebglError = true;

        // Auto-recovery after GPU stabilizes
        setTimeout(() => {
          if (!this.instances.has(id)) return;

          const currentManaged = this.instances.get(id);
          if (!currentManaged || !currentManaged.terminal.element) return;

          try {
            currentManaged.terminal.refresh(0, currentManaged.terminal.rows - 1);
            console.log(`[TerminalInstanceService] Canvas fallback active for ${id}`);

            // Retry WebGL if terminal is focused/burst and under retry limit
            const tier = currentManaged.getRefreshTier();
            if (
              (tier === TerminalRefreshTier.FOCUSED || tier === TerminalRefreshTier.BURST) &&
              currentManaged.webglRecoveryAttempts < MAX_WEBGL_RECOVERY_ATTEMPTS
            ) {
              currentManaged.webglRecoveryAttempts++;
              currentManaged.hasWebglError = false; // Clear error flag for retry
              console.log(
                `[TerminalInstanceService] Attempting WebGL recovery for ${id} (${currentManaged.webglRecoveryAttempts}/${MAX_WEBGL_RECOVERY_ATTEMPTS})`
              );
              this.acquireWebgl(id, currentManaged);
            } else if (currentManaged.webglRecoveryAttempts >= MAX_WEBGL_RECOVERY_ATTEMPTS) {
              console.warn(
                `[TerminalInstanceService] Max WebGL recovery attempts reached for ${id}, staying in canvas mode`
              );
            }
          } catch (error) {
            console.error(`[TerminalInstanceService] Recovery failed for ${id}:`, error);
          }
        }, 1000);
      });

      managed.terminal.loadAddon(webglAddon);
      managed.webglAddon = webglAddon;
      managed.hasWebglError = false;

      this.webglLru = this.webglLru.filter((existing) => existing !== id);
      this.webglLru.push(id);
    } catch (error) {
      console.warn("[TerminalInstanceService] WebGL addon failed to load:", error);
      managed.hasWebglError = true;
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
    managed.webLinksAddon.dispose();
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

  /**
   * Get the buffer line count for a terminal (used for resize debouncing decisions).
   * Uses active buffer to handle full-screen apps running in alternate buffer.
   */
  getBufferLineCount(id: string): number {
    const managed = this.instances.get(id);
    if (!managed) return 0;
    return managed.terminal.buffer.active.length ?? managed.terminal.buffer.normal.length ?? 0;
  }

  getInstanceCount(): number {
    return this.instances.size;
  }

  getDebugInfo(id: string) {
    const managed = this.instances.get(id);
    if (!managed) return null;
    return managed.throttledWriter.getDebugInfo();
  }

  /**
   * Restore terminal state from a serialized string (from headless backend).
   * Writes the serialized state directly to the terminal for instant visual restoration.
   * @param id Terminal ID
   * @param serializedState Serialized state from backend headless xterm
   * @returns true if restoration succeeded, false otherwise
   */
  restoreFromSerialized(id: string, serializedState: string): boolean {
    const managed = this.instances.get(id);
    if (!managed) {
      console.warn(`[TerminalInstanceService] Cannot restore: terminal ${id} not found`);
      return false;
    }

    try {
      // Clear pending output and reset terminal state for idempotent restoration
      managed.throttledWriter.clear();
      managed.terminal.reset();

      // The serialized state is a sequence of escape codes that reconstructs
      // the terminal buffer, colors, and cursor position when written
      managed.terminal.write(serializedState);
      return true;
    } catch (error) {
      console.error(`[TerminalInstanceService] Failed to restore terminal ${id}:`, error);
      return false;
    }
  }

  /**
   * Fetch serialized state from backend and restore terminal.
   * Convenience method that combines IPC call and restoration.
   * @param id Terminal ID
   * @returns Promise resolving to true if restoration succeeded
   */
  async fetchAndRestore(id: string): Promise<boolean> {
    try {
      const serializedState = await terminalClient.getSerializedState(id);
      if (!serializedState) {
        console.warn(`[TerminalInstanceService] No serialized state for terminal ${id}`);
        return false;
      }
      return this.restoreFromSerialized(id, serializedState);
    } catch (error) {
      console.error(`[TerminalInstanceService] Failed to fetch state for terminal ${id}:`, error);
      return false;
    }
  }
}

export const terminalInstanceService = new TerminalInstanceService();
