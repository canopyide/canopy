/**
 * ActivityBadge Component
 *
 * Displays a semantic activity headline badge in terminal headers.
 * Shows AI-generated activity descriptions like "Running tests",
 * "Installing dependencies", or "Waiting for confirmation".
 *
 * Activity Types:
 * - interactive: User-facing tasks (cyan styling)
 * - background: Background processes like watchers (purple styling)
 * - idle: No active task (gray styling)
 *
 * Activity Status:
 * - working: Blue - actively processing
 * - waiting: Yellow - needs user input
 * - success: Green - completed successfully
 * - failure: Red - encountered an error
 */

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Activity status affects the badge color */
export type ActivityStatus = "working" | "waiting" | "success" | "failure";

/** Activity type distinguishes interactive vs background tasks */
export type ActivityType = "interactive" | "background" | "idle";

interface ActivityBadgeProps {
  /** AI-generated activity headline */
  headline: string;
  /** Current activity status */
  status: ActivityStatus;
  /** Type of activity (interactive vs background) */
  type: ActivityType;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Get status-based color classes for the badge
 */
function getStatusColor(status: ActivityStatus): string {
  switch (status) {
    case "working":
      return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "waiting":
      return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    case "success":
      return "bg-green-500/20 text-green-300 border-green-500/30";
    case "failure":
      return "bg-red-500/20 text-red-300 border-red-500/30";
  }
}

/**
 * Get type-based color classes for the type indicator
 */
function getTypeColor(type: ActivityType): string {
  switch (type) {
    case "background":
      return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    case "interactive":
      return "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
    case "idle":
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

export function ActivityBadge({ headline, status, type, className }: ActivityBadgeProps) {
  // Don't render if no headline
  if (!headline) {
    return null;
  }

  // Create accessible status label
  const statusLabel = `${status} - ${headline}${type === "background" ? " (background task)" : ""}`;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-mono",
        getStatusColor(status),
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={statusLabel}
      title={`${headline} (${type})`}
    >
      {/* Show spinner for working status */}
      {status === "working" && (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      )}

      {/* Headline text with truncation */}
      <span className="truncate max-w-[150px]" aria-hidden="true">
        {headline}
      </span>

      {/* Background type indicator */}
      {type === "background" && (
        <span
          className={cn("text-[10px] px-1 rounded border", getTypeColor(type))}
          aria-hidden="true"
        >
          bg
        </span>
      )}
    </div>
  );
}

export default ActivityBadge;
