import { create, type StateCreator } from "zustand";
import type { LogEntry, LogFilterOptions } from "@/types";

interface LogsState {
  logs: LogEntry[];
  isOpen: boolean;
  filters: LogFilterOptions;
  autoScroll: boolean;
  expandedIds: Set<string>;

  addLog: (entry: LogEntry) => void;
  setLogs: (logs: LogEntry[]) => void;
  clearLogs: () => void;
  togglePanel: () => void;
  setOpen: (open: boolean) => void;
  setFilters: (filters: Partial<LogFilterOptions>) => void;
  clearFilters: () => void;
  setAutoScroll: (autoScroll: boolean) => void;
  toggleExpanded: (id: string) => void;
  collapseAll: () => void;
  reset: () => void;
}

const MAX_LOGS = 500;

const createLogsStore: StateCreator<LogsState> = (set) => ({
  logs: [],
  isOpen: false,
  filters: {},
  autoScroll: true,
  expandedIds: new Set(),

  addLog: (entry) =>
    set((state) => {
      const newLogs = [...state.logs, entry];
      if (newLogs.length > MAX_LOGS) {
        return { logs: newLogs.slice(-MAX_LOGS) };
      }
      return { logs: newLogs };
    }),

  setLogs: (logs) => set({ logs }),

  clearLogs: () => set({ logs: [], expandedIds: new Set() }),

  togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),

  setOpen: (isOpen) => set({ isOpen }),

  setFilters: (newFilters) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    })),

  clearFilters: () => set({ filters: {} }),

  setAutoScroll: (autoScroll) => set({ autoScroll }),

  toggleExpanded: (id) =>
    set((state) => {
      const newSet = new Set(state.expandedIds);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { expandedIds: newSet };
    }),

  collapseAll: () => set({ expandedIds: new Set() }),

  reset: () =>
    set({
      logs: [],
      isOpen: false,
      filters: {},
      autoScroll: true,
      expandedIds: new Set(),
    }),
});

export const useLogsStore = create<LogsState>()(createLogsStore);

export function filterLogs(logs: LogEntry[], filters: LogFilterOptions): LogEntry[] {
  let filtered = logs;

  if (filters.levels && filters.levels.length > 0) {
    filtered = filtered.filter((log) => filters.levels!.includes(log.level));
  }

  if (filters.sources && filters.sources.length > 0) {
    filtered = filtered.filter((log) => log.source && filters.sources!.includes(log.source));
  }

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(
      (log) =>
        log.message.toLowerCase().includes(searchLower) ||
        (log.source && log.source.toLowerCase().includes(searchLower)) ||
        (log.context && JSON.stringify(log.context).toLowerCase().includes(searchLower))
    );
  }

  if (filters.startTime !== undefined) {
    filtered = filtered.filter((log) => log.timestamp >= filters.startTime!);
  }
  if (filters.endTime !== undefined) {
    filtered = filtered.filter((log) => log.timestamp <= filters.endTime!);
  }

  return filtered;
}
