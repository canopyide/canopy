/** Log level */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** A log entry */
export interface LogEntry {
  /** Unique identifier */
  id: string;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Source of the log (component/service name) */
  source?: string;
}

/** Options for filtering logs */
export interface LogFilterOptions {
  /** Filter by log levels */
  levels?: LogLevel[];
  /** Filter by sources */
  sources?: string[];
  /** Search string */
  search?: string;
  /** Start time filter */
  startTime?: number;
  /** End time filter */
  endTime?: number;
}
