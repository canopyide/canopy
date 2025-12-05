import type { StateCreator } from "zustand";
import type { TerminalInstance } from "./terminalRegistrySlice";
import type { AgentState } from "@/types";
import { isAgentTerminal } from "../utils/terminalTypeGuards";

export interface TerminalBulkActionsSlice {
  bulkCloseByState: (states: AgentState | AgentState[]) => void;
  bulkCloseByWorktree: (worktreeId: string, state?: AgentState) => void;
  bulkCloseAll: () => void;
  restartFailedAgents: () => Promise<void>;
  restartIdleAgents: () => Promise<void>;
  getCountByState: (state: AgentState) => number;
  getCountByWorktree: (worktreeId: string, state?: AgentState) => number;
}

export const createTerminalBulkActionsSlice = (
  getTerminals: () => TerminalInstance[],
  removeTerminal: (id: string) => void,
  restartTerminal: (id: string) => Promise<void>
): StateCreator<TerminalBulkActionsSlice, [], [], TerminalBulkActionsSlice> => {
  const restartTerminals = async (terminalsToRestart: TerminalInstance[]) => {
    for (const terminal of terminalsToRestart) {
      try {
        await restartTerminal(terminal.id);
      } catch (error) {
        console.error(`Failed to restart terminal ${terminal.id}:`, error);
      }
    }
  };

  return () => ({
    bulkCloseByState: (states) => {
      const stateArray = Array.isArray(states) ? states : [states];
      const terminals = getTerminals();
      const toRemove = terminals.filter((t) => t.agentState && stateArray.includes(t.agentState));
      toRemove.forEach((t) => removeTerminal(t.id));
    },

    bulkCloseByWorktree: (worktreeId, state) => {
      const terminals = getTerminals();
      const toRemove = terminals.filter(
        (t) => t.worktreeId === worktreeId && (!state || t.agentState === state)
      );
      toRemove.forEach((t) => removeTerminal(t.id));
    },

    bulkCloseAll: () => {
      const terminals = getTerminals();
      terminals.forEach((t) => removeTerminal(t.id));
    },

    restartFailedAgents: async () => {
      const terminals = getTerminals();
      const failedAgents = terminals.filter(
        (t) => t.agentState === "failed" && isAgentTerminal(t.type)
      );
      await restartTerminals(failedAgents);
    },

    restartIdleAgents: async () => {
      const terminals = getTerminals();
      const idleAgents = terminals.filter(
        (t) => t.agentState === "idle" && isAgentTerminal(t.type)
      );
      await restartTerminals(idleAgents);
    },

    getCountByState: (state) => {
      const terminals = getTerminals();
      return terminals.filter((t) => t.agentState === state).length;
    },

    getCountByWorktree: (worktreeId, state) => {
      const terminals = getTerminals();
      return terminals.filter(
        (t) => t.worktreeId === worktreeId && (!state || t.agentState === state)
      ).length;
    },
  });
};
