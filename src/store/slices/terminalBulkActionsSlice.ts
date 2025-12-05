import type { StateCreator } from "zustand";
import type { TerminalInstance } from "./terminalRegistrySlice";
import type { AgentState } from "@/types";
import { isAgentTerminal } from "../utils/terminalTypeGuards";

export interface TerminalBulkActionsSlice {
  bulkCloseByState: (states: AgentState | AgentState[]) => void;
  bulkCloseByWorktree: (worktreeId: string, state?: AgentState) => void;
  bulkCloseAll: () => void;
  bulkTrashAll: () => void;
  bulkRestartAll: () => Promise<void>;
  bulkMoveToDock: () => void;
  bulkMoveToGrid: () => void;
  restartFailedAgents: () => Promise<void>;
  restartIdleAgents: () => Promise<void>;
  getCountByState: (state: AgentState) => number;
  getCountByWorktree: (worktreeId: string, state?: AgentState) => number;
  getGridCount: () => number;
  getDockedCount: () => number;
}

export const createTerminalBulkActionsSlice = (
  getTerminals: () => TerminalInstance[],
  removeTerminal: (id: string) => void,
  restartTerminal: (id: string) => Promise<void>,
  trashTerminal: (id: string) => void,
  moveTerminalToDock: (id: string) => void,
  moveTerminalToGrid: (id: string) => void,
  getFocusedId: () => string | null,
  setFocusedId: (id: string | null) => void
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
      const activeTerminals = terminals.filter((t) => t.location !== "trash");
      activeTerminals.forEach((t) => removeTerminal(t.id));
    },

    bulkTrashAll: () => {
      const terminals = getTerminals();
      const activeTerminals = terminals.filter((t) => t.location !== "trash");
      activeTerminals.forEach((t) => trashTerminal(t.id));
    },

    bulkRestartAll: async () => {
      const terminals = getTerminals();
      const activeTerminals = terminals.filter((t) => t.location !== "trash");
      await restartTerminals(activeTerminals);
    },

    bulkMoveToDock: () => {
      const terminals = getTerminals();
      const gridTerminals = terminals.filter((t) => t.location === "grid");
      gridTerminals.forEach((t) => moveTerminalToDock(t.id));
    },

    bulkMoveToGrid: () => {
      const terminals = getTerminals();
      const dockedTerminals = terminals.filter((t) => t.location === "dock");
      if (dockedTerminals.length === 0) return;

      // Preserve existing grid focus if one exists
      const currentFocusId = getFocusedId();
      const currentFocusedTerminal = currentFocusId
        ? terminals.find((t) => t.id === currentFocusId)
        : null;
      const hasGridFocus = currentFocusedTerminal?.location === "grid";

      dockedTerminals.forEach((t) => moveTerminalToGrid(t.id));

      // Restore the original grid focus if it existed
      if (hasGridFocus && currentFocusId) {
        setFocusedId(currentFocusId);
      }
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

    getGridCount: () => {
      const terminals = getTerminals();
      return terminals.filter((t) => t.location === "grid").length;
    },

    getDockedCount: () => {
      const terminals = getTerminals();
      return terminals.filter((t) => t.location === "dock").length;
    },
  });
};
