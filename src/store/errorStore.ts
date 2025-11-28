/**
 * Error Store
 *
 * Zustand store for managing application errors with support for:
 * - Adding errors from IPC events
 * - Dismissing individual errors
 * - Clearing all errors
 * - Retry actions for transient errors
 * - Rate limiting to prevent UI flooding
 */

import { create, type StateCreator } from 'zustand'

/**
 * Error type categories matching the main process error types
 */
export type ErrorType = 'git' | 'process' | 'filesystem' | 'network' | 'config' | 'unknown'

/**
 * Retry action types for different error sources
 */
export type RetryAction = 'copytree' | 'devserver' | 'terminal' | 'git' | 'worktree'

/**
 * Application error with context for display and recovery
 */
export interface AppError {
  /** Unique identifier for this error instance */
  id: string
  /** When the error occurred */
  timestamp: number
  /** Error category for display grouping */
  type: ErrorType
  /** User-friendly error message */
  message: string
  /** Technical details (stack trace, error codes) */
  details?: string
  /** Component/service that generated the error */
  source?: string
  /** Additional context for targeted display */
  context?: {
    worktreeId?: string
    terminalId?: string
    filePath?: string
    command?: string
  }
  /** Whether the operation can be retried */
  isTransient: boolean
  /** Whether the user dismissed this error */
  dismissed: boolean
  /** Action to perform on retry */
  retryAction?: RetryAction
  /** Arguments for retry action */
  retryArgs?: Record<string, unknown>
}

/**
 * Error store state and actions
 */
interface ErrorStore {
  /** All tracked errors (including dismissed) */
  errors: AppError[]
  /** Whether the problems panel is open */
  isPanelOpen: boolean
  /** Last time an error was added (for rate limiting) */
  lastErrorTime: number

  /** Add a new error to the store */
  addError: (error: Omit<AppError, 'id' | 'timestamp' | 'dismissed'>) => void
  /** Dismiss a specific error (hide from UI but keep in log) */
  dismissError: (id: string) => void
  /** Clear all errors */
  clearAll: () => void
  /** Remove a specific error completely */
  removeError: (id: string) => void
  /** Toggle the problems panel */
  togglePanel: () => void
  /** Set panel open state */
  setPanelOpen: (open: boolean) => void
  /** Get errors for a specific worktree */
  getWorktreeErrors: (worktreeId: string) => AppError[]
  /** Get errors for a specific terminal */
  getTerminalErrors: (terminalId: string) => AppError[]
  /** Get active (non-dismissed) errors */
  getActiveErrors: () => AppError[]
}

/** Maximum number of errors to keep in store */
const MAX_ERRORS = 50

/** Minimum time between errors of the same type (ms) for rate limiting */
const ERROR_RATE_LIMIT_MS = 500

/** Generate unique error ID */
function generateErrorId(): string {
  return `error-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const createErrorStore: StateCreator<ErrorStore> = (set, get) => ({
  errors: [],
  isPanelOpen: false,
  lastErrorTime: 0,

  addError: (error) => {
    const now = Date.now()
    const state = get()

    // Rate limiting: deduplicate rapid-fire errors of the same type and message
    // Only consider non-dismissed errors to allow re-surfacing after user dismissal
    const recentDuplicate = state.errors.find(
      (e) =>
        !e.dismissed &&
        e.type === error.type &&
        e.message === error.message &&
        now - e.timestamp < ERROR_RATE_LIMIT_MS
    )

    if (recentDuplicate) {
      // Update timestamp on the existing error instead of adding a new one
      set((s) => ({
        errors: s.errors.map((e) =>
          e.id === recentDuplicate.id ? { ...e, timestamp: now } : e
        ),
        lastErrorTime: now,
      }))
      return
    }

    const newError: AppError = {
      ...error,
      id: generateErrorId(),
      timestamp: now,
      dismissed: false,
    }

    set((state) => {
      // Keep only the most recent MAX_ERRORS
      const newErrors = [newError, ...state.errors].slice(0, MAX_ERRORS)
      return {
        errors: newErrors,
        lastErrorTime: now,
      }
    })
  },

  dismissError: (id) => {
    set((state) => ({
      errors: state.errors.map((e) =>
        e.id === id ? { ...e, dismissed: true } : e
      ),
    }))
  },

  clearAll: () => {
    set({ errors: [] })
  },

  removeError: (id) => {
    set((state) => ({
      errors: state.errors.filter((e) => e.id !== id),
    }))
  },

  togglePanel: () => {
    set((state) => ({ isPanelOpen: !state.isPanelOpen }))
  },

  setPanelOpen: (open) => {
    set({ isPanelOpen: open })
  },

  getWorktreeErrors: (worktreeId) => {
    return get().errors.filter(
      (e) => e.context?.worktreeId === worktreeId && !e.dismissed
    )
  },

  getTerminalErrors: (terminalId) => {
    return get().errors.filter(
      (e) => e.context?.terminalId === terminalId && !e.dismissed
    )
  },

  getActiveErrors: () => {
    return get().errors.filter((e) => !e.dismissed)
  },
})

export const useErrorStore = create<ErrorStore>()(createErrorStore)
