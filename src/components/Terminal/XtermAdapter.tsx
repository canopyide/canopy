import React, { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { cn } from "@/lib/utils";
import { terminalClient } from "@/clients";
import { TerminalRefreshTier } from "@/types";
import { terminalInstanceService } from "@/services/TerminalInstanceService";
import { useScrollbackStore, usePerformanceModeStore } from "@/store";

export interface XtermAdapterProps {
  terminalId: string;
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
  onReady,
  onExit,
  className,
  getRefreshTier,
}: XtermAdapterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeFrameIdRef = useRef<number | null>(null);
  const prevDimensionsRef = useRef<{ cols: number; rows: number } | null>(null);
  const zeroRetryCountRef = useRef<number>(0);
  const settleTimeoutRef = useRef<number | null>(null);
  const exitUnsubRef = useRef<(() => void) | null>(null);

  const scrollbackLines = useScrollbackStore((state) => state.scrollbackLines);
  const performanceMode = usePerformanceModeStore((state) => state.performanceMode);

  // Calculate effective scrollback: performance mode overrides user setting
  const effectiveScrollback = useMemo(() => {
    if (performanceMode) {
      return PERFORMANCE_MODE_SCROLLBACK;
    }
    return scrollbackLines > 0 ? scrollbackLines : 1000;
  }, [performanceMode, scrollbackLines]);

  const terminalOptions = useMemo(
    () => ({
      cursorBlink: true,
      cursorStyle: "block" as const,
      cursorInactiveStyle: "block" as const,
      fontSize: 13,
      lineHeight: 1.2,
      letterSpacing: 0,
      fontFamily:
        '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, "Courier New", monospace',
      fontLigatures: true,
      fontWeight: "500" as const,
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

  const scheduleFit = useCallback(() => {
    if (settleTimeoutRef.current !== null) {
      clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }

    settleTimeoutRef.current = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;

      // Ignore fits when container is collapsed/hidden (e.g. during drag)
      // This prevents xterm from resizing to 0x0/1x1 and scrambling the buffer
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
        terminalClient.resize(terminalId, cols, rows);
      }
    }, FIT_SETTLE_DELAY_MS);
  }, [terminalId]);

  const handleResize = useCallback(() => {
    if (resizeFrameIdRef.current !== null) {
      cancelAnimationFrame(resizeFrameIdRef.current);
    }
    resizeFrameIdRef.current = requestAnimationFrame(() => {
      scheduleFit();
      resizeFrameIdRef.current = null;
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
      if (resizeFrameIdRef.current !== null) {
        cancelAnimationFrame(resizeFrameIdRef.current);
        resizeFrameIdRef.current = null;
      }
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

  useLayoutEffect(() => {
    const tier = getRefreshTier ? getRefreshTier() : TerminalRefreshTier.FOCUSED;
    terminalInstanceService.updateRefreshTierProvider(
      terminalId,
      getRefreshTier || (() => TerminalRefreshTier.FOCUSED)
    );
    terminalInstanceService.applyRendererPolicy(terminalId, tier);
  }, [terminalId, getRefreshTier]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener("resize", handleResize);

    // Watch for visibility changes (e.g., when hidden class is removed after drag ends)
    // This ensures fit() is called when the terminal becomes visible again.
    const visibilityObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        scheduleFit();
      }
    });
    visibilityObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [handleResize, scheduleFit]);

  return (
    <div
      ref={containerRef}
      className={cn(
        // pl-2 pt-2 pb-2 provides 8px padding that FitAddon can measure correctly
        // (previously was on .xterm-screen in CSS which caused measurement mismatches)
        "w-full h-full bg-[#18181b] text-white overflow-hidden rounded-b-lg pl-2 pt-2 pb-2",
        className
      )}
    />
  );
}

export const XtermAdapter = React.memo(XtermAdapterComponent);
