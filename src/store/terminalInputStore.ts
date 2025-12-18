import { create } from "zustand";

const MAX_HISTORY_SIZE = 100;

export interface TerminalInputState {
  hybridInputEnabled: boolean;
  hybridInputAutoFocus: boolean;
  draftInputs: Map<string, string>;
  commandHistory: Map<string, string[]>;
  historyIndex: Map<string, number>;
  tempDraft: Map<string, string>;
  setHybridInputEnabled: (enabled: boolean) => void;
  setHybridInputAutoFocus: (enabled: boolean) => void;
  getDraftInput: (terminalId: string) => string;
  setDraftInput: (terminalId: string, value: string) => void;
  clearDraftInput: (terminalId: string) => void;
  clearAllDraftInputs: () => void;
  addToHistory: (terminalId: string, command: string) => void;
  navigateHistory: (
    terminalId: string,
    direction: "up" | "down",
    currentInput: string
  ) => string | null;
  resetHistoryIndex: (terminalId: string) => void;
  getHistoryLength: (terminalId: string) => number;
}

export const useTerminalInputStore = create<TerminalInputState>()((set, get) => ({
  hybridInputEnabled: true,
  hybridInputAutoFocus: true,
  draftInputs: new Map(),
  commandHistory: new Map(),
  historyIndex: new Map(),
  tempDraft: new Map(),
  setHybridInputEnabled: (enabled) => set({ hybridInputEnabled: enabled }),
  setHybridInputAutoFocus: (enabled) => set({ hybridInputAutoFocus: enabled }),
  getDraftInput: (terminalId) => get().draftInputs.get(terminalId) ?? "",
  setDraftInput: (terminalId, value) =>
    set((state) => {
      const newDraftInputs = new Map(state.draftInputs);
      if (value === "") {
        newDraftInputs.delete(terminalId);
      } else {
        newDraftInputs.set(terminalId, value);
      }
      return { draftInputs: newDraftInputs };
    }),
  clearDraftInput: (terminalId) =>
    set((state) => {
      const newDraftInputs = new Map(state.draftInputs);
      newDraftInputs.delete(terminalId);
      return { draftInputs: newDraftInputs };
    }),
  clearAllDraftInputs: () => set({ draftInputs: new Map() }),

  addToHistory: (terminalId, command) =>
    set((state) => {
      const trimmed = command.trim();
      if (trimmed === "") return state;

      const newHistory = new Map(state.commandHistory);
      const existing = newHistory.get(terminalId) ?? [];

      const lastCommand = existing[existing.length - 1];
      if (lastCommand === trimmed) {
        return state;
      }

      const filtered = existing.filter((cmd) => cmd !== trimmed);
      const updated = [...filtered, trimmed].slice(-MAX_HISTORY_SIZE);
      newHistory.set(terminalId, updated);

      const newIndex = new Map(state.historyIndex);
      newIndex.delete(terminalId);

      const newTempDraft = new Map(state.tempDraft);
      newTempDraft.delete(terminalId);

      return {
        commandHistory: newHistory,
        historyIndex: newIndex,
        tempDraft: newTempDraft,
      };
    }),

  navigateHistory: (terminalId, direction, currentInput) => {
    const state = get();
    const history = state.commandHistory.get(terminalId) ?? [];
    if (history.length === 0) return null;

    const currentIndex = state.historyIndex.get(terminalId) ?? -1;
    let newIndex: number;

    if (direction === "up") {
      if (currentIndex === -1) {
        newIndex = history.length - 1;
        set((s) => {
          const newTempDraft = new Map(s.tempDraft);
          newTempDraft.set(terminalId, currentInput);
          const newHistoryIndex = new Map(s.historyIndex);
          newHistoryIndex.set(terminalId, newIndex);
          return { tempDraft: newTempDraft, historyIndex: newHistoryIndex };
        });
      } else if (currentIndex > 0) {
        newIndex = currentIndex - 1;
        set((s) => {
          const newHistoryIndex = new Map(s.historyIndex);
          newHistoryIndex.set(terminalId, newIndex);
          return { historyIndex: newHistoryIndex };
        });
      } else {
        return null;
      }
    } else {
      if (currentIndex === -1) {
        return null;
      } else if (currentIndex < history.length - 1) {
        newIndex = currentIndex + 1;
        set((s) => {
          const newHistoryIndex = new Map(s.historyIndex);
          newHistoryIndex.set(terminalId, newIndex);
          return { historyIndex: newHistoryIndex };
        });
      } else {
        const draft = state.tempDraft.get(terminalId) ?? "";
        set((s) => {
          const newHistoryIndex = new Map(s.historyIndex);
          newHistoryIndex.delete(terminalId);
          const newTempDraft = new Map(s.tempDraft);
          newTempDraft.delete(terminalId);
          return { historyIndex: newHistoryIndex, tempDraft: newTempDraft };
        });
        return draft;
      }
    }

    return history[newIndex] ?? null;
  },

  resetHistoryIndex: (terminalId) =>
    set((state) => {
      const newIndex = new Map(state.historyIndex);
      newIndex.delete(terminalId);
      const newTempDraft = new Map(state.tempDraft);
      newTempDraft.delete(terminalId);
      return { historyIndex: newIndex, tempDraft: newTempDraft };
    }),

  getHistoryLength: (terminalId) => {
    const history = get().commandHistory.get(terminalId);
    return history?.length ?? 0;
  },
}));
