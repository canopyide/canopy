/**
 * ProgressBar Component
 *
 * Displays progress information during CopyTree context generation.
 * Shows a progress bar, current stage/message, and optional cancel button.
 */

import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import type { CopyTreeProgress } from "@/hooks/useContextInjection";

export interface ProgressBarProps {
  /** Current progress information */
  progress: CopyTreeProgress;
  /** Called when cancel button is clicked */
  onCancel?: () => void;
  /** Whether to show in compact mode (inline) */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function ProgressBar({ progress, onCancel, compact = false, className }: ProgressBarProps) {
  const percentage = Math.round(progress.progress * 100);

  if (compact) {
    return (
      <div
        className={cn("flex items-center gap-2 text-sm text-canopy-text-muted", className)}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
        aria-valuetext={progress.message || progress.stage}
        aria-live="polite"
      >
        <Loader2 className="h-3 w-3 animate-spin text-canopy-accent shrink-0" aria-hidden="true" />
        <span className="truncate max-w-[200px]">{progress.message}</span>
        <span className="font-mono text-xs shrink-0">{percentage}%</span>
        {onCancel && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="p-0.5 hover:bg-red-900/50 rounded text-gray-400 hover:text-[var(--color-status-error)] transition-colors shrink-0"
            title="Cancel"
            aria-label="Cancel context generation"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col gap-1.5 p-2 bg-canopy-bg/80 rounded", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
      aria-valuetext={`${progress.stage}: ${progress.message || percentage + "%"}`}
      aria-live="polite"
    >
      {/* Header with message and percentage */}
      <div className="flex justify-between items-center text-xs">
        <span className="text-canopy-text-muted truncate pr-2">{progress.message}</span>
        <span className="text-canopy-text font-mono shrink-0">{percentage}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-canopy-sidebar rounded-full overflow-hidden">
        <div
          className="h-full bg-canopy-accent transition-all duration-150 ease-out"
          style={{ width: `${percentage}%` }}
          aria-hidden="true"
        />
      </div>

      {/* Footer with stage info and cancel button */}
      <div className="flex justify-between items-center text-xs">
        <span className="text-canopy-text-muted/70 truncate">
          {progress.stage}
          {progress.filesProcessed !== undefined && progress.totalFiles !== undefined && (
            <span className="ml-1">
              ({progress.filesProcessed}/{progress.totalFiles} files)
            </span>
          )}
        </span>
        {onCancel && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="text-[var(--color-status-error)] hover:text-red-300 transition-colors shrink-0"
            title="Cancel"
            aria-label="Cancel context generation"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default ProgressBar;
