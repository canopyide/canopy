import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentState } from "@/types";

interface StateBadgeProps {
  state: AgentState;
  className?: string;
}

const STATE_CONFIG: Record<
  Exclude<AgentState, "idle">,
  {
    icon: ReactNode;
    label: string;
    className: string;
    tooltip: string;
  }
> = {
  working: {
    icon: <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />,
    label: "Working",
    className: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    tooltip: "Agent is processing",
  },
  waiting: {
    icon: <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />,
    label: "Waiting",
    className: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    tooltip: "Agent is waiting for input",
  },
  completed: {
    icon: (
      <span className="text-emerald-400" aria-hidden="true">
        ✓
      </span>
    ),
    label: "Completed",
    className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    tooltip: "Agent completed successfully",
  },
  failed: {
    icon: (
      <span className="text-red-400" aria-hidden="true">
        ✗
      </span>
    ),
    label: "Failed",
    className: "bg-red-500/20 text-red-300 border-red-500/30",
    tooltip: "Agent encountered an error",
  },
};

export function StateBadge({ state, className }: StateBadgeProps) {
  if (state === "idle") {
    return null;
  }

  const config = STATE_CONFIG[state];
  if (!config) {
    return null;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-mono",
        config.className,
        className
      )}
      role="status"
      aria-live="polite"
      title={config.tooltip}
    >
      {config.icon}
      <span>{config.label}</span>
    </div>
  );
}

export default StateBadge;
