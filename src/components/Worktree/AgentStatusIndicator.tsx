import { cn } from "../../lib/utils";
import type { AgentState } from "@/types";

interface AgentStatusIndicatorProps {
  state: AgentState | null | undefined;
  className?: string;
}

const STATE_CONFIG: Record<
  Exclude<AgentState, "idle">,
  {
    icon: string;
    color: string;
    bgColor?: string;
    borderColor?: string;
    pulse: boolean;
    label: string;
    tooltip: string;
  }
> = {
  working: {
    icon: "⟳",
    color: "status-working",
    pulse: false,
    label: "working",
    tooltip: "Agent is working on your request",
  },
  waiting: {
    icon: "?",
    color: "text-canopy-bg",
    bgColor: "bg-[var(--color-state-waiting)]",
    pulse: false,
    label: "waiting",
    tooltip: "Agent is waiting for your direction",
  },
  completed: {
    icon: "✓",
    color: "text-[var(--color-status-success)]",
    pulse: false,
    label: "completed",
    tooltip: "Agent finished this task",
  },
  failed: {
    icon: "✗",
    color: "text-[var(--color-status-error)]",
    borderColor: "border-[var(--color-status-error)]",
    pulse: false,
    label: "failed",
    tooltip: "Agent ran into an issue",
  },
};

export function AgentStatusIndicator({ state, className }: AgentStatusIndicatorProps) {
  if (!state || state === "idle" || state === "waiting") {
    return null;
  }

  const config = STATE_CONFIG[state];
  if (!config) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full",
        config.color,
        config.bgColor,
        config.borderColor && "border",
        config.borderColor,
        config.pulse && "animate-agent-pulse",
        className
      )}
      role="status"
      aria-label={`Agent status: ${config.label}`}
      title={config.tooltip}
    >
      {config.icon}
    </span>
  );
}

const STATE_PRIORITY: Record<AgentState, number> = {
  failed: 5,
  working: 4,
  completed: 3,
  waiting: 2,
  idle: 1,
};

export function getDominantAgentState(states: (AgentState | undefined)[]): AgentState | null {
  const validStates = states.filter((s): s is AgentState => s !== undefined);

  if (validStates.length === 0) {
    return null;
  }

  let dominant: AgentState = "idle";
  let highestPriority = 0;

  for (const state of validStates) {
    const priority = STATE_PRIORITY[state] ?? 0;
    if (priority > highestPriority) {
      highestPriority = priority;
      dominant = state;
    }
  }

  return dominant === "idle" ? null : dominant;
}
