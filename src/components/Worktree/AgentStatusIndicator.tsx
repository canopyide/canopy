/**
 * AgentStatusIndicator displays a visual indicator of agent lifecycle state.
 *
 * States:
 * - idle: No indicator (agent spawned but not active)
 * - working: Spinner icon with blue pulse (agent processing)
 * - waiting: Question mark icon with yellow pulse (needs user input)
 * - completed: Checkmark icon in green (agent finished successfully)
 * - failed: X icon in red (agent encountered error)
 */

import { cn } from "../../lib/utils";
import type { AgentState } from "@/types";

interface AgentStatusIndicatorProps {
  /** Current agent state (null or undefined shows no indicator) */
  state: AgentState | null | undefined;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Maps agent states to their visual properties.
 * idle is excluded as it doesn't show an indicator.
 */
const STATE_CONFIG: Record<
  Exclude<AgentState, "idle">,
  {
    icon: string;
    color: string;
    pulse: boolean;
    label: string;
    tooltip: string;
  }
> = {
  working: {
    icon: "⟳",
    color: "text-blue-400",
    pulse: true,
    label: "working",
    tooltip: "Agent is processing",
  },
  waiting: {
    icon: "?",
    color: "text-yellow-400",
    pulse: true,
    label: "waiting",
    tooltip: "Agent is waiting for input",
  },
  completed: {
    icon: "✓",
    color: "text-green-400",
    pulse: false,
    label: "completed",
    tooltip: "Agent completed successfully",
  },
  failed: {
    icon: "✗",
    color: "text-red-400",
    pulse: false,
    label: "failed",
    tooltip: "Agent encountered an error",
  },
};

export function AgentStatusIndicator({ state, className }: AgentStatusIndicatorProps) {
  // Don't render for idle or no state
  if (!state || state === "idle") {
    return null;
  }

  const config = STATE_CONFIG[state];
  if (!config) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold",
        config.color,
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

/**
 * Priority order for aggregating multiple agent states.
 * Higher priority states take precedence when multiple agents are present.
 *
 * 1. waiting - needs user attention
 * 2. working - actively processing
 * 3. failed - has errors to address
 * 4. completed - finished successfully
 * 5. idle - default state
 */
const STATE_PRIORITY: Record<AgentState, number> = {
  waiting: 5,
  working: 4,
  failed: 3,
  completed: 2,
  idle: 1,
};

/**
 * Aggregates multiple agent states to determine the dominant state.
 * Prioritizes states that need user attention (waiting) over others.
 *
 * @param states - Array of agent states to aggregate
 * @returns The highest-priority state, or null if all are idle/empty
 */
export function getDominantAgentState(states: (AgentState | undefined)[]): AgentState | null {
  const validStates = states.filter((s): s is AgentState => s !== undefined);

  if (validStates.length === 0) {
    return null;
  }

  // Find the state with highest priority
  let dominant: AgentState = "idle";
  let highestPriority = 0;

  for (const state of validStates) {
    const priority = STATE_PRIORITY[state] ?? 0;
    if (priority > highestPriority) {
      highestPriority = priority;
      dominant = state;
    }
  }

  // Return null if only idle states found
  return dominant === "idle" ? null : dominant;
}
