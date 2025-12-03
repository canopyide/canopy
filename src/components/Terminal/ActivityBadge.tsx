import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActivityStatus = "working" | "waiting" | "success" | "failure";

export type ActivityType = "interactive" | "background" | "idle";

interface ActivityBadgeProps {
  headline: string;
  status: ActivityStatus;
  type: ActivityType;
  className?: string;
}

function getStatusColor(status: ActivityStatus): string {
  switch (status) {
    case "working":
      return "bg-[color-mix(in_oklab,var(--color-state-working)_15%,transparent)] text-[var(--color-state-working)] border-[var(--color-state-working)]/40";
    case "waiting":
      return "bg-[color-mix(in_oklab,var(--color-status-warning)_15%,transparent)] text-[var(--color-status-warning)] border-[var(--color-status-warning)]/40";
    case "success":
      return "bg-[color-mix(in_oklab,var(--color-status-success)_15%,transparent)] text-[var(--color-status-success)] border-[var(--color-status-success)]/40";
    case "failure":
      return "bg-[color-mix(in_oklab,var(--color-status-error)_15%,transparent)] text-[var(--color-status-error)] border-[var(--color-status-error)]/40";
  }
}

function getTypeColor(type: ActivityType): string {
  switch (type) {
    case "background":
      return "bg-[color-mix(in_oklab,var(--color-state-working)_15%,transparent)] text-[var(--color-state-working)] border-[var(--color-state-working)]/40";
    case "interactive":
      return "bg-[color-mix(in_oklab,var(--color-status-info)_15%,transparent)] text-[var(--color-status-info)] border-[var(--color-status-info)]/40";
    case "idle":
      return "bg-canopy-sidebar/20 text-canopy-text/60 border-canopy-border/40";
  }
}

export function ActivityBadge({ headline, status, type, className }: ActivityBadgeProps) {
  if (!headline) {
    return null;
  }

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
      {status === "working" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}

      <span className="truncate max-w-[150px]" aria-hidden="true">
        {headline}
      </span>

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
