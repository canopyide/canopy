import React, { useCallback, useLayoutEffect, useMemo, useRef, useState, useEffect } from "react";
import "@xterm/xterm/css/xterm.css";
import { cn } from "@/lib/utils";
import { terminalClient } from "@/clients";
import { TerminalRefreshTier } from "@/types";
import type { TerminalType } from "@/types";
import { terminalInstanceService } from "@/services/TerminalInstanceService";
import { useScrollbackStore, usePerformanceModeStore } from "@/store";
import { TerminalResizeDebouncer } from "@/services/TerminalResizeDebouncer";
import { getScrollbackForType } from "@/utils/scrollbackConfig";

export interface XtermAdapterProps {
  terminalId: string;
  terminalType?: TerminalType;
  onReady?: () => void;
  onExit?: (exitCode: number) => void;
  className?: string;
  getRefreshTier?: () => TerminalRefreshTier;
}

export const CANOPY_TERMINAL_THEME = {
  background: "#18181b",
  foreground: "#e4e4e7",
  cursor: "#10b981",
  cursorAccent: "#18181b",
  selectionBackground: "#064e3b",
  selectionForeground: "#e4e4e7",
  black: "#18181b",
  red: "#f87171",
  green: "#10b981",
  yellow: "#fbbf24",
  blue: "#38bdf8",
  magenta: "#a855f7",
  cyan: "#22d3ee",
  white: "#e4e4e7",
  brightBlack: "#52525b",
  brightRed: "#fca5a5",
  brightGreen: "#34d399",
  brightYellow: "#fcd34d",
  brightBlue: "#7dd3fc",
  brightMagenta: "#c084fc",
  brightCyan: "#67e8f9",
  brightWhite: "#fafafa",
};

const MAX_ZERO_RETRIES = 10;
const FIT_SETTLE_DELAY_MS = 120;
const PERFORMANCE_MODE_SCROLLBACK = 100;

