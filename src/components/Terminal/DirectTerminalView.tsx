import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { cn } from "@/lib/utils";
import { terminalClient } from "@/clients";
import { useTerminalFontStore } from "@/store/terminalFontStore";
import { useScrollbackStore } from "@/store/scrollbackStore";
import { terminalInstanceService } from "@/services/TerminalInstanceService";
import { getTerminalThemeFromCSS } from "./XtermAdapter";

export interface DirectTerminalViewProps {
  terminalId: string;
  isFocused: boolean;
  isVisible: boolean;
  isInputLocked?: boolean;
  className?: string;
}

type ViewMode = "live" | "history";

// Minimum scrollback lines to allow history mode
const MIN_LINES_FOR_HISTORY = 3;
// Lines to scroll up when entering history mode
const HISTORY_ENTRY_OFFSET_LINES = 6;

export function DirectTerminalView({
  terminalId,
  isFocused,
  isVisible,
  isInputLocked,
  className,
}: DirectTerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const liveContainerRef = useRef<HTMLDivElement>(null);
  const historyContainerRef = useRef<HTMLDivElement>(null);

  // Live terminal
  const liveTermRef = useRef<Terminal | null>(null);
  const liveFitRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);

  // History terminal (read-only, for displaying history with colors)
  const historyTermRef = useRef<Terminal | null>(null);
  const historyFitRef = useRef<FitAddon | null>(null);

  const disposedRef = useRef(false);

  // View mode: live (real terminal) or history (read-only terminal with history)
  const [viewMode, setViewMode] = useState<ViewMode>("live");
  const viewModeRef = useRef<ViewMode>("live");

  // Store subscriptions
  const fontSize = useTerminalFontStore((s) => s.fontSize);
  const fontFamily = useTerminalFontStore((s) => s.fontFamily);
  const scrollbackLines = useScrollbackStore((s) => s.scrollbackLines);

  const effectiveFontFamily = fontFamily || "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

  const containerStyle = useMemo<React.CSSProperties>(
    () => ({
      fontFamily: effectiveFontFamily,
      fontSize,
      lineHeight: 1.1,
    }),
    [effectiveFontFamily, fontSize]
  );

  // Sync viewMode ref
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  // Enter history mode
  const enterHistoryMode = useCallback(() => {
    if (viewModeRef.current === "history") return;

    const liveTerm = liveTermRef.current;
    const historyTerm = historyTermRef.current;
    const serialize = serializeAddonRef.current;
    if (!liveTerm || !historyTerm || !serialize) return;

    const buffer = liveTerm.buffer.active;
    if (buffer.baseY < MIN_LINES_FOR_HISTORY) return;

    // Serialize the live terminal state (includes colors)
    let serialized: string;
    try {
      serialized = serialize.serialize();
    } catch {
      return;
    }

    if (!serialized || serialized.length === 0) return;

    // Reset history terminal and write serialized content
    try {
      historyTerm.reset();
      historyTerm.write(serialized, () => {
        // After write, scroll to near-bottom (offset by HISTORY_ENTRY_OFFSET_LINES)
        const histBuf = historyTerm.buffer.active;
        const availableScroll = histBuf.baseY;

        if (availableScroll > 0) {
          historyTerm.scrollToBottom();
          historyTerm.scrollLines(-Math.min(HISTORY_ENTRY_OFFSET_LINES, availableScroll));
        }
      });
    } catch {
      return;
    }

    viewModeRef.current = "history";
    setViewMode("history");
  }, []);

  // Exit history mode (return to live)
  const exitHistoryMode = useCallback(() => {
    if (viewModeRef.current === "live") return;

    viewModeRef.current = "live";
    setViewMode("live");

    // Focus the live terminal
    requestAnimationFrame(() => {
      liveTermRef.current?.focus();
    });
  }, []);

  // Initialize live terminal
  useLayoutEffect(() => {
    disposedRef.current = false;
    const liveContainer = liveContainerRef.current;
    if (!liveContainer) return;

    const terminalTheme = getTerminalThemeFromCSS();
    const effectiveScrollback = Math.max(1000, Math.min(50000, Math.floor(scrollbackLines)));

    const term = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      cursorStyle: "block",
      cursorInactiveStyle: "block",
      fontSize,
      lineHeight: 1.1,
      letterSpacing: 0,
      fontFamily: effectiveFontFamily,
      fontWeight: "normal",
      fontWeightBold: "700",
      theme: terminalTheme,
      scrollback: effectiveScrollback,
      macOptionIsMeta: true,
      scrollOnUserInput: true,
    });

    const fit = new FitAddon();
    const serialize = new SerializeAddon();
    term.loadAddon(fit);
    term.loadAddon(serialize);
    term.open(liveContainer);

    try {
      const rect = liveContainer.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        fit.fit();
        terminalClient.resize(terminalId, term.cols, term.rows);
      }
    } catch {
      // ignore
    }

    liveTermRef.current = term;
    liveFitRef.current = fit;
    serializeAddonRef.current = serialize;

    // Handle user input
    const inputDisposable = term.onData((data) => {
      if (isInputLocked) return;

      // Ignore focus report escape sequences
      if (data === "\x1b[I" || data === "\x1b[O") {
        return;
      }

      terminalClient.write(terminalId, data);
      terminalInstanceService.notifyUserInput(terminalId);
    });

    // Subscribe to PTY data - always write to live terminal
    const dataUnsub = terminalClient.onData(terminalId, (data) => {
      const str = typeof data === "string" ? data : new TextDecoder().decode(data);
      term.write(str);
    });

    return () => {
      disposedRef.current = true;
      inputDisposable.dispose();
      dataUnsub();
      liveTermRef.current = null;
      liveFitRef.current = null;
      serializeAddonRef.current = null;
      term.dispose();
    };
  }, [
    terminalId,
    effectiveFontFamily,
    fontSize,
    scrollbackLines,
    isInputLocked,
  ]);

  // Initialize history terminal (read-only, for viewing history with colors)
  useLayoutEffect(() => {
    const historyContainer = historyContainerRef.current;
    if (!historyContainer) return;

    const terminalTheme = getTerminalThemeFromCSS();
    const effectiveScrollback = Math.max(1000, Math.min(50000, Math.floor(scrollbackLines)));

    const term = new Terminal({
      allowProposedApi: true,
      cursorBlink: false,
      cursorStyle: "block",
      cursorInactiveStyle: "none",
      fontSize,
      lineHeight: 1.1,
      letterSpacing: 0,
      fontFamily: effectiveFontFamily,
      fontWeight: "normal",
      fontWeightBold: "700",
      theme: terminalTheme,
      scrollback: effectiveScrollback,
      macOptionIsMeta: true,
      disableStdin: true, // Read-only
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(historyContainer);

    try {
      const rect = historyContainer.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        fit.fit();
      }
    } catch {
      // ignore
    }

    historyTermRef.current = term;
    historyFitRef.current = fit;

    return () => {
      historyTermRef.current = null;
      historyFitRef.current = null;
      term.dispose();
    };
  }, [effectiveFontFamily, fontSize, scrollbackLines]);

  // Handle wheel events on the container to detect scroll intent
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      // Ignore horizontal scrolling
      if (event.deltaY === 0) return;

      if (viewModeRef.current === "live") {
        // In live mode, scroll UP enters history mode
        if (event.deltaY < 0) {
          const term = liveTermRef.current;
          if (!term) return;

          // Check if there's enough content to scroll through
          const buffer = term.buffer.active;
          if (buffer.baseY >= MIN_LINES_FOR_HISTORY) {
            event.preventDefault();
            event.stopPropagation();
            enterHistoryMode();
          }
        }
        // Down scrolls in live mode are ignored (we're already at bottom)
      } else {
        // In history mode, check if scrolling to bottom
        const historyTerm = historyTermRef.current;
        if (!historyTerm) return;

        const buffer = historyTerm.buffer.active;
        const scrollbackTop = buffer.baseY;
        const viewportY = buffer.viewportY;

        // If scrolling down and near bottom, exit to live mode
        if (event.deltaY > 0) {
          const linesFromBottom = scrollbackTop - viewportY;
          if (linesFromBottom <= 1) {
            event.preventDefault();
            event.stopPropagation();
            exitHistoryMode();
          }
        }
      }
    };

    container.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, [enterHistoryMode, exitHistoryMode]);

  // Handle resize for live terminal
  useLayoutEffect(() => {
    const liveContainer = liveContainerRef.current;
    if (!liveContainer) return;
    if (!isVisible && !isFocused) return;

    let rafId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (disposedRef.current) return;
        const term = liveTermRef.current;
        const fit = liveFitRef.current;
        if (!term || !fit) return;

        try {
          const rect = liveContainer.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;
          fit.fit();
          terminalClient.resize(terminalId, term.cols, term.rows);
        } catch {
          // ignore
        }
      });
    });

    observer.observe(liveContainer);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [isFocused, isVisible, terminalId]);

  // Handle resize for history terminal
  useLayoutEffect(() => {
    const historyContainer = historyContainerRef.current;
    if (!historyContainer) return;
    if (viewMode !== "history") return;

    let rafId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const term = historyTermRef.current;
        const fit = historyFitRef.current;
        if (!term || !fit) return;

        try {
          const rect = historyContainer.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;
          fit.fit();
        } catch {
          // ignore
        }
      });
    });

    observer.observe(historyContainer);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [viewMode]);

  // Handle focus
  useEffect(() => {
    if (!isFocused) return;
    if (viewMode === "live") {
      requestAnimationFrame(() => liveTermRef.current?.focus());
    }
  }, [isFocused, viewMode]);

  return (
    <div
      ref={containerRef}
      className={cn("absolute inset-0 overflow-hidden bg-canopy-bg", className)}
      style={containerStyle}
      aria-label="Terminal view"
    >
      {/* Live terminal container - always exists, visibility controlled */}
      <div
        ref={liveContainerRef}
        className={cn(
          "absolute inset-0 py-2 px-3",
          viewMode === "history" && "invisible"
        )}
        onPointerDownCapture={() => {
          if (isFocused && viewMode === "live") {
            liveTermRef.current?.focus();
          }
        }}
      />

      {/* History terminal container - read-only xterm for viewing history with colors */}
      <div
        ref={historyContainerRef}
        className={cn(
          "absolute inset-0 py-2 px-3",
          viewMode === "live" && "invisible"
        )}
      />

      {/* Jump to live button in history mode */}
      {viewMode === "history" && (
        <button
          type="button"
          onClick={() => exitHistoryMode()}
          className="absolute bottom-4 right-4 z-30 flex items-center gap-1.5 px-2.5 py-1.5 bg-canopy-sidebar border border-canopy-border rounded-md text-xs font-medium text-canopy-text/80 hover:bg-canopy-bg hover:text-canopy-text hover:border-canopy-border/80 transition-colors shadow-md"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          Jump to live
        </button>
      )}
    </div>
  );
}
