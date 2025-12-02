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
      return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    case "waiting":
      return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    case "success":
      return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "failure":
      return "bg-red-500/20 text-red-300 border-red-500/30";
  }
}

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