function XtermAdapterComponent({
  terminalId,
  terminalType = "shell",
  onReady,
  onExit,
  className,
  getRefreshTier,
}: XtermAdapterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevDimensionsRef = useRef<{ cols: number; rows: number } | null>(null);
  const zeroRetryCountRef = useRef<number>(0);
  const settleTimeoutRef = useRef<number | null>(null);
  const exitUnsubRef = useRef<(() => void) | null>(null);
  const debouncerRef = useRef<TerminalResizeDebouncer | null>(null);

  // Track visibility for resize optimization (start pessimistic for offscreen mounts)
  const [isVisible, setIsVisible] = useState(false);

  const scrollbackLines = useScrollbackStore((state) => state.scrollbackLines);
  const performanceMode = usePerformanceModeStore((state) => state.performanceMode);

  // Calculate effective scrollback: performance mode overrides, otherwise use type-based policy
  const effectiveScrollback = useMemo(() => {
    if (performanceMode) {
      return PERFORMANCE_MODE_SCROLLBACK;
    }
    // Use scrollbackLines directly (0 means unlimited, handled by getScrollbackForType)
    return getScrollbackForType(terminalType, scrollbackLines);
  }, [performanceMode, scrollbackLines, terminalType]);

  const terminalOptions = useMemo(
    () => ({
      cursorBlink: true,
      cursorStyle: "block" as const,
      cursorInactiveStyle: "block" as const,
      fontSize: 13,
      lineHeight: 1.2,
      letterSpacing: 0,
      fontFamily: 'Menlo, Monaco, Consolas, "Andale Mono", "Ubuntu Mono", "Courier New", monospace',
      fontLigatures: false,
      fontWeight: "normal" as const,
      fontWeightBold: "700" as const,
      theme: CANOPY_TERMINAL_THEME,
      allowProposedApi: true,
      smoothScrollDuration: performanceMode ? 0 : 0, // Already 0, but keep explicit
      scrollback: effectiveScrollback,
      macOptionIsMeta: true,
      fastScrollModifier: "alt" as const,
    }),
    [effectiveScrollback, performanceMode]
  );

  // Initialize debouncer with callbacks for separate X/Y resize handling
  useLayoutEffect(() => {
    debouncerRef.current = new TerminalResizeDebouncer(
      // Resize X only (horizontal reflow - expensive)
      (cols) => {
        const managed = terminalInstanceService.get(terminalId);
        if (managed) {
          managed.terminal.resize(cols, managed.terminal.rows);
          terminalClient.resize(terminalId, cols, managed.terminal.rows);
        }
      },
      // Resize Y only (vertical - cheap)
      (rows) => {
        const managed = terminalInstanceService.get(terminalId);
        if (managed) {
          managed.terminal.resize(managed.terminal.cols, rows);
          terminalClient.resize(terminalId, managed.terminal.cols, rows);
        }
      },
      // Resize both (for small buffers or immediate mode)
      (cols, rows) => {
        const managed = terminalInstanceService.get(terminalId);
        if (managed) {
          managed.terminal.resize(cols, rows);
        }
        terminalClient.resize(terminalId, cols, rows);
      }
    );

    return () => {
      debouncerRef.current?.dispose();
      debouncerRef.current = null;
    };
  }, [terminalId]);

  const scheduleFit = useCallback(() => {
    if (settleTimeoutRef.current !== null) {
      clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }

    settleTimeoutRef.current = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;

      // Ignore fits when container is collapsed/hidden (e.g. during drag)
      if (container.clientWidth < 50 || container.clientHeight < 50) {
        return;
      }

      if (container.clientWidth === 0 || container.clientHeight === 0) {
        if (zeroRetryCountRef.current < MAX_ZERO_RETRIES) {
          zeroRetryCountRef.current++;
          scheduleFit();
        } else {
          console.warn(`Terminal container has zero dimensions after ${MAX_ZERO_RETRIES} retries`);
          zeroRetryCountRef.current = 0;
        }
        return;
      }

      zeroRetryCountRef.current = 0;

      const dims = terminalInstanceService.fit(terminalId);
      if (dims) {
        const managed = terminalInstanceService.get(terminalId);
        const { cols, rows } = dims;

        if (prevDimensionsRef.current) {
          const shrunk =
            cols < prevDimensionsRef.current.cols || rows < prevDimensionsRef.current.rows;
          if (shrunk && managed) {
            managed.terminal.refresh(0, managed.terminal.rows - 1);
          }
        }

        prevDimensionsRef.current = { cols, rows };

        // Use advanced debouncer for resize - considers visibility and buffer size
        const bufferLines = terminalInstanceService.getBufferLineCount(terminalId);
        debouncerRef.current?.resize(cols, rows, {
          immediate: false,
          bufferLineCount: bufferLines,
          isVisible,
        });
      }
    }, FIT_SETTLE_DELAY_MS);
  }, [terminalId, isVisible]);

  const handleResize = useCallback(() => {
    // Use requestAnimationFrame to coalesce rapid resize events
    requestAnimationFrame(() => {
      scheduleFit();
    });
  }, [scheduleFit]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const managed = terminalInstanceService.getOrCreate(
      terminalId,
      terminalOptions,
      getRefreshTier || (() => TerminalRefreshTier.FOCUSED)
    );
    terminalInstanceService.attach(terminalId, container);

    if (!managed.keyHandlerInstalled) {
      managed.terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if (
          event.key === "Enter" &&
          event.shiftKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.metaKey
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (event.type === "keydown") {
            terminalClient.write(terminalId, "\x1b\r");
          }
          return false;
        }
        return true;
      });
      managed.keyHandlerInstalled = true;
    }

    exitUnsubRef.current = terminalInstanceService.addExitListener(terminalId, (code) => {
      onExit?.(code);
    });

    scheduleFit();
    onReady?.();

    return () => {
      if (settleTimeoutRef.current !== null) {
        clearTimeout(settleTimeoutRef.current);
        settleTimeoutRef.current = null;
      }

      terminalInstanceService.detach(terminalId, containerRef.current);

      if (exitUnsubRef.current) {
        exitUnsubRef.current();
        exitUnsubRef.current = null;
      }

      prevDimensionsRef.current = null;
      zeroRetryCountRef.current = 0;
    };
  }, [terminalId, terminalOptions, onExit, onReady, scheduleFit]);

  // Resolve current tier for dependency tracking
  const currentTier = useMemo(
    () => (getRefreshTier ? getRefreshTier() : TerminalRefreshTier.FOCUSED),
    [getRefreshTier]
  );

  useLayoutEffect(() => {
    terminalInstanceService.updateRefreshTierProvider(
      terminalId,
      getRefreshTier || (() => TerminalRefreshTier.FOCUSED)
    );
    terminalInstanceService.applyRendererPolicy(terminalId, currentTier);

    // If moving to a high-priority state (Focused or Burst), boost the writer
    // to flush any background buffer immediately.
    if (currentTier === TerminalRefreshTier.FOCUSED || currentTier === TerminalRefreshTier.BURST) {
      terminalInstanceService.boostRefreshRate(terminalId);
    }
  }, [terminalId, getRefreshTier, currentTier]);

  // Track visibility for advanced resize debouncing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        const nowVisible = entry.isIntersecting;
        setIsVisible(nowVisible);

        // Flush pending resizes when terminal becomes visible to prevent stale dimensions
        if (nowVisible) {
          // Clear any idle callbacks that may have been scheduled while hidden
          debouncerRef.current?.clear();
          // Trigger immediate fit with fresh dimensions
          scheduleFit();
        }
      },
      { threshold: 0.1 }
    );
    visibilityObserver.observe(container);

    return () => visibilityObserver.disconnect();
  }, [scheduleFit]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener("resize", handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [handleResize]);

  return (
    <div
      ref={containerRef}
      className={cn(
        // pl-2 pt-2 pb-4: left/top padding for FitAddon measurement; pb-4 prevents text from touching bottom edge
        "w-full h-full bg-[#18181b] text-white overflow-hidden rounded-b-lg pl-2 pt-2 pb-4",
        className
      )}
      style={{
        // Force GPU layer promotion to prevent WebGL canvas snapshot DPI issues during drag
        willChange: "transform",
        transform: "translateZ(0)",
      }}
    />
  );
}

export const XtermAdapter = React.memo(XtermAdapterComponent);
