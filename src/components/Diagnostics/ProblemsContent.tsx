/**
 * ProblemsContent Component
 *
 * Content component for the Problems tab in the diagnostics dock.
 * Displays errors table extracted from the original ProblemsPanel.
 */

import { useMemo, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { useErrorStore, type AppError, type RetryAction } from "@/store";

const ERROR_TYPE_LABELS: Record<string, string> = {
  git: "Git",
  process: "Process",
  filesystem: "File",
  network: "Network",
  config: "Config",
  unknown: "Other",
};

const ERROR_TYPE_COLORS: Record<string, string> = {
  git: "text-orange-400",
  process: "text-[var(--color-status-warning)]",
  filesystem: "text-[var(--color-status-info)]",
  network: "text-purple-400",
  config: "text-amber-400",
  unknown: "text-[var(--color-status-error)]",
};

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

interface ErrorRowProps {
  error: AppError;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDismiss: () => void;
  onRetry?: () => void;
}

function ErrorRow({ error, isExpanded, onToggleExpand, onDismiss, onRetry }: ErrorRowProps) {
  const typeLabel = ERROR_TYPE_LABELS[error.type] || "Error";
  const typeColor = ERROR_TYPE_COLORS[error.type] || "text-[var(--color-status-error)]";
  const canRetry = error.isTransient && error.retryAction && onRetry;

  return (
    <>
      <tr className={cn("hover:bg-gray-800/50 transition-colors", isExpanded && "bg-gray-800/30")}>
        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
          {formatTimestamp(error.timestamp)}
        </td>
        <td className={cn("px-3 py-2 text-xs whitespace-nowrap font-medium", typeColor)}>
          {typeLabel}
        </td>
        <td className="px-3 py-2 text-sm text-gray-300 max-w-md">
          <button
            onClick={onToggleExpand}
            className="text-left w-full hover:text-white transition-colors"
            aria-expanded={isExpanded}
            aria-controls={`error-details-${error.id}`}
          >
            <span className="truncate block">{error.message}</span>
          </button>
        </td>
        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{error.source || "-"}</td>
        <td className="px-3 py-2 whitespace-nowrap">
          <div className="flex items-center gap-1">
            {canRetry && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                className="px-2 py-0.5 text-xs text-green-300 hover:text-green-200 border border-green-600 hover:bg-green-800/50 rounded"
              >
                Retry
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="p-1 text-gray-500 hover:text-gray-300"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && error.details && (
        <tr className="bg-gray-900/50" id={`error-details-${error.id}`}>
          <td colSpan={5} className="px-3 py-2">
            <pre className="text-xs text-gray-400 whitespace-pre-wrap break-all font-mono max-h-40 overflow-y-auto">
              {error.details}
            </pre>
            {error.context && Object.keys(error.context).length > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                <span className="font-medium">Context: </span>
                {Object.entries(error.context)
                  .filter(([, v]) => v !== undefined)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ")}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export interface ProblemsContentProps {
  onRetry?: (id: string, action: RetryAction, args?: Record<string, unknown>) => void;
  className?: string;
}

export function ProblemsContent({ onRetry, className }: ProblemsContentProps) {
  const errors = useErrorStore((state) => state.errors);
  const dismissError = useErrorStore((state) => state.dismissError);

  // Track expanded rows
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const activeErrors = useMemo(() => {
    return errors.filter((e) => !e.dismissed);
  }, [errors]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className={cn("h-full overflow-auto", className)}>
      {activeErrors.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
          No problems detected
        </div>
      ) : (
        <table className="w-full">
          <thead className="sticky top-0 bg-canopy-sidebar border-b border-canopy-border">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 w-24">Time</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 w-20">Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Message</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 w-28">Source</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {activeErrors.map((error) => (
              <ErrorRow
                key={error.id}
                error={error}
                isExpanded={expandedIds.has(error.id)}
                onToggleExpand={() => handleToggleExpand(error.id)}
                onDismiss={() => dismissError(error.id)}
                onRetry={
                  error.retryAction && onRetry
                    ? () => onRetry(error.id, error.retryAction!, error.retryArgs)
                    : undefined
                }
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
