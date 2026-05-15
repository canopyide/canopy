import { create, type StateCreator } from "zustand";
import type {
  ErrorRetryability,
  ErrorType,
  GitOperationReason,
  RecoveryAction,
  RetryAction,
} from "@shared/types/ipc/errors";
import { normalizeForDedup } from "@shared/utils/normalizeErrorMessage";

export type { ErrorRetryability, ErrorType, RetryAction } from "@shared/types/ipc/errors";

export interface ErrorRecord {
  id: string;
  timestamp: number;
  type: ErrorType;
  message: string;
  details?: string;
  source?: string;
  context?: {
    worktreeId?: string;
    terminalId?: string;
    filePath?: string;
    command?: string;
  };
  retryability: ErrorRetryability;
  dismissed: boolean;
  retryAction?: RetryAction;
  retryArgs?: Record<string, unknown>;
  fromPreviousSession?: boolean;
  correlationId?: string;
  recoveryHint?: string;
  retryProgress?: { attempt: number; maxAttempts: number };
  /** Classified reason when this error originated from a git operation */
  gitReason?: GitOperationReason;
  /** Structured CTA the renderer can surface alongside the error */
  recoveryAction?: RecoveryAction;
  /** Set when the error has been promoted to the diagnostics dock (auto-open or user click) */
  promotedToDock?: boolean;
}

interface ErrorStore {
  errors: ErrorRecord[];
  isPanelOpen: boolean;
  lastErrorTime: number;

  addError: (
    error: Omit<ErrorRecord, "id" | "timestamp" | "dismissed" | "promotedToDock">
  ) => string;
  dismissError: (id: string) => void;
  removeError: (id: string) => void;
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  getWorktreeErrors: (worktreeId: string) => ErrorRecord[];
  getTerminalErrors: (terminalId: string) => ErrorRecord[];
  getActiveErrors: () => ErrorRecord[];
  updateRetryProgress: (id: string, attempt: number, maxAttempts: number) => void;
  clearRetryProgress: (id: string) => void;
  promoteErrors: (ids?: string[]) => void;
  reset: () => void;
}

const MAX_ERRORS = 50;
const ERROR_RATE_LIMIT_MS = 500;

function generateErrorId(): string {
  return `error-${crypto.randomUUID()}`;
}

const createErrorStore: StateCreator<ErrorStore> = (set, get) => ({
  errors: [],
  isPanelOpen: false,
  lastErrorTime: 0,

  addError: (error) => {
    const now = Date.now();
    const state = get();

    // Deduplicate rapid-fire errors with same normalized type/message/context to avoid UI flooding.
    // Messages are normalized to strip volatile suffixes (UUIDs, timestamps, ports, PIDs)
    // so variant-suffix errors collapse into a single record.
    const normMsg = normalizeForDedup(error.message);
    const recentDuplicate = state.errors.find(
      (e) =>
        !e.dismissed &&
        e.type === error.type &&
        normalizeForDedup(e.message) === normMsg &&
        e.source === error.source &&
        e.context?.terminalId === error.context?.terminalId &&
        e.context?.worktreeId === error.context?.worktreeId &&
        now - e.timestamp < ERROR_RATE_LIMIT_MS
    );

    if (recentDuplicate) {
      set((s) => ({
        errors: s.errors.map((e) =>
          e.id === recentDuplicate.id
            ? {
                ...e,
                timestamp: now,
                // Overwrite retryability from the incoming record so state
                // transitions (e.g. an auto-retrying error landing as
                // "exhausted" after the retry loop gives up, or upgrading
                // from "auto" to "user-gated" once the classifier sees a
                // gitReason) become visible even when the duplicate-
                // suppression window collapses the two records into one.
                // recoveryAction and gitReason are part of that state — a
                // banner that ends up "user-gated" without its CTA would
                // silently fall back to "View errors".
                retryability: error.retryability,
                recoveryAction: error.recoveryAction ?? e.recoveryAction,
                gitReason: error.gitReason ?? e.gitReason,
                retryAction: error.retryAction ?? e.retryAction,
                retryArgs: error.retryArgs ?? e.retryArgs,
                recoveryHint: e.recoveryHint ?? error.recoveryHint,
                correlationId: e.correlationId ?? error.correlationId,
                promotedToDock: e.promotedToDock,
              }
            : e
        ),
        lastErrorTime: now,
      }));
      return recentDuplicate.id;
    }

    const newError: ErrorRecord = {
      ...error,
      id: generateErrorId(),
      timestamp: now,
      dismissed: false,
    };

    set((state) => {
      const newErrors = [newError, ...state.errors].slice(0, MAX_ERRORS);
      return {
        errors: newErrors,
        lastErrorTime: now,
      };
    });

    return newError.id;
  },

  dismissError: (id) => {
    set((state) => ({
      errors: state.errors.map((e) => (e.id === id ? { ...e, dismissed: true } : e)),
    }));
  },

  removeError: (id) => {
    set((state) => ({
      errors: state.errors.filter((e) => e.id !== id),
    }));
  },

  togglePanel: () => {
    set((state) => ({ isPanelOpen: !state.isPanelOpen }));
  },

  setPanelOpen: (open) => {
    set({ isPanelOpen: open });
  },

  getWorktreeErrors: (worktreeId) => {
    return get().errors.filter((e) => e.context?.worktreeId === worktreeId && !e.dismissed);
  },

  getTerminalErrors: (terminalId) => {
    return get().errors.filter((e) => e.context?.terminalId === terminalId && !e.dismissed);
  },

  getActiveErrors: () => {
    return get().errors.filter((e) => !e.dismissed);
  },

  updateRetryProgress: (id, attempt, maxAttempts) => {
    set((state) => ({
      errors: state.errors.map((e) =>
        e.id === id ? { ...e, retryProgress: { attempt, maxAttempts } } : e
      ),
    }));
  },

  clearRetryProgress: (id) => {
    set((state) => ({
      errors: state.errors.map((e) => (e.id === id ? { ...e, retryProgress: undefined } : e)),
    }));
  },

  promoteErrors: (ids) => {
    set((state) => {
      if (ids && ids.length === 0) return state;
      const targetIds = ids ? new Set(ids) : null;
      return {
        errors: state.errors.map((e) => {
          if (e.dismissed || e.promotedToDock) return e;
          if (targetIds && !targetIds.has(e.id)) return e;
          return { ...e, promotedToDock: true };
        }),
      };
    });
  },

  reset: () =>
    set({
      errors: [],
      isPanelOpen: false,
      lastErrorTime: 0,
    }),
});

export const useErrorStore = create<ErrorStore>()(createErrorStore);
