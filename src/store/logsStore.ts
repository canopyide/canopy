/**
 * Logs Store
 *
 * Zustand store for managing logs panel state, including
 * log entries, filters, and panel visibility.
 */

import { create, type StateCreator } from 'zustand'
import type { LogEntry, LogFilterOptions } from '@/types/electron.d'

interface LogsState {
  // Log entries
  logs: LogEntry[]

  // Panel visibility
  isOpen: boolean

  // Filters
  filters: LogFilterOptions

  // Auto-scroll behavior
  autoScroll: boolean

  // Expanded log entries
  expandedIds: Set<string>

  // Actions
  addLog: (entry: LogEntry) => void
  setLogs: (logs: LogEntry[]) => void
  clearLogs: () => void
  togglePanel: () => void
  setOpen: (open: boolean) => void
  setFilters: (filters: Partial<LogFilterOptions>) => void
  clearFilters: () => void
  setAutoScroll: (autoScroll: boolean) => void
  toggleExpanded: (id: string) => void
  collapseAll: () => void
}

const MAX_LOGS = 500

const createLogsStore: StateCreator<LogsState> = (set) => ({
  logs: [],
  isOpen: false,
  filters: {},
  autoScroll: true,
  expandedIds: new Set(),

  addLog: (entry) =>
    set((state) => {
      const newLogs = [...state.logs, entry]
      // Trim if over limit
      if (newLogs.length > MAX_LOGS) {
        return { logs: newLogs.slice(-MAX_LOGS) }
      }
      return { logs: newLogs }
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
      const newSet = new Set(state.expandedIds)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return { expandedIds: newSet }
    }),

  collapseAll: () => set({ expandedIds: new Set() }),
})

export const useLogsStore = create<LogsState>()(createLogsStore)

/**
 * Helper to filter logs based on current filters
 */
export function filterLogs(logs: LogEntry[], filters: LogFilterOptions): LogEntry[] {
  let filtered = logs

  // Filter by levels
  if (filters.levels && filters.levels.length > 0) {
    filtered = filtered.filter((log) => filters.levels!.includes(log.level))
  }

  // Filter by sources
  if (filters.sources && filters.sources.length > 0) {
    filtered = filtered.filter((log) => log.source && filters.sources!.includes(log.source))
  }

  // Filter by search text
  if (filters.search) {
    const searchLower = filters.search.toLowerCase()
    filtered = filtered.filter(
      (log) =>
        log.message.toLowerCase().includes(searchLower) ||
        (log.source && log.source.toLowerCase().includes(searchLower)) ||
        (log.context && JSON.stringify(log.context).toLowerCase().includes(searchLower))
    )
  }

  // Filter by time range
  if (filters.startTime !== undefined) {
    filtered = filtered.filter((log) => log.timestamp >= filters.startTime!)
  }
  if (filters.endTime !== undefined) {
    filtered = filtered.filter((log) => log.timestamp <= filters.endTime!)
  }

  return filtered
}
