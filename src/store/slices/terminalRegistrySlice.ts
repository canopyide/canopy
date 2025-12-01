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
  TerminalLocation,
  AgentStateChangeTrigger,
} from "@/types";
import { appClient, terminalClient } from "@/clients";
import { terminalInstanceService } from "@/services/TerminalInstanceService";
import { TerminalRefreshTier } from "@/types";

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
  /** Initial location in the UI (defaults to 'grid') */
  location?: TerminalLocation;
}

const TYPE_TITLES: Record<TerminalType, string> = {
  shell: "Shell",
  claude: "Claude",
  gemini: "Gemini",
  codex: "Codex",
  custom: "Terminal",
};

/** Trashed terminal metadata for countdown timers */
export interface TrashedTerminal {
  id: string;
  expiresAt: number;
}

export interface TerminalRegistrySlice {
  terminals: TerminalInstance[];
  /** Terminals pending deletion (in trash) */
  trashedTerminals: Map<string, TrashedTerminal>;

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
  updateActivity: (
    id: string,
    headline: string,
    status: "working" | "waiting" | "success" | "failure",
    type: "interactive" | "background" | "idle",
    timestamp: number
  ) => void;
  updateVisibility: (id: string, isVisible: boolean) => void;
  getTerminal: (id: string) => TerminalInstance | undefined;

  /** Move terminal to dock (minimized) */
  moveTerminalToDock: (id: string) => void;
  /** Move terminal to grid (restored) */
  moveTerminalToGrid: (id: string) => void;
  /** Toggle terminal between dock and grid */
  toggleTerminalLocation: (id: string) => void;

  /** Move terminal to trash (pending deletion) */
  trashTerminal: (id: string) => void;
  /** Restore terminal from trash */
  restoreTerminal: (id: string) => void;
  /** Mark terminal as trashed (from IPC event) */
  markAsTrashed: (id: string, expiresAt: number) => void;
  /** Mark terminal as restored (from IPC event) */
  markAsRestored: (id: string) => void;
  /** Check if terminal is in trash */
  isInTrash: (id: string) => boolean;
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
        location: t.location,
        // Only persist command if non-empty (trim whitespace)
        command: t.command?.trim() || undefined,
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
    trashedTerminals: new Map(),

    addTerminal: async (options) => {
      const type = options.type || "shell";
      const title = options.title || TYPE_TITLES[type];
      const location = options.location || "grid";

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
          location,
          command: options.command, // Store command for persistence
          // Initialize grid terminals as visible to avoid initial under-throttling
          // IntersectionObserver will update this once mounted
          isVisible: location === "grid" ? true : false,
        };

        set((state) => {
          const newTerminals = [...state.terminals, terminal];
          persistTerminals(newTerminals);
          return { terminals: newTerminals };
        });

        // Enable buffering immediately if terminal starts in dock (hidden)
        if (location === "dock") {
          terminalClient.setBuffering(id, true).catch((error) => {
            console.error("Failed to enable terminal buffering:", error);
          });
        }

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

      // Dispose renderer instance to prevent zombies
      terminalInstanceService.destroy(id);

