import type { StateCreator } from "zustand";
import type { TerminalInstance, AddTerminalOptions } from "./terminalRegistrySlice";
import type { AgentState } from "@/types";

export interface TerminalBulkActionsSlice {
  bulkCloseByState: (states: AgentState | AgentState[]) => void;
  bulkCloseByWorktree: (worktreeId: string, state?: AgentState) => void;
  bulkCloseAll: () => void;
  restartFailedAgents: () => Promise<void>;
  getCountByState: (state: AgentState) => number;
  getCountByWorktree: (worktreeId: string, state?: AgentState) => number;
}

export const createTerminalBulkActionsSlice = (
  getTerminals: () => TerminalInstance[],
  removeTerminal: (id: string) => void,
  addTerminal: (options: AddTerminalOptions) => Promise<string>
): StateCreator<TerminalBulkActionsSlice, [], [], TerminalBulkActionsSlice> => {
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
      const failed = terminals.filter(
        (t) => t.agentState === "failed" && (t.type === "claude" || t.type === "gemini")
      );

      for (const terminal of failed) {
        try {
          const config: AddTerminalOptions = {
            type: terminal.type,
            title: terminal.title,
            worktreeId: terminal.worktreeId,
            cwd: terminal.cwd,
            command: terminal.type,
          };

          // removeTerminal handles the kill internally, so we don't need to kill twice
          removeTerminal(terminal.id);

          // Small delay to ensure cleanup completes
          await new Promise((resolve) => setTimeout(resolve, 100));

          await addTerminal(config);
        } catch (error) {
          console.error(`Failed to restart terminal ${terminal.id}:`, error);
          // Continue with next terminal even if one fails
        }
      }
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
