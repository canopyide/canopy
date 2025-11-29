/**
 * XtermAdapter Component
 *
 * Wraps xterm.js and connects it to the PtyManager via IPC.
 * Features:
 * - xterm.js terminal instantiation with Canopy theme
 * - Connection to node-pty via IPC
 * - Resize handling with fit addon
 * - WebGL rendering for performance (with canvas fallback)
 * - "Jank Fix": CSI parser to block cursor-home jumps during scrolling
 * - Write throttling for 60fps cap on massive text dumps
 */

import { useEffect, useRef, useCallback, useMemo } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { cn } from "@/lib/utils";

export interface XtermAdapterProps {
  /** Unique terminal identifier - must match PtyManager terminal ID */
  terminalId: string;
  /** Called when terminal is ready and connected */
  onReady?: () => void;
  /** Called when PTY process exits */
  onExit?: (exitCode: number) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Canopy terminal theme - matches the app's dark theme
 */
const CANOPY_TERMINAL_THEME = {
  background: "#09090b",
  foreground: "#fafafa",
  cursor: "#fafafa",
  cursorAccent: "#09090b",
  selectionBackground: "#27272a",
  selectionForeground: "#fafafa",
  selectionInactiveBackground: "#18181b",
  black: "#09090b",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308",
  blue: "#3b82f6",
  magenta: "#a855f7",
  cyan: "#06b6d4",
  white: "#fafafa",
  brightBlack: "#71717a",
  brightRed: "#f87171",
  brightGreen: "#4ade80",
  brightYellow: "#facc15",
  brightBlue: "#60a5fa",
  brightMagenta: "#c084fc",
  brightCyan: "#22d3ee",
  brightWhite: "#ffffff",
};

/**
 * Create a throttled writer that batches writes at 60fps
 * This prevents performance issues when AI agents dump large amounts of text
 */
function createThrottledWriter(terminal: Terminal) {
  let buffer = "";
  let frameId: number | null = null;

  const flush = () => {
    if (buffer) {
      terminal.write(buffer);
      buffer = "";
    }
    frameId = null;
  };

  return {
    write: (data: string) => {
      buffer += data;
      if (!frameId) {
        frameId = requestAnimationFrame(flush);
      }
    },
    dispose: () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      // Flush any remaining data
      if (buffer) {
        terminal.write(buffer);
        buffer = "";
      }
    },
  };
}

/**
 * Apply the "Jank Fix" - block cursor home sequences during scroll
 *
 * When AI agents output large amounts of text, they sometimes send cursor-home
 * sequences (ESC[H or ESC[1;1H) that cause visual jumping during scroll.
 * This CSI parser intercepts and blocks those sequences during active scrolling.
 *
 * @returns Disposable function to clean up listeners and timers
 */
function applyJankFix(terminal: Terminal): () => void {
  let blockCursorHome = false;
  let lastScrollTime = 0;
  let timeoutId: number | null = null;

  // Detect scrolling
  const scrollDisposable = terminal.onScroll(() => {
    lastScrollTime = Date.now();
    blockCursorHome = true;

    // Clear existing timeout
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    // Unblock after scroll settles (150ms of no scrolling)
    timeoutId = window.setTimeout(() => {
      if (Date.now() - lastScrollTime > 100) {
        blockCursorHome = false;
      }
      timeoutId = null;
    }, 150);
  });

  // Register custom CSI handler to intercept cursor positioning commands
  // 'H' is the "Cursor Position" command - ESC[row;colH or ESC[H for home
  const csiDisposable = terminal.parser.registerCsiHandler({ final: "H" }, (params) => {
    // H with no params or params [1,1] or [0,0] is cursor home
    const row = (params.length > 0 && params[0]) || 1;
    const col = (params.length > 1 && params[1]) || 1;

    if (blockCursorHome && row === 1 && col === 1) {
      // Block the sequence during scroll - return true to indicate "handled"
      return true;
    }

    // Let default handler process it - return false to indicate "not handled"
    return false;
  });

  // Return cleanup function
  return () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    scrollDisposable.dispose();
    csiDisposable.dispose();
  };
}

