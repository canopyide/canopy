import { events, ALL_EVENT_TYPES, type CanopyEventMap } from './events.js';

/**
 * Represents a single event record stored in the buffer.
 */
export interface EventRecord {
  /** Unique identifier for this event */
  id: string;
  /** Unix timestamp in milliseconds when the event occurred */
  timestamp: number;
  /** Event type name from CanopyEventMap */
  type: keyof CanopyEventMap;
  /** Event payload data (may contain sensitive information) */
  payload: any;
  /** Source of the event (always 'main' in Electron main process) */
  source: 'main' | 'renderer';
}

export interface FilterOptions {
  /** Filter by event type(s) */
  types?: Array<keyof CanopyEventMap>;
  /** Filter by worktree ID if present in payload */
  worktreeId?: string;
  /** Filter by agent ID if present in payload */
  agentId?: string;
  /** Filter by task ID if present in payload */
  taskId?: string;
  /** Text search in payload (JSON stringified) */
  search?: string;
  /** Filter events after this timestamp (inclusive) */
  after?: number;
  /** Filter events before this timestamp (inclusive) */
  before?: number;
}

/**
 * Ring buffer for storing recent system events.
 * Maintains a fixed-size buffer (default 1000) of the most recent events
 * emitted through the TypedEventBus.
 */
export class EventBuffer {
  private buffer: EventRecord[] = [];
  private maxSize: number;
  private unsubscribe?: () => void;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Sanitize event payload to remove sensitive information.
   * WARNING: Events like agent:output and task:created may contain secrets.
   */
  private sanitizePayload(eventType: keyof CanopyEventMap, payload: any): any {
    // Events that may contain sensitive data
    const sensitiveEventTypes: Array<keyof CanopyEventMap> = [
      'agent:output',
      'task:created',
    ];

    if (!sensitiveEventTypes.includes(eventType)) {
      return payload;
    }

    // For sensitive events, redact the data field or description
    if (eventType === 'agent:output' && payload && typeof payload.data === 'string') {
      return {
        ...payload,
        data: '[REDACTED - May contain sensitive information]',
      };
    }

    if (eventType === 'task:created' && payload && typeof payload.description === 'string') {
      return {
        ...payload,
        description: '[REDACTED - May contain sensitive information]',
      };
    }

    return payload;
  }

  /**
   * Start capturing events from the event bus.
   * Should be called once during application initialization.
   */
  start(): void {
    if (this.unsubscribe) {
      console.warn('[EventBuffer] Already started');
      return;
    }

    const unsubscribers: Array<() => void> = [];

    // Subscribe to each event type using the shared constant
    for (const eventType of ALL_EVENT_TYPES) {
      const unsub = events.on(eventType as any, ((payload: any) => {
        this.push({
          id: this.generateId(),
          timestamp: Date.now(),
          type: eventType,
          payload: this.sanitizePayload(eventType, payload),
          source: 'main',
        });
      }) as any);
      unsubscribers.push(unsub);
    }

    // Store cleanup function
    this.unsubscribe = () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }

  /**
   * Stop capturing events and clean up subscriptions.
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  /**
   * Add an event to the buffer.
   * If buffer is full, removes the oldest event (FIFO).
   */
  private push(event: EventRecord): void {
    this.buffer.push(event);

    // Enforce max size by removing oldest events
    while (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  /**
   * Get all events in the buffer (oldest to newest).
   */
  getAll(): EventRecord[] {
    return [...this.buffer];
  }

  /**
   * Get filtered events based on provided options.
   */
  getFiltered(options: FilterOptions): EventRecord[] {
    let filtered = this.buffer;

    // Filter by event types
    if (options.types && options.types.length > 0) {
      filtered = filtered.filter(event => options.types!.includes(event.type));
    }

    // Filter by timestamp range
    if (options.after !== undefined) {
      filtered = filtered.filter(event => event.timestamp >= options.after!);
    }
    if (options.before !== undefined) {
      filtered = filtered.filter(event => event.timestamp <= options.before!);
    }

    // Filter by worktree ID
    if (options.worktreeId) {
      filtered = filtered.filter(event => {
        const payload = event.payload;
        return payload && payload.worktreeId === options.worktreeId;
      });
    }

    // Filter by agent ID
    if (options.agentId) {
      filtered = filtered.filter(event => {
        const payload = event.payload;
        return payload && payload.agentId === options.agentId;
      });
    }

    // Filter by task ID
    if (options.taskId) {
      filtered = filtered.filter(event => {
        const payload = event.payload;
        return payload && payload.taskId === options.taskId;
      });
    }

    // Filter by text search
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filtered = filtered.filter(event => {
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
  }

  /**
   * Clear all events from the buffer.
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Get the current buffer size.
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Generate a unique ID for an event.
   * Uses timestamp + random string for uniqueness.
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
