/**
 * TrashedTerminalItem Component
 *
 * Displays a terminal that's pending deletion with a countdown timer.
 * Shows a restore button and countdown progress bar.
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

export function TrashedTerminalItem({ terminal, trashedInfo }: TrashedTerminalItemProps) {
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
        "flex items-center gap-2 px-3 py-1.5 rounded text-xs border transition-all relative overflow-hidden",
        "bg-red-500/10 border-red-500/30 text-red-200"
      )}
      role="status"
      aria-live="polite"
      aria-label={`${terminal.title} will be deleted in ${secondsRemaining} seconds`}
    >
      {/* Progress bar background */}
      <div
        className="absolute inset-0 bg-red-500/20 transition-all duration-100"
        style={{ width: `${progress * 100}%` }}
        aria-hidden="true"
      />

      {/* Content layer */}
      <div className="flex items-center gap-2 relative z-10">
        {/* Terminal type icon */}
        {getTerminalIcon(terminal.type, "text-red-300")}

        {/* Countdown */}
        <span className="font-mono text-red-300 tabular-nums w-5 text-center" aria-hidden="true">
          {secondsRemaining}s
        </span>

        {/* Terminal title */}
        <span className="truncate max-w-[80px] font-mono opacity-70">{terminal.title}</span>

        {/* Restore button */}
        <button
          onClick={handleRestore}
          className="p-1 hover:bg-green-500/20 rounded transition-colors text-green-300 hover:text-green-200"
          aria-label={`Restore ${terminal.title}`}
        >
          <Undo2 className="w-3 h-3" aria-hidden="true" />
        </button>

        {/* Immediate close button */}
        <button
          onClick={handleImmediateClose}
          className="p-1 hover:bg-red-500/30 rounded transition-colors text-red-300 hover:text-red-200"
          aria-label={`Delete ${terminal.title} immediately`}
        >
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
