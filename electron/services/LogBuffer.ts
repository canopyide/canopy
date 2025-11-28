/**
 * LogBuffer Service
 *
 * Ring buffer for storing recent log entries from the main process.
 * Provides filtering capabilities and streams new entries via IPC.
 */

import crypto from 'crypto'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: string
  timestamp: number
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  source?: string
}

export interface FilterOptions {
  levels?: LogLevel[]
  sources?: string[]
  search?: string
  startTime?: number
  endTime?: number
}

// Singleton instance
let instance: LogBuffer | null = null

export class LogBuffer {
  private buffer: LogEntry[] = []
  private maxSize: number

  constructor(maxSize = 500) {
    this.maxSize = maxSize
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): LogBuffer {
    if (!instance) {
      instance = new LogBuffer()
    }
    return instance
  }

  /**
   * Add a new log entry to the buffer
   */
  push(entry: Omit<LogEntry, 'id'>): LogEntry {
    const fullEntry: LogEntry = {
      ...entry,
      id: crypto.randomUUID(),
    }

    this.buffer.push(fullEntry)

    // Trim buffer if it exceeds max size
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(-this.maxSize)
    }

    return fullEntry
  }

  /**
   * Get all log entries
   */
  getAll(): LogEntry[] {
    return [...this.buffer]
  }

  /**
   * Get filtered log entries
   */
  getFiltered(options: FilterOptions): LogEntry[] {
    let entries = this.buffer

    // Filter by log levels
    if (options.levels && options.levels.length > 0) {
      entries = entries.filter(e => options.levels!.includes(e.level))
    }

    // Filter by sources
    if (options.sources && options.sources.length > 0) {
      entries = entries.filter(e => e.source && options.sources!.includes(e.source))
    }

    // Filter by search text
    if (options.search) {
      const searchLower = options.search.toLowerCase()
      entries = entries.filter(e => {
        if (e.message.toLowerCase().includes(searchLower)) return true
        if (e.source && e.source.toLowerCase().includes(searchLower)) return true

        // Safe context search - handle circular references and BigInt
        if (e.context) {
          try {
            return JSON.stringify(e.context).toLowerCase().includes(searchLower)
          } catch {
            // Ignore entries with context that can't be stringified
            return false
          }
        }

        return false
      })
    }

    // Filter by time range
    if (options.startTime !== undefined) {
      entries = entries.filter(e => e.timestamp >= options.startTime!)
    }
    if (options.endTime !== undefined) {
      entries = entries.filter(e => e.timestamp <= options.endTime!)
    }

    return entries
  }

  /**
   * Get unique sources from current logs
   */
  getSources(): string[] {
    const sources = new Set<string>()
    for (const entry of this.buffer) {
      if (entry.source) {
        sources.add(entry.source)
      }
    }
    return Array.from(sources).sort()
  }

  /**
   * Clear all log entries
   */
  clear(): void {
    this.buffer = []
  }

  /**
   * Get the count of log entries
   */
  get length(): number {
    return this.buffer.length
  }
}

// Export singleton accessor
export const logBuffer = LogBuffer.getInstance()
