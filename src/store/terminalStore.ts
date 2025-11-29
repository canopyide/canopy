/**
 * Terminal Store
 *
 * Zustand store for managing terminal instances and grid state.
 * Handles terminal spawning, focus management, maximize/restore, and bulk actions.
 */

import { create, type StateCreator } from "zustand";
import type { TerminalInstance as TerminalInstanceType, AgentState, TerminalType } from "@/types";

// Re-export the shared type so callers can import from the store
export type TerminalInstance = TerminalInstanceType;

export interface AddTerminalOptions {
  type?: TerminalType;
  title?: string;
  worktreeId?: string;
  cwd: string;
  shell?: string;
  /** Command to execute after shell starts (e.g., 'claude' for AI agents) */
  command?: string;
}

interface TerminalGridState {
  terminals: TerminalInstance[];
  focusedId: string | null;
  maximizedId: string | null;

  addTerminal: (options: AddTerminalOptions) => Promise<string>;
  removeTerminal: (id: string) => void;
  updateTitle: (id: string, newTitle: string) => void;
  updateAgentState: (
    id: string,
    agentState: AgentState,
    error?: string,
    lastStateChange?: number
  ) => void;
  setFocused: (id: string | null) => void;
  toggleMaximize: (id: string) => void;
  focusNext: () => void;
  focusPrevious: () => void;

  // Bulk actions
  bulkCloseByState: (states: AgentState | AgentState[]) => void;
  bulkCloseByWorktree: (worktreeId: string, state?: AgentState) => void;
  bulkCloseAll: () => void;
  restartFailedAgents: () => Promise<void>;
  getCountByState: (state: AgentState) => number;
  getCountByWorktree: (worktreeId: string, state?: AgentState) => number;
}

const TYPE_TITLES: Record<TerminalType, string> = {
  shell: "Shell",
  claude: "Claude",
  gemini: "Gemini",
  custom: "Terminal",
};

