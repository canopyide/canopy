/**
 * ErrorBanner Component
 *
 * Displays inline error messages next to affected components with:
 * - Error icon and user-friendly message
 * - Details expander for technical info
 * - Retry button (if transient)
 * - Dismiss button
 */

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { AppError, RetryAction } from "@/store/errorStore";

export interface ErrorBannerProps {
  /** Error to display */
  error: AppError;
  /** Called when user clicks dismiss */
  onDismiss: (id: string) => void;
  /** Called when user clicks retry */
  onRetry?: (id: string, action: RetryAction, args?: Record<string, unknown>) => void;
  /** Additional CSS classes */
  className?: string;
  /** Compact mode for inline display */
  compact?: boolean;
}

const ERROR_TYPE_LABELS: Record<string, string> = {
  git: "Git Error",
  process: "Process Error",
  filesystem: "File System Error",
  network: "Network Error",
  config: "Configuration Error",
  unknown: "Error",
};

const ERROR_TYPE_ICONS: Record<string, string> = {
  git: "📂",
  process: "⚙️",
  filesystem: "📁",
  network: "🌐",
  config: "⚠️",
  unknown: "❌",
};

export function ErrorBanner({
  error,
  onDismiss,
  onRetry,
  className,
  compact = false,
}: ErrorBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = useCallback(async () => {
    if (!error.retryAction || !onRetry) return;

    setIsRetrying(true);
    try {
      await onRetry(error.id, error.retryAction, error.retryArgs);
    } finally {
      setIsRetrying(false);
    }
  }, [error.id, error.retryAction, error.retryArgs, onRetry]);

  const handleDismiss = useCallback(() => {
    onDismiss(error.id);
  }, [error.id, onDismiss]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const typeLabel = ERROR_TYPE_LABELS[error.type] || "Error";
  const typeIcon = ERROR_TYPE_ICONS[error.type] || "❌";
  const canRetry = error.isTransient && error.retryAction && onRetry;

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1 text-xs bg-red-900/30 border border-red-700/50 rounded",
          className
        )}
      >
        <span className="shrink-0">{typeIcon}</span>
        <span className="text-red-300 truncate flex-1">{error.message}</span>
        {canRetry && (
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className={cn(
              "px-1.5 py-0.5 text-xs text-red-300 hover:text-red-200 border border-red-600 rounded",
              isRetrying && "opacity-50 cursor-not-allowed"
            )}
          >
            {isRetrying ? "..." : "Retry"}
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="text-[var(--color-status-error)] hover:text-red-300"
          aria-label="Dismiss error"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn("border border-red-700/50 bg-red-900/20 rounded-lg overflow-hidden", className)}
      role="alert"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30">
        <span className="shrink-0 text-lg">{typeIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-status-error)] font-medium">
              {typeLabel}
            </span>
            {error.source && <span className="text-xs text-red-500">• {error.source}</span>}
          </div>
          <p className="text-sm text-red-200 truncate">{error.message}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {error.details && (
            <button
              onClick={toggleExpanded}
              className="px-2 py-1 text-xs text-red-300 hover:text-red-200 hover:bg-red-800/50 rounded"
            >
              {isExpanded ? "Hide" : "Details"}
            </button>
          )}
          {canRetry && (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className={cn(
                "px-2 py-1 text-xs text-green-300 hover:text-green-200 border border-green-600 hover:bg-green-800/50 rounded",
                isRetrying && "opacity-50 cursor-not-allowed"
              )}
            >
              {isRetrying ? "Retrying..." : "Retry"}
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="p-1 text-[var(--color-status-error)] hover:text-red-300 hover:bg-red-800/50 rounded"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      </div>

      {/* Details (expandable) */}
      {isExpanded && error.details && (
        <div className="px-3 py-2 border-t border-red-700/30 bg-red-950/30">
          <pre className="text-xs text-red-300/80 whitespace-pre-wrap break-all font-mono overflow-x-auto">
            {error.details}
          </pre>
        </div>
      )}
    </div>
  );
}

export default ErrorBanner;