/** Maximum retries when container has zero dimensions */
const MAX_ZERO_RETRIES = 10;

export function XtermAdapter({ terminalId, onReady, onExit, className }: XtermAdapterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const throttledWriterRef = useRef<ReturnType<typeof createThrottledWriter> | null>(null);
  const jankFixDisposeRef = useRef<(() => void) | null>(null);
  const resizeFrameIdRef = useRef<number | null>(null);
  const prevDimensionsRef = useRef<{ cols: number; rows: number } | null>(null);
  const zeroRetryCountRef = useRef<number>(0);
  const clearScreenTimeoutRef = useRef<number | null>(null);

  // Memoize terminal options
  const terminalOptions = useMemo(
    () => ({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "JetBrains Mono, Menlo, Monaco, Consolas, monospace",
      theme: CANOPY_TERMINAL_THEME,
      allowProposedApi: true, // Required for CSI parser access
      smoothScrollDuration: 0, // Disable smooth scroll for better performance
      scrollback: 10000, // Reasonable scrollback buffer
    }),
    []
  );

  // Handle resize
  const handleResize = useCallback(() => {
    if (
      !containerRef.current ||
      containerRef.current.clientWidth === 0 ||
      containerRef.current.clientHeight === 0
    ) {
      return;
    }

    if (fitAddonRef.current && terminalRef.current) {
      try {
        fitAddonRef.current.fit();
        const { cols, rows } = terminalRef.current;
        window.electron.terminal.resize(terminalId, cols, rows);
      } catch (e) {
        console.warn("Resize fit failed:", e);
      }
    }
  }, [terminalId]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Prevent double-initialization (React StrictMode)
    if (terminalRef.current) return;

    // Cancellation flag to prevent ghost terminals in StrictMode
    let isCancelled = false;

    // Create terminal instance
    const terminal = new Terminal(terminalOptions);
    terminalRef.current = terminal;

    // Create fit addon for resize handling
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);

    // Open terminal in container - use setTimeout to avoid xterm.js dimension errors
    // This gives the DOM a tick to fully render before xterm initializes
    setTimeout(() => {
      // Check if component was unmounted before timeout fired
      if (isCancelled || !containerRef.current) return;

      try {
        terminal.open(containerRef.current);

        // Try to load WebGL addon for better performance
        try {
          const webglAddon = new WebglAddon();
          webglAddon.onContextLoss(() => {
            console.warn("WebGL context lost, falling back to canvas renderer");
            webglAddon.dispose();
          });
          terminal.loadAddon(webglAddon);
        } catch (e) {
          console.warn("WebGL addon failed to load, using canvas renderer:", e);
        }

        // Initial fit - but only if container has dimensions
        if (
          containerRef.current &&
          containerRef.current.clientWidth > 0 &&
          containerRef.current.clientHeight > 0
        ) {
          try {
            fitAddon.fit();
          } catch (e) {
            console.warn("Initial fit failed:", e);
          }
        }
      } catch (e) {
        console.error("Failed to open terminal:", e);
      }
    }, 10);

    // Apply the jank fix and store the dispose function
    jankFixDisposeRef.current = applyJankFix(terminal);

    // Create throttled writer for performance
    const throttledWriter = createThrottledWriter(terminal);
    throttledWriterRef.current = throttledWriter;

    // Connect to PTY via IPC - data coming FROM the shell
    const unsubData = window.electron.terminal.onData(terminalId, (data: string) => {
      throttledWriter.write(data);
    });

    // Handle terminal exit
    const unsubExit = window.electron.terminal.onExit((id, exitCode) => {
      if (id === terminalId) {
        // Flush any remaining buffered data
        throttledWriter.dispose();
        terminal.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
        onExit?.(exitCode);
      }
    });

    // Send input FROM the user TO the PTY
    const inputDisposable = terminal.onData((data) => {
      window.electron.terminal.write(terminalId, data);
    });

    // Send initial size
    const { cols, rows } = terminal;
    window.electron.terminal.resize(terminalId, cols, rows);

    // Helper to perform the actual resize check and fit
    const performResize = () => {
      if (!containerRef.current) {
        resizeFrameIdRef.current = null;
        return;
      }

      // If dimensions are zero, schedule explicit retry with polling
      if (containerRef.current.clientWidth === 0 || containerRef.current.clientHeight === 0) {
        if (zeroRetryCountRef.current < MAX_ZERO_RETRIES) {
          zeroRetryCountRef.current++;
          // Schedule explicit dimension check on next frame
          resizeFrameIdRef.current = requestAnimationFrame(performResize);
        } else {
          // Give up after max retries
          console.warn(`Terminal container has zero dimensions after ${MAX_ZERO_RETRIES} retries`);
          zeroRetryCountRef.current = 0;
          resizeFrameIdRef.current = null;
        }
        return;
      }

      // Reset retry count on successful resize
      zeroRetryCountRef.current = 0;

      if (fitAddonRef.current && terminalRef.current) {
        try {
          fitAddonRef.current.fit();
          const { cols, rows } = terminalRef.current;

          // Clear screen if terminal shrunk (debounced to avoid flicker)
          if (prevDimensionsRef.current) {
            const shrunk =
              cols < prevDimensionsRef.current.cols || rows < prevDimensionsRef.current.rows;

            if (shrunk) {
              // Clear any pending clear timeout
              if (clearScreenTimeoutRef.current !== null) {
                clearTimeout(clearScreenTimeoutRef.current);
              }

              // Debounce screen clearing to avoid repeated wipes during drag-resize
              clearScreenTimeoutRef.current = window.setTimeout(() => {
                if (terminalRef.current) {
                  // Send ANSI escape sequence to clear screen
                  // ESC[2J clears screen, ESC[H moves cursor to home
                  terminalRef.current.write("\x1B[2J\x1B[H");
                }
                clearScreenTimeoutRef.current = null;
              }, 150); // Wait 150ms for resize to settle
            }
          }

          // Update previous dimensions
          prevDimensionsRef.current = { cols, rows };

          // Send resize to backend
          window.electron.terminal.resize(terminalId, cols, rows);
        } catch (e) {
          // Suppress fit errors during rapid resizing
          console.warn("Terminal fit failed:", e);
        }
      }
      resizeFrameIdRef.current = null;
    };

    // Set up resize handling with ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      // Cancel any pending resize animation frame
      if (resizeFrameIdRef.current !== null) {
        cancelAnimationFrame(resizeFrameIdRef.current);
      }

      // Use requestAnimationFrame to debounce rapid resize events
      resizeFrameIdRef.current = requestAnimationFrame(performResize);
    });
    resizeObserver.observe(containerRef.current);

    // Also listen for window resize events
    window.addEventListener("resize", handleResize);

    // Signal ready
    onReady?.();

    // Cleanup
    return () => {
      // Mark as cancelled so the timeout doesn't run if it hasn't yet
      isCancelled = true;

      // Cancel pending animation frame
      if (resizeFrameIdRef.current !== null) {
        cancelAnimationFrame(resizeFrameIdRef.current);
        resizeFrameIdRef.current = null;
      }

      // Clear pending screen clear timeout
      if (clearScreenTimeoutRef.current !== null) {
        clearTimeout(clearScreenTimeoutRef.current);
        clearScreenTimeoutRef.current = null;
      }

      // Dispose jank fix listeners and timers
      if (jankFixDisposeRef.current) {
        jankFixDisposeRef.current();
        jankFixDisposeRef.current = null;
      }

      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      unsubData();
      unsubExit();
      inputDisposable.dispose();
      throttledWriter.dispose();
      terminal.dispose();
      // Reset refs to allow re-initialization (prevents StrictMode issues)
      terminalRef.current = null;
      fitAddonRef.current = null;
      throttledWriterRef.current = null;
      prevDimensionsRef.current = null;
      zeroRetryCountRef.current = 0;
    };
  }, [terminalId, terminalOptions, handleResize, onReady, onExit]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full h-full min-h-0 overflow-hidden", // Remove padding, add overflow-hidden
        className
      )}
      style={{ padding: "4px 0 0 8px" }} // Apply padding via style to avoid box model issues
    />
  );
}

export default XtermAdapter;
