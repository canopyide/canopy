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
  dominantAgentState: AgentState | null;
}

export function useWorktreeTerminals(worktreeId: string): UseWorktreeTerminalsResult {
  // Use useShallow to prevent infinite loops.
  // Without this, .filter() returns a new reference every render,
  // breaking React's useSyncExternalStore contract.
  const terminals = useTerminalStore(
    useShallow((state) =>
      state.terminals.filter((t) => t.worktreeId === worktreeId && t.location !== "trash")
    )
  );

  return useMemo(() => {
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

      // Only include agent terminals (those with agentState defined)
      if (terminal.agentState) {
        agentStates.push(terminal.agentState);
      }
    });

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
