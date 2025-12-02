/**
 * TrashedTerminalItem Component
 *
 * Displays a terminal that's pending deletion with a countdown timer.
 * Shows a restore button and countdown progress bar.
 *
 * Supports two display modes:
 * - Default: Full display with progress bar background (legacy, for backwards compatibility)
 * - Compact: Subtle display for use in TrashContainer (muted colors, smaller)
 */

import { useState, useEffect, useCallback } from "react";
import { Undo2, X, Terminal, Command } from "lucide-react";
import {
  ClaudeIcon,
  GeminiIcon,
  CodexIcon,
  NpmIcon,
  YarnIcon,
  PnpmIcon,
  BunIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { useTerminalStore, type TerminalInstance } from "@/store";
import type { TrashedTerminal } from "@/store/slices";
import type { TerminalType } from "@/types";

interface TrashedTerminalItemProps {
  terminal: TerminalInstance;
  trashedInfo: TrashedTerminal;
  /** Use compact styling for TrashContainer (muted colors, no progress bar) */
  compact?: boolean;
}

/**
 * Get terminal icon based on type
 */
function getTerminalIcon(type: TerminalType, className?: string) {
  const props = { className: cn("w-3 h-3", className), "aria-hidden": "true" as const };
  switch (type) {
    // AI Agents
    case "claude":
      return <ClaudeIcon {...props} />;
    case "gemini":
      return <GeminiIcon {...props} />;
    case "codex":
      return <CodexIcon {...props} />;
    // Package Managers
    case "npm":
      return <NpmIcon {...props} />;
    case "yarn":
      return <YarnIcon {...props} />;
    case "pnpm":
      return <PnpmIcon {...props} />;
    case "bun":
      return <BunIcon {...props} />;
    // Generic
    case "custom":
      return <Command {...props} />;
    case "shell":
    default:
      return <Terminal {...props} />;
  }
}

export function TrashedTerminalItem({
  terminal,
  trashedInfo,
  compact = false,
}: TrashedTerminalItemProps) {
  const restoreTerminal = useTerminalStore((s) => s.restoreTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);

  // Calculate actual TTL duration from when component mounts
  const [totalDuration] = useState(() => Math.max(1000, trashedInfo.expiresAt - Date.now()));

  // Calculate remaining time and progress
  const [timeRemaining, setTimeRemaining] = useState(() => {
    const remaining = Math.max(0, trashedInfo.expiresAt - Date.now());
    return remaining;
  });

  // Update countdown every 100ms for smooth animation
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, trashedInfo.expiresAt - Date.now());
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [trashedInfo.expiresAt]);

  // Calculate progress based on actual duration
  const progress = Math.max(0, Math.min(1, timeRemaining / totalDuration));
  const secondsRemaining = Math.ceil(timeRemaining / 1000);

  const handleRestore = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      restoreTerminal(terminal.id);
    },
    [restoreTerminal, terminal.id]
  );

  const handleImmediateClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeTerminal(terminal.id);
    },
    [removeTerminal, terminal.id]
  );

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded text-xs border transition-all relative overflow-hidden",
        compact
          ? // Compact mode: muted orange tones, no progress bar
            "px-2 py-1 bg-orange-500/5 border-orange-500/20 text-orange-300/80"
          : // Default mode: more prominent orange styling with progress bar
            "px-3 py-1.5 bg-orange-500/10 border-orange-500/30 text-orange-200"
      )}
      role="status"
      aria-live="polite"
      aria-label={`${terminal.title} will be deleted in ${secondsRemaining} seconds`}
    >
      {/* Progress bar background - only in non-compact mode */}
      {!compact && (
        <div
          className="absolute inset-0 bg-orange-500/15 transition-all duration-100"
          style={{ width: `${progress * 100}%` }}
          aria-hidden="true"
        />
      )}

      {/* Content layer */}
      <div className="flex items-center gap-1.5 relative z-10">
        {/* Terminal type icon */}
        {getTerminalIcon(terminal.type, compact ? "text-orange-400/70" : "text-orange-300")}

        {/* Countdown */}
        <span
          className={cn(
            "font-mono tabular-nums text-center",
            compact ? "text-orange-400/70 w-4" : "text-orange-300 w-5"
          )}
          aria-hidden="true"
        >
          {secondsRemaining}s
        </span>

        {/* Terminal title - narrower in compact mode */}
        <span
          className={cn(
            "truncate font-mono",
            compact ? "max-w-[60px] opacity-60" : "max-w-[80px] opacity-70"
          )}
        >
          {terminal.title}
        </span>

        {/* Restore button */}
        <button
          onClick={handleRestore}
          className={cn(
            "rounded transition-colors",
            compact
              ? "p-0.5 hover:bg-emerald-500/20 text-emerald-400/70 hover:text-emerald-400"
              : "p-1 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300"
          )}
          aria-label={`Restore ${terminal.title}`}
        >
          <Undo2 className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} aria-hidden="true" />
        </button>

        {/* Immediate close button - red for destructive action */}
        <button
          onClick={handleImmediateClose}
          className={cn(
            "rounded transition-colors",
            compact
              ? "p-0.5 hover:bg-red-500/20 text-red-400/70 hover:text-red-400"
              : "p-1 hover:bg-red-500/30 text-red-400 hover:text-red-300"
          )}
          aria-label={`Delete ${terminal.title} immediately`}
        >
          <X className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
