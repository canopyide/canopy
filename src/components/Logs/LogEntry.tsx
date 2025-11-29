/**
 * LogEntry Component
 *
 * Displays a single log entry with timestamp, level badge, message,
 * and expandable context.
 */

import { memo, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { LogEntry as LogEntryType, LogLevel } from "@/types";

interface LogEntryProps {
  entry: LogEntryType;
  isExpanded: boolean;
  onToggle: () => void;
}

const LEVEL_COLORS: Record<LogLevel, { bg: string; text: string; border: string }> = {
  debug: {
    bg: "bg-gray-500/20",
    text: "text-gray-400",
    border: "border-gray-500/30",
  },
  info: {
    bg: "bg-blue-500/20",
    text: "text-[var(--color-status-info)]",
    border: "border-blue-500/30",
  },
  warn: {
    bg: "bg-yellow-500/20",
    text: "text-[var(--color-status-warning)]",
    border: "border-yellow-500/30",
  },
  error: {
    bg: "bg-red-500/20",
    text: "text-[var(--color-status-error)]",
    border: "border-red-500/30",
  },
};

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatContext(context: Record<string, unknown>): string {
  return JSON.stringify(context, null, 2);
}

function LogEntryComponent({ entry, isExpanded, onToggle }: LogEntryProps) {
  const colors = LEVEL_COLORS[entry.level];
  const hasContext = entry.context && Object.keys(entry.context).length > 0;
  const contextPanelId = hasContext ? `context-${entry.id}` : undefined;

  const handleClick = useCallback(() => {
    if (hasContext) {
      onToggle();
    }
  }, [hasContext, onToggle]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (hasContext && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onToggle();
      }
    },
    [hasContext, onToggle]
  );

  return (
    <div
      className={cn(
        "border-b border-gray-800/50 py-1.5 px-2",
        hasContext && "cursor-pointer hover:bg-gray-800/30",
        isExpanded && "bg-gray-800/20"
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={hasContext ? "button" : undefined}
      tabIndex={hasContext ? 0 : undefined}
      aria-expanded={hasContext ? isExpanded : undefined}
      aria-controls={contextPanelId}
      aria-label={
        hasContext
          ? `Log entry: ${entry.message}. Press to ${isExpanded ? "collapse" : "expand"} context.`
          : undefined
      }
    >
      {/* Main row */}
      <div className="flex items-start gap-2 min-w-0">
        {/* Timestamp */}
        <span
          className="text-gray-500 text-xs font-mono shrink-0"
          title={new Date(entry.timestamp).toISOString()}
        >
          {formatTimestamp(entry.timestamp)}
        </span>

        {/* Level badge */}
        <span
          className={cn(
            "text-xs font-medium px-1.5 py-0.5 rounded shrink-0 uppercase",
            colors.bg,
            colors.text
          )}
        >
          {entry.level}
        </span>

        {/* Source */}
        {entry.source && (
          <span className="text-purple-400 text-xs font-mono shrink-0">[{entry.source}]</span>
        )}

        {/* Message */}
        <span className="text-gray-200 text-xs font-mono break-words min-w-0 flex-1">
          {entry.message}
        </span>

        {/* Expand indicator */}
        {hasContext && (
          <span className="text-gray-500 text-xs shrink-0">{isExpanded ? "[-]" : "[+]"}</span>
        )}
      </div>

      {/* Expanded context */}
      {isExpanded && hasContext && (
        <div
          id={contextPanelId}
          className={cn(
            "mt-2 ml-[72px] p-2 rounded border text-xs font-mono overflow-x-auto",
            colors.border,
            "bg-gray-900/50"
          )}
          role="region"
          aria-label="Log entry context"
        >
          <pre className="text-gray-300 whitespace-pre-wrap">{formatContext(entry.context!)}</pre>
        </div>
      )}
    </div>
  );
}

export const LogEntry = memo(LogEntryComponent);
