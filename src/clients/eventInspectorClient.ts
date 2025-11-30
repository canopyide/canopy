/**
 * Event Inspector IPC Client
 *
 * Provides a typed interface for event inspector IPC operations.
 * Wraps window.electron.eventInspector.* calls for testability and maintainability.
 */

import type { EventRecord, EventFilterOptions } from "@shared/types";

/**
 * Client for event inspector IPC operations.
 *
 * @example
 * ```typescript
 * import { eventInspectorClient } from "@/clients/eventInspectorClient";
 *
 * const events = await eventInspectorClient.getEvents();
 * const cleanup = eventInspectorClient.onEvent((event) => console.log(event));
 * ```
 */
export const eventInspectorClient = {
  /** Get all recorded events */
  getEvents: (): Promise<EventRecord[]> => {
    return window.electron.eventInspector.getEvents();
  },

  /** Get filtered events */
  getFiltered: (filters: EventFilterOptions): Promise<EventRecord[]> => {
    return window.electron.eventInspector.getFiltered(filters);
  },

  /** Clear all recorded events */
  clear: (): Promise<void> => {
    return window.electron.eventInspector.clear();
  },

  /** Subscribe to event recording */
  subscribe: (): void => {
    window.electron.eventInspector.subscribe();
  },

  /** Unsubscribe from event recording */
  unsubscribe: (): void => {
    window.electron.eventInspector.unsubscribe();
  },

  /** Listen for new events. Returns cleanup function. */
  onEvent: (callback: (event: EventRecord) => void): (() => void) => {
    return window.electron.eventInspector.onEvent(callback);
  },
} as const;