const createTerminalStore: StateCreator<TerminalGridState> = (set, get) => ({
  terminals: [],
  focusedId: null,
  maximizedId: null,

  addTerminal: async (options) => {
    const type = options.type || "shell";
    const title = options.title || TYPE_TITLES[type];

    try {
      // Spawn the PTY process via IPC
      const id = await window.electron.terminal.spawn({
        cwd: options.cwd,
        shell: options.shell,
        cols: 80,
        rows: 24,
        command: options.command,
        type,
        title,
        worktreeId: options.worktreeId,
      });

      // Agent terminals (claude/gemini) start in 'idle' state
      const isAgentTerminal = type === "claude" || type === "gemini";
      const terminal: TerminalInstance = {
        id,
        type,
        title,
        worktreeId: options.worktreeId,
        cwd: options.cwd,
        cols: 80,
        rows: 24,
        agentState: isAgentTerminal ? "idle" : undefined,
        lastStateChange: isAgentTerminal ? Date.now() : undefined,
      };

      set((state) => {
        const newTerminals = [...state.terminals, terminal];

        // Persist terminal list to electron-store
        window.electron.app
          .setState({
            terminals: newTerminals.map((t) => ({
              id: t.id,
              type: t.type,
              title: t.title,
              cwd: t.cwd,
              worktreeId: t.worktreeId,
            })),
          })
          .catch((error) => {
            console.error("Failed to persist terminals:", error);
          });

        return {
          terminals: newTerminals,
          focusedId: id,
        };
      });

      return id;
    } catch (error) {
      console.error("Failed to spawn terminal:", error);
      throw error;
    }
  },

  removeTerminal: (id) => {
    // Kill the PTY process
    window.electron.terminal.kill(id).catch((error) => {
      console.error("Failed to kill terminal:", error);
      // Continue with state cleanup even if kill fails
    });

    set((state) => {
      const newTerminals = state.terminals.filter((t) => t.id !== id);
      const currentIndex = state.terminals.findIndex((t) => t.id === id);

      // Determine new focused terminal
      let newFocusedId: string | null = null;
      if (state.focusedId === id && newTerminals.length > 0) {
        // Focus the next terminal, or the previous if we removed the last one
        const nextIndex = Math.min(currentIndex, newTerminals.length - 1);
        newFocusedId = newTerminals[nextIndex]?.id || null;
      } else if (state.focusedId !== id) {
        newFocusedId = state.focusedId;
      }

      // Persist updated terminal list
      window.electron.app
        .setState({
          terminals: newTerminals.map((t) => ({
            id: t.id,
            type: t.type,
            title: t.title,
            cwd: t.cwd,
            worktreeId: t.worktreeId,
          })),
        })
        .catch((error) => {
          console.error("Failed to persist terminals:", error);
        });

      return {
        terminals: newTerminals,
        focusedId: newFocusedId,
        maximizedId: state.maximizedId === id ? null : state.maximizedId,
      };
    });
  },

  setFocused: (id) => set({ focusedId: id }),

  updateTitle: (id, newTitle) => {
    set((state) => {
      const terminal = state.terminals.find((t) => t.id === id);
      if (!terminal) return state;

      // Use trimmed title, or fall back to default title based on type
      const effectiveTitle = newTitle.trim() || TYPE_TITLES[terminal.type];
      const newTerminals = state.terminals.map((t) =>
        t.id === id ? { ...t, title: effectiveTitle } : t
      );

      // Persist updated terminal list
      window.electron.app
        .setState({
          terminals: newTerminals.map((t) => ({
            id: t.id,
            type: t.type,
            title: t.title,
            cwd: t.cwd,
            worktreeId: t.worktreeId,
          })),
        })
        .catch((error) => {
          console.error("Failed to persist terminals:", error);
        });

      return { terminals: newTerminals };
    });
  },

  updateAgentState: (id, agentState, error, lastStateChange) => {
    set((state) => {
      const terminal = state.terminals.find((t) => t.id === id);
      if (!terminal) {
        console.warn(`Cannot update agent state: terminal ${id} not found`);
        return state;
      }

      const newTerminals = state.terminals.map((t) =>
        t.id === id
          ? {
              ...t,
              agentState,
              error,
              lastStateChange: lastStateChange ?? Date.now(),
            }
          : t
      );

      return { terminals: newTerminals };
    });
  },

  toggleMaximize: (id) =>
    set((state) => ({
      maximizedId: state.maximizedId === id ? null : id,
    })),

  focusNext: () =>
    set((state) => {
      if (state.terminals.length === 0) return state;
      const currentIndex = state.focusedId
        ? state.terminals.findIndex((t) => t.id === state.focusedId)
        : -1;
      const nextIndex = (currentIndex + 1) % state.terminals.length;
      return { focusedId: state.terminals[nextIndex].id };
    }),

  focusPrevious: () =>
    set((state) => {
      if (state.terminals.length === 0) return state;
      const currentIndex = state.focusedId
        ? state.terminals.findIndex((t) => t.id === state.focusedId)
        : 0;
      const prevIndex = currentIndex <= 0 ? state.terminals.length - 1 : currentIndex - 1;
      return { focusedId: state.terminals[prevIndex].id };
    }),

  bulkCloseByState: (states) => {
    const stateArray = Array.isArray(states) ? states : [states];
    const { terminals, removeTerminal } = get();
    const toRemove = terminals.filter((t) => t.agentState && stateArray.includes(t.agentState));
    toRemove.forEach((t) => removeTerminal(t.id));
  },

  bulkCloseByWorktree: (worktreeId, state) => {
    const { terminals, removeTerminal } = get();
    const toRemove = terminals.filter(
      (t) => t.worktreeId === worktreeId && (!state || t.agentState === state)
    );
    toRemove.forEach((t) => removeTerminal(t.id));
  },

  bulkCloseAll: () => {
    const { terminals, removeTerminal } = get();
    terminals.forEach((t) => removeTerminal(t.id));
  },

  restartFailedAgents: async () => {
    const { terminals, removeTerminal, addTerminal } = get();
    const failed = terminals.filter(
      (t) => t.agentState === "failed" && (t.type === "claude" || t.type === "gemini")
    );

    for (const terminal of failed) {
      try {
        // Store config before removing
        const config = {
          type: terminal.type,
          title: terminal.title,
          worktreeId: terminal.worktreeId,
          cwd: terminal.cwd,
          command: terminal.type, // claude/gemini command
        };

        // Wait for terminal to be killed before respawning
        await window.electron.terminal.kill(terminal.id);
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
    const { terminals } = get();
    return terminals.filter((t) => t.agentState === state).length;
  },

  getCountByWorktree: (worktreeId, state) => {
    const { terminals } = get();
    return terminals.filter(
      (t) => t.worktreeId === worktreeId && (!state || t.agentState === state)
    ).length;
  },
});

export const useTerminalStore = create<TerminalGridState>()(createTerminalStore);

// Subscribe to agent state changes from the main process
// This runs once at module load and the cleanup function should be called on app shutdown
let agentStateUnsubscribe: (() => void) | null = null;

if (typeof window !== "undefined" && window.electron?.terminal?.onAgentStateChanged) {
  agentStateUnsubscribe = window.electron.terminal.onAgentStateChanged((data) => {
    // The IPC event uses 'agentId' which corresponds to the terminal ID
    const { agentId, state, timestamp } = data;

    // Validate state is a valid AgentState
    const validStates: AgentState[] = ["idle", "working", "waiting", "completed", "failed"];
    if (!validStates.includes(state as AgentState)) {
      console.warn(`Invalid agent state received: ${state} for terminal ${agentId}`);
      return;
    }

    // Update the terminal's agent state
    useTerminalStore
      .getState()
      .updateAgentState(agentId, state as AgentState, undefined, timestamp);
  });
}

// Export cleanup function for app shutdown
export function cleanupTerminalStoreListeners() {
  if (agentStateUnsubscribe) {
    agentStateUnsubscribe();
    agentStateUnsubscribe = null;
  }
}
