/**
 * Hook to get terminals associated with a specific worktree
 *
 * Filters terminals by worktreeId and provides count statistics by agent state,
 * as well as the dominant agent state for display in the UI.
 */

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTerminalStore, type TerminalInstance } from "@/store/terminalStore";
import type { AgentState } from "@/types";
import { getDominantAgentState } from "@/components/Worktree/AgentStatusIndicator";

export interface WorktreeTerminalCounts {
  total: number;
  byState: Record<AgentState, number>;
}

export interface UseWorktreeTerminalsResult {
  terminals: TerminalInstance[];
  counts: WorktreeTerminalCounts;
  /** The dominant agent state across all terminals in this worktree (null if all idle/none) */
  dominantAgentState: AgentState | null;
}

/**
 * Get terminals and counts for a specific worktree
 *
 * @param worktreeId - The worktree ID to filter terminals by
 * @returns Terminals, aggregated counts, and dominant agent state
 */
export function useWorktreeTerminals(worktreeId: string): UseWorktreeTerminalsResult {
  // Use useShallow to prevent infinite loops.
  // Without this, .filter() returns a new reference every render,
  // breaking React's useSyncExternalStore contract.
  const terminals = useTerminalStore(
    useShallow((state) => state.terminals.filter((t) => t.worktreeId === worktreeId))
  );

  return useMemo(() => {
    // Calculate counts by state
    const byState: Record<AgentState, number> = {
      idle: 0,
      working: 0,
      waiting: 0,
      completed: 0,
      failed: 0,
    };

    const agentStates: (AgentState | undefined)[] = [];

    terminals.forEach((terminal) => {
      // Default to 'idle' for terminals without agentState (e.g., shell terminals)
      const state = terminal.agentState || "idle";
      byState[state] = (byState[state] || 0) + 1;

      // Collect agent states for determining dominant state
      // Only include agent terminals (those with agentState defined)
      if (terminal.agentState) {
        agentStates.push(terminal.agentState);
      }
    });

    // Calculate dominant state using priority-based aggregation
    const dominantAgentState = getDominantAgentState(agentStates);

    return {
      terminals,
      counts: {
        total: terminals.length,
        byState,
      },
      dominantAgentState,
    };
  }, [terminals]);
}
