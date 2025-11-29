/**
 * ProblemsPanel Component
 *
 * Global error list panel showing recent errors across the application.
 * Features:
 * - Table showing recent errors (last 50)
 * - Columns: Time, Type, Message, Source
 * - Click to expand details
 * - Clear All button
 * - Auto-dismiss on retry success
 * - Keyboard navigation support
 */

import { useMemo, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { useErrorStore, type AppError, type RetryAction } from "@/store";

export interface ProblemsPanelProps {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Called when user closes the panel */
  onClose: () => void;
  /** Called when user clicks retry */
  onRetry?: (id: string, action: RetryAction, args?: Record<string, unknown>) => void;
  /** Additional CSS classes */
  className?: string;
}

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

function ErrorRow({
  error,
  isExpanded,
  onToggleExpand,
  onDismiss,
  onRetry,
}: {
  error: AppError;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDismiss: () => void;
  onRetry?: () => void;
}) {
  const typeLabel = ERROR_TYPE_LABELS[error.type] || "Error";
  const typeColor = ERROR_TYPE_COLORS[error.type] || "text-[var(--color-status-error)]";
  const canRetry = error.isTransient && error.retryAction && onRetry;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggleExpand();
    }
  };

  return (
    <>
      <tr
        className={cn(
          "hover:bg-gray-800/50 cursor-pointer transition-colors",
          isExpanded && "bg-gray-800/30"
        )}
        onClick={onToggleExpand}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-expanded={isExpanded}
        aria-label={`${typeLabel}: ${error.message}`}
      >
        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
          {formatTimestamp(error.timestamp)}
        </td>
        <td className={cn("px-3 py-2 text-xs whitespace-nowrap font-medium", typeColor)}>
          {typeLabel}
        </td>
        <td className="px-3 py-2 text-sm text-gray-300 truncate max-w-md">{error.message}</td>
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
        <tr className="bg-gray-900/50">
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

export function ProblemsPanel({ isOpen, onClose, onRetry, className }: ProblemsPanelProps) {
  const errors = useErrorStore((state) => state.errors);
  const dismissError = useErrorStore((state) => state.dismissError);
  const clearAll = useErrorStore((state) => state.clearAll);

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

  const handleOpenLogs = useCallback(() => {
    window.electron?.errors?.openLogs();
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 bg-canopy-bg border-t border-canopy-border shadow-2xl",
        "transform transition-transform duration-200",
        isOpen ? "translate-y-0" : "translate-y-full",
        className
      )}
      style={{ height: "40vh", maxHeight: "400px", minHeight: "200px" }}
      role="region"
      aria-label="Problems panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-canopy-sidebar border-b border-canopy-border">
        <div className="flex items-center gap-3">
          <h2 className="section-header">Problems</h2>
          <span className="px-2 py-0.5 text-xs bg-red-900/50 text-red-300 rounded-full">
            {activeErrors.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenLogs}
            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded"
          >
            Open Logs
          </button>
          <button
            onClick={clearAll}
            disabled={activeErrors.length === 0}
            className={cn(
              "px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded",
              activeErrors.length === 0 && "opacity-50 cursor-not-allowed"
            )}
          >
            Clear All
          </button>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded"
            aria-label="Close problems panel"
          >
            ×
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="overflow-auto h-full">
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
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 w-28">
                  Source
                </th>
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
    </div>
  );
}

export default ProblemsPanel;
