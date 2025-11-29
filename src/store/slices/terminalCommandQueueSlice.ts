/**
 * Terminal Command Queue Slice
 *
 * Manages command queuing for agent terminals.
 * This slice is responsible for:
 * - Queuing commands when agents are busy (working state)
 * - Processing queued commands when agents become idle/waiting
 * - Clearing the queue when terminals are closed
 *
 * The command queue is used for context injection and other operations
 * that need to wait for the agent to be ready for input.
 */

import type { StateCreator } from "zustand";
import type { TerminalInstance } from "./terminalRegistrySlice";
import type { AgentState } from "@/types";

/**
 * Represents a command queued for execution when the agent becomes idle.
 */
export interface QueuedCommand {
  /** Unique identifier for this queued command */
  id: string;
  /** Terminal to send the command to */
  terminalId: string;
  /** The payload to write to the terminal */
  payload: string;
  /** Human-readable description (e.g., "Inject Context") */
  description: string;
  /** Timestamp when the command was queued */
  queuedAt: number;
}

export interface TerminalCommandQueueSlice {
  commandQueue: QueuedCommand[];

  /**
   * Queue a command for a terminal. If the terminal is idle/waiting, sends immediately.
   * If the terminal is busy (working), queues for later execution.
   */
  queueCommand: (terminalId: string, payload: string, description: string) => void;

  /**
   * Process the command queue for a terminal. Called when agent transitions to 'waiting'.
   * Sends the first queued command (FIFO) and removes it from the queue.
   */
  processQueue: (terminalId: string) => void;

  /**
   * Clear all queued commands for a terminal (e.g., when terminal is closed).
   */
  clearQueue: (terminalId: string) => void;

  /**
   * Get the number of queued commands for a terminal.
   */
  getQueueCount: (terminalId: string) => number;
}

/**
 * Creates the terminal command queue slice.
 *
 * @param getTerminal - Function to get a terminal by ID from the registry slice.
 *   This is injected to check agent state before queueing.
 */
export const createTerminalCommandQueueSlice =
  (
    getTerminal: (id: string) => TerminalInstance | undefined
  ): StateCreator<TerminalCommandQueueSlice, [], [], TerminalCommandQueueSlice> =>
  (set, get) => ({
    commandQueue: [],

    queueCommand: (terminalId, payload, description) => {
      const terminal = getTerminal(terminalId);

      // Validate terminal exists
      if (!terminal) {
        console.warn(`Cannot queue command: terminal ${terminalId} not found`);
        return;
      }

      // If agent is idle/waiting, send immediately (no need to queue)
      if (isAgentReady(terminal.agentState)) {
        window.electron.terminal.write(terminalId, payload);
        return;
      }

      // Otherwise, queue the command for later execution
      const id = crypto.randomUUID();
      set((state) => ({
        commandQueue: [
          ...state.commandQueue,
          { id, terminalId, payload, description, queuedAt: Date.now() },
        ],
      }));
    },

    processQueue: (terminalId) => {
      // Verify agent is ready before processing
      const terminal = getTerminal(terminalId);
      if (!terminal || !isAgentReady(terminal.agentState)) {
        console.warn(
          `Cannot process queue: terminal ${terminalId} is not ready (state: ${terminal?.agentState})`
        );
        return;
      }

      // Use functional set to avoid race conditions with concurrent queueCommand calls
      set((state) => {
        const forTerminal = state.commandQueue.filter((c) => c.terminalId === terminalId);
        const remaining = state.commandQueue.filter((c) => c.terminalId !== terminalId);

        // Process FIFO - send first queued command
        if (forTerminal.length > 0) {
          const cmd = forTerminal[0];
          window.electron.terminal.write(cmd.terminalId, cmd.payload);

          // Remove processed command, keep rest in queue
          return { commandQueue: [...remaining, ...forTerminal.slice(1)] };
        }

        return state; // No changes if queue is empty
      });
    },

    clearQueue: (terminalId) => {
      set((state) => ({
        commandQueue: state.commandQueue.filter((c) => c.terminalId !== terminalId),
      }));
    },

    getQueueCount: (terminalId) => {
      const { commandQueue } = get();
      return commandQueue.filter((c) => c.terminalId === terminalId).length;
    },
  });

/**
 * Check if an agent state indicates the agent is ready to receive input.
 */
export function isAgentReady(state: AgentState | undefined): boolean {
  return state === "idle" || state === "waiting";
}
