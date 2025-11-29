/**
 * Event Inspector Store
 *
 * Zustand store for managing event inspector state, including
 * events, filters, and panel visibility.
 */

import { create, type StateCreator } from "zustand";

export interface EventRecord {
  id: string;
  timestamp: number;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  source: "main" | "renderer";
}

export interface EventFilterOptions {
  types?: string[];
  worktreeId?: string;
  agentId?: string;
  taskId?: string;
  traceId?: string;
  search?: string;
  after?: number;
  before?: number;
}

interface EventsState {
  // Event records
  events: EventRecord[];

  // Panel visibility
  isOpen: boolean;

  // Filters
  filters: EventFilterOptions;

  // Selected event ID (for detail view)
  selectedEventId: string | null;

  // Auto-scroll behavior
  autoScroll: boolean;

  // Actions
  addEvent: (event: EventRecord) => void;
  addEvents: (events: EventRecord[]) => void;
  setEvents: (events: EventRecord[]) => void;
  clearEvents: () => void;
  togglePanel: () => void;
  setOpen: (open: boolean) => void;
  setFilters: (filters: Partial<EventFilterOptions>) => void;
  clearFilters: () => void;
  setSelectedEvent: (id: string | null) => void;
  setAutoScroll: (autoScroll: boolean) => void;

  // Computed/filtered events
  getFilteredEvents: () => EventRecord[];
}

const MAX_EVENTS = 1000;

const createEventsStore: StateCreator<EventsState> = (set, get) => ({
  events: [],
  isOpen: false,
  filters: {},
  selectedEventId: null,
  autoScroll: true,

  addEvent: (event) =>
    set((state) => {
      // Dedupe by ID
      if (state.events.some((e) => e.id === event.id)) {
        return state;
      }

      const newEvents = [...state.events, event];
      // Trim if over limit
      if (newEvents.length > MAX_EVENTS) {
        return { events: newEvents.slice(-MAX_EVENTS) };
      }
      return { events: newEvents };
    }),

  addEvents: (events) =>
    set((state) => {
      // Merge and dedupe by ID
      const existingIds = new Set(state.events.map((e) => e.id));
      const newEvents = events.filter((e) => !existingIds.has(e.id));
      const merged = [...state.events, ...newEvents];

      // Trim if over limit
      if (merged.length > MAX_EVENTS) {
        return { events: merged.slice(-MAX_EVENTS) };
      }
      return { events: merged };
    }),

  setEvents: (events) => set({ events }),

  clearEvents: () => set({ events: [], selectedEventId: null }),

  togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),

  setOpen: (isOpen) => set({ isOpen }),

  setFilters: (newFilters) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    })),

  clearFilters: () => set({ filters: {} }),

  setSelectedEvent: (id) => set({ selectedEventId: id }),

  setAutoScroll: (autoScroll) => set({ autoScroll }),

  getFilteredEvents: () => {
    const state = get();
    let filtered = state.events;

    const { filters } = state;

    // Filter by event types
    if (filters.types && filters.types.length > 0) {
      filtered = filtered.filter((event) => filters.types!.includes(event.type));
    }

    // Filter by timestamp range
    if (filters.after !== undefined) {
      filtered = filtered.filter((event) => event.timestamp >= filters.after!);
    }
    if (filters.before !== undefined) {
      filtered = filtered.filter((event) => event.timestamp <= filters.before!);
    }

    // Filter by worktree ID
    if (filters.worktreeId) {
      filtered = filtered.filter((event) => {
        const payload = event.payload;
        return payload && payload.worktreeId === filters.worktreeId;
      });
    }

    // Filter by agent ID
    if (filters.agentId) {
      filtered = filtered.filter((event) => {
        const payload = event.payload;
        return payload && payload.agentId === filters.agentId;
      });
    }

    // Filter by task ID
    if (filters.taskId) {
      filtered = filtered.filter((event) => {
        const payload = event.payload;
        return payload && payload.taskId === filters.taskId;
      });
    }

    // Filter by trace ID (normalized for case-insensitive matching)
    if (filters.traceId) {
      const normalizedFilter = filters.traceId.toLowerCase();
      filtered = filtered.filter((event) => {
        const payload = event.payload;
        return payload && payload.traceId?.toLowerCase() === normalizedFilter;
      });
    }

    // Filter by text search
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter((event) => {
        // Search in event type
        if (event.type.toLowerCase().includes(searchLower)) {
          return true;
        }
        // Search in stringified payload
        try {
          const payloadStr = JSON.stringify(event.payload).toLowerCase();
          return payloadStr.includes(searchLower);
        } catch {
          return false;
        }
      });
    }

    return filtered;
  },
});

export const useEventStore = create<EventsState>(createEventsStore);
