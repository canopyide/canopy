import { events, ALL_EVENT_TYPES, type CanopyEventMap } from "./events.js";

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
  source: "main" | "renderer";
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
  /** Filter by run ID if present in payload (for multi-agent orchestration) */
  runId?: string;
  /** Filter by terminal ID if present in payload */
  terminalId?: string;
  /** Filter by GitHub issue number if present in payload */
  issueNumber?: number;
  /** Filter by GitHub PR number if present in payload */
  prNumber?: number;
  /** Filter by trace ID to track event chains */
  traceId?: string;
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
  private onRecordCallbacks: Array<(record: EventRecord) => void> = [];

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Subscribe to event records as they are created.
   * This ensures subscribers see the exact sanitized payload.
   * @param callback Function called with each new event record
   * @returns Unsubscribe function to remove the callback
   */
  public onRecord(callback: (record: EventRecord) => void): () => void {
    this.onRecordCallbacks.push(callback);
    return () => {
      const index = this.onRecordCallbacks.indexOf(callback);
      if (index !== -1) {
        this.onRecordCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Sanitize event payload to remove sensitive information.
   * WARNING: Events like agent:output and task:created may contain secrets.
   */
  private sanitizePayload(eventType: keyof CanopyEventMap, payload: any): any {
    // Events that may contain sensitive data
    const sensitiveEventTypes: Array<keyof CanopyEventMap> = ["agent:output", "task:created"];

    if (!sensitiveEventTypes.includes(eventType)) {
      return payload;
    }

    // For sensitive events, redact the data field or description
    if (eventType === "agent:output" && payload && typeof payload.data === "string") {
      return {
        ...payload,
        data: "[REDACTED - May contain sensitive information]",
      };
    }

    if (eventType === "task:created" && payload && typeof payload.description === "string") {
      return {
        ...payload,
        description: "[REDACTED - May contain sensitive information]",
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
      console.warn("[EventBuffer] Already started");
      return;
    }

    const unsubscribers: Array<() => void> = [];

    // Subscribe to each event type using the shared constant
    for (const eventType of ALL_EVENT_TYPES) {
      const unsub = events.on(
        eventType as any,
        ((payload: any) => {
          this.push({
            id: this.generateId(),
            timestamp: Date.now(),
            type: eventType,
            payload: this.sanitizePayload(eventType, payload),
            source: "main",
          });
        }) as any
      );
      unsubscribers.push(unsub);
    }

    // Store cleanup function
    this.unsubscribe = () => {
      unsubscribers.forEach((unsub) => unsub());
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
   * Notifies all onRecord subscribers after the event is recorded.
   */
  private push(event: EventRecord): void {
    this.buffer.push(event);

    // Notify subscribers AFTER recording
    // Use a shallow copy to prevent issues if a callback unsubscribes during iteration
    for (const callback of [...this.onRecordCallbacks]) {
      try {
        callback(event);
      } catch (error) {
        console.error("[EventBuffer] Error in onRecord callback:", error);
      }
    }

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
      filtered = filtered.filter((event) => options.types!.includes(event.type));
    }

    // Filter by timestamp range
    if (options.after !== undefined) {
      filtered = filtered.filter((event) => event.timestamp >= options.after!);
    }
    if (options.before !== undefined) {
      filtered = filtered.filter((event) => event.timestamp <= options.before!);
    }

    // Filter by worktree ID
    if (options.worktreeId) {
      filtered = filtered.filter((event) => {
        const payload = event.payload;
        return payload && payload.worktreeId === options.worktreeId;
      });
    }

    // Filter by agent ID
    if (options.agentId) {
      filtered = filtered.filter((event) => {
        const payload = event.payload;
        return payload && payload.agentId === options.agentId;
      });
    }

    // Filter by task ID
    if (options.taskId) {
      filtered = filtered.filter((event) => {
        const payload = event.payload;
        return payload && payload.taskId === options.taskId;
      });
    }

    // Filter by run ID (for multi-agent orchestration)
    if (options.runId) {
      filtered = filtered.filter((event) => {
        const payload = event.payload;
        return payload && payload.runId === options.runId;
      });
    }

    // Filter by terminal ID
    if (options.terminalId) {
      filtered = filtered.filter((event) => {
        const payload = event.payload;
        return payload && payload.terminalId === options.terminalId;
      });
    }

    // Filter by GitHub issue number
    if (options.issueNumber !== undefined) {
      filtered = filtered.filter((event) => {
        const payload = event.payload;
        return payload && payload.issueNumber === options.issueNumber;
      });
    }

    // Filter by GitHub PR number
    if (options.prNumber !== undefined) {
      filtered = filtered.filter((event) => {
        const payload = event.payload;
        return payload && payload.prNumber === options.prNumber;
      });
    }

    // Filter by trace ID
    if (options.traceId) {
      filtered = filtered.filter((event) => {
        const payload = event.payload;
        return payload && payload.traceId === options.traceId;
      });
    }

    // Filter by text search
    if (options.search) {
      const searchLower = options.search.toLowerCase();
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
