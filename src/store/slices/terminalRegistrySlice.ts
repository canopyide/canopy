/**
 * Terminal Registry Slice
 *
 * Manages terminal CRUD operations and process tracking.
 * This slice is responsible for:
 * - Adding/removing terminal instances
 * - Updating terminal metadata (title, agent state)
 * - Persisting terminal list to electron-store
 * - IPC communication with the main process for PTY management
 */

import type { StateCreator } from "zustand";
import type {
  TerminalInstance as TerminalInstanceType,
  AgentState,
  TerminalType,
  AgentStateChangeTrigger,
} from "@/types";
import { appClient, terminalClient } from "@/clients";

// Re-export the shared type
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

const TYPE_TITLES: Record<TerminalType, string> = {
  shell: "Shell",
  claude: "Claude",
  gemini: "Gemini",
  codex: "Codex",
  custom: "Terminal",
};

export interface TerminalRegistrySlice {
  terminals: TerminalInstance[];

  addTerminal: (options: AddTerminalOptions) => Promise<string>;
  removeTerminal: (id: string) => void;
  updateTitle: (id: string, newTitle: string) => void;
  updateAgentState: (
    id: string,
    agentState: AgentState,
    error?: string,
    lastStateChange?: number,
    trigger?: AgentStateChangeTrigger,
    confidence?: number
  ) => void;
  getTerminal: (id: string) => TerminalInstance | undefined;
}

/**
 * Persist terminals to electron-store.
 * Only persists essential fields needed to restore sessions.
 */
function persistTerminals(terminals: TerminalInstance[]): void {
  appClient
    .setState({
      terminals: terminals.map((t) => ({
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
}

export type TerminalRegistryMiddleware = {
  onTerminalRemoved?: (
    id: string,
    removedIndex: number,
    remainingTerminals: TerminalInstance[]
  ) => void;
};

export const createTerminalRegistrySlice =
  (
    middleware?: TerminalRegistryMiddleware
  ): StateCreator<TerminalRegistrySlice, [], [], TerminalRegistrySlice> =>
  (set, get) => ({
    terminals: [],

    addTerminal: async (options) => {
      const type = options.type || "shell";
      const title = options.title || TYPE_TITLES[type];

      try {
        // Spawn the PTY process via IPC
        const id = await terminalClient.spawn({
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
          persistTerminals(newTerminals);
          return { terminals: newTerminals };
        });

        return id;
      } catch (error) {
        console.error("Failed to spawn terminal:", error);
        throw error;
      }
    },

    removeTerminal: (id) => {
      // Capture pre-removal state for focus handling
      const currentTerminals = get().terminals;
      const removedIndex = currentTerminals.findIndex((t) => t.id === id);

      // Kill the PTY process
      terminalClient.kill(id).catch((error) => {
        console.error("Failed to kill terminal:", error);
        // Continue with state cleanup even if kill fails
      });

      set((state) => {
        const newTerminals = state.terminals.filter((t) => t.id !== id);
        persistTerminals(newTerminals);
        return { terminals: newTerminals };
      });

      // Notify middleware with pre-removal index and remaining terminals
      const remainingTerminals = get().terminals;
      middleware?.onTerminalRemoved?.(id, removedIndex, remainingTerminals);
    },

    updateTitle: (id, newTitle) => {
      set((state) => {
        const terminal = state.terminals.find((t) => t.id === id);
        if (!terminal) return state;

        // Use trimmed title, or fall back to default title based on type
        const effectiveTitle = newTitle.trim() || TYPE_TITLES[terminal.type];
        const newTerminals = state.terminals.map((t) =>
          t.id === id ? { ...t, title: effectiveTitle } : t
        );

        persistTerminals(newTerminals);
        return { terminals: newTerminals };
      });
    },

    updateAgentState: (id, agentState, error, lastStateChange, trigger, confidence) => {
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
                stateChangeTrigger: trigger,
                stateChangeConfidence: confidence,
              }
            : t
        );

        // Note: We don't persist agent state changes since they are transient
        return { terminals: newTerminals };
      });
    },

    getTerminal: (id) => {
      return get().terminals.find((t) => t.id === id);
    },
  });