      set((state) => {
        const newTerminals = state.terminals.filter((t) => t.id !== id);

        // Clean up trash entry if it exists
        const newTrashed = new Map(state.trashedTerminals);
        newTrashed.delete(id);

        persistTerminals(newTerminals);
        return { terminals: newTerminals, trashedTerminals: newTrashed };
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

    updateActivity: (id, headline, status, type, timestamp) => {
      set((state) => {
        const terminal = state.terminals.find((t) => t.id === id);
        if (!terminal) {
          // Silently ignore - terminal may have been closed
          return state;
        }

        const newTerminals = state.terminals.map((t) =>
          t.id === id
            ? {
                ...t,
                activityHeadline: headline,
                activityStatus: status,
                activityType: type,
                activityTimestamp: timestamp,
              }
            : t
        );

        // Note: We don't persist activity state since it's transient
        return { terminals: newTerminals };
      });
    },

    updateVisibility: (id, isVisible) => {
      set((state) => {
        const terminal = state.terminals.find((t) => t.id === id);
        if (!terminal) {
          // Silently ignore - terminal may have been closed
          return state;
        }

        // Skip update if visibility hasn't changed (avoid unnecessary re-renders)
        if (terminal.isVisible === isVisible) {
          return state;
        }

        const newTerminals = state.terminals.map((t) => (t.id === id ? { ...t, isVisible } : t));

        // Note: We don't persist visibility state since it's transient
        return { terminals: newTerminals };
      });
    },

    getTerminal: (id) => {
      return get().terminals.find((t) => t.id === id);
    },

    moveTerminalToDock: (id) => {
      set((state) => {
        const terminal = state.terminals.find((t) => t.id === id);
        if (!terminal || terminal.location === "dock") return state;

        const newTerminals = state.terminals.map((t) =>
          t.id === id ? { ...t, location: "dock" as const } : t
        );

        persistTerminals(newTerminals);
        return { terminals: newTerminals };
      });

      // Enable buffering for docked (hidden) terminal to reduce IPC overhead
      terminalClient.setBuffering(id, true).catch((error) => {
        console.error("Failed to enable terminal buffering:", error);
      });

      // Release GPU resources for docked terminals
      terminalInstanceService.applyRendererPolicy(id, TerminalRefreshTier.BACKGROUND);
    },

    moveTerminalToGrid: (id) => {
      set((state) => {
        const terminal = state.terminals.find((t) => t.id === id);
        if (!terminal || terminal.location === "grid") return state;

        const newTerminals = state.terminals.map((t) =>
          t.id === id ? { ...t, location: "grid" as const } : t
        );

        persistTerminals(newTerminals);
        return { terminals: newTerminals };
      });

      // Disable buffering and flush buffered data when terminal becomes visible
      // We call flush after a small delay to ensure the UI has subscribed to onData
      terminalClient
        .setBuffering(id, false)
        .then(() => {
          // Delay flush to allow UI to mount and subscribe
          setTimeout(() => {
            terminalClient.flush(id).catch((error) => {
              console.error("Failed to flush terminal buffer:", error);
            });
          }, 100);
        })
        .catch((error) => {
          console.error("Failed to disable terminal buffering:", error);
        });

      // Mark as visible priority so renderer can reacquire GPU if needed
      terminalInstanceService.applyRendererPolicy(id, TerminalRefreshTier.VISIBLE);
    },

    toggleTerminalLocation: (id) => {
      const terminal = get().terminals.find((t) => t.id === id);
      if (!terminal) return;

      if (terminal.location === "dock") {
        get().moveTerminalToGrid(id);
      } else {
        get().moveTerminalToDock(id);
      }
    },

    trashTerminal: (id) => {
      const terminal = get().terminals.find((t) => t.id === id);
      if (!terminal) return;

      // Call IPC to trash on main process (which starts the countdown)
      terminalClient.trash(id).catch((error) => {
        console.error("Failed to trash terminal:", error);
      });

      // Move to dock if in grid
      if (terminal.location === "grid") {
        get().moveTerminalToDock(id);
      }
    },

    restoreTerminal: (id) => {
      // Call IPC to restore on main process
      terminalClient.restore(id).catch((error) => {
        console.error("Failed to restore terminal:", error);
      });
    },

    markAsTrashed: (id, expiresAt) => {
      set((state) => {
        const newTrashed = new Map(state.trashedTerminals);
        newTrashed.set(id, { id, expiresAt });
        return { trashedTerminals: newTrashed };
      });
    },

    markAsRestored: (id) => {
      set((state) => {
        const newTrashed = new Map(state.trashedTerminals);
        newTrashed.delete(id);
        return { trashedTerminals: newTrashed };
      });
    },

    isInTrash: (id) => {
      return get().trashedTerminals.has(id);
    },
  });
