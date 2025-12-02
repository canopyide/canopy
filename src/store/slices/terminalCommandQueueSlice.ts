import type { StateCreator } from "zustand";
import type { TerminalInstance } from "./terminalRegistrySlice";
import type { AgentState } from "@/types";
import { terminalClient } from "@/clients";

export interface QueuedCommand {
  id: string;
  terminalId: string;
  payload: string;
  description: string;
  queuedAt: number;
}

export interface TerminalCommandQueueSlice {
  commandQueue: QueuedCommand[];

  queueCommand: (terminalId: string, payload: string, description: string) => void;

  processQueue: (terminalId: string) => void;

  clearQueue: (terminalId: string) => void;

  getQueueCount: (terminalId: string) => number;
}

export const createTerminalCommandQueueSlice =
  (
    getTerminal: (id: string) => TerminalInstance | undefined
  ): StateCreator<TerminalCommandQueueSlice, [], [], TerminalCommandQueueSlice> =>
  (set, get) => ({
    commandQueue: [],

    queueCommand: (terminalId, payload, description) => {
      const terminal = getTerminal(terminalId);

      if (!terminal) {
        console.warn(`Cannot queue command: terminal ${terminalId} not found`);
        return;
      }

      if (isAgentReady(terminal.agentState)) {
        terminalClient.write(terminalId, payload);
        return;
      }

      const id = crypto.randomUUID();
      set((state) => ({
        commandQueue: [
          ...state.commandQueue,
          { id, terminalId, payload, description, queuedAt: Date.now() },
        ],
      }));
    },

    processQueue: (terminalId) => {
      const terminal = getTerminal(terminalId);
      if (!terminal || !isAgentReady(terminal.agentState)) {
        console.warn(
          `Cannot process queue: terminal ${terminalId} is not ready (state: ${terminal?.agentState})`
        );
        return;
      }

      set((state) => {
        const forTerminal = state.commandQueue.filter((c) => c.terminalId === terminalId);
        const remaining = state.commandQueue.filter((c) => c.terminalId !== terminalId);

        if (forTerminal.length > 0) {
          const cmd = forTerminal[0];
          terminalClient.write(cmd.terminalId, cmd.payload);

          return { commandQueue: [...remaining, ...forTerminal.slice(1)] };
        }

        return state;
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

export function isAgentReady(state: AgentState | undefined): boolean {
  return state === "idle" || state === "waiting";
}
