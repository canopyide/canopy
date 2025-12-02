/** Ring buffer for main process logs (FIFO) */

import crypto from "crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  source?: string;
}

export interface FilterOptions {
  levels?: LogLevel[];
  sources?: string[];
  search?: string;
  startTime?: number;
  endTime?: number;
}

let instance: LogBuffer | null = null;

export class LogBuffer {
  private buffer: LogEntry[] = [];
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  /** Get singleton */
  static getInstance(): LogBuffer {
    if (!instance) {
      instance = new LogBuffer();
    }
    return instance;
  }

  /** Add log entry */
  push(entry: Omit<LogEntry, "id">): LogEntry {
    const fullEntry: LogEntry = {
      ...entry,
      id: crypto.randomUUID(),
    };

    this.buffer.push(fullEntry);

    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(-this.maxSize);
    }

    return fullEntry;
  }

  /** Get all logs */
  getAll(): LogEntry[] {
    return [...this.buffer];
  }

  /** Get filtered logs */
  getFiltered(options: FilterOptions): LogEntry[] {
    let entries = this.buffer;

    if (options.levels && options.levels.length > 0) {
      entries = entries.filter((e) => options.levels!.includes(e.level));
    }

    if (options.sources && options.sources.length > 0) {
      entries = entries.filter((e) => e.source && options.sources!.includes(e.source));
    }

    if (options.search) {
      const searchLower = options.search.toLowerCase();
      entries = entries.filter((e) => {
        if (e.message.toLowerCase().includes(searchLower)) return true;
        if (e.source && e.source.toLowerCase().includes(searchLower)) return true;

        if (e.context) {
          try {
            return JSON.stringify(e.context).toLowerCase().includes(searchLower);
          } catch {
            return false;
          }
        }

        return false;
      });
    }

    if (options.startTime !== undefined) {
      entries = entries.filter((e) => e.timestamp >= options.startTime!);
    }
    if (options.endTime !== undefined) {
      entries = entries.filter((e) => e.timestamp <= options.endTime!);
    }

    return entries;
  }

  /** Get unique log sources */
  getSources(): string[] {
    const sources = new Set<string>();
    for (const entry of this.buffer) {
      if (entry.source) {
        sources.add(entry.source);
      }
    }
    return Array.from(sources).sort();
  }

  /** Clear buffer */
  clear(): void {
    this.buffer = [];
  }

  /** Clear logs on project switch */
  onProjectSwitch(): void {
    console.log("Handling project switch in LogBuffer - clearing logs");
    this.clear();
  }

  /** Get current count */
  get length(): number {
    return this.buffer.length;
  }
}

// Export singleton accessor
export const logBuffer = LogBuffer.getInstance();
