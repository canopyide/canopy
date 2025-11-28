/**
 * Custom error types for Canopy with context and severity.
 * Enables better error handling, logging, and user notifications.
 * Migrated from Canopy CLI for Electron main process.
 */

/**
 * Base error class for all Canopy errors.
 * Includes context for better debugging and user messages.
 */
export class CanopyError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Git operation failed (repository not found, git not installed, command failed)
 */
export class GitError extends CanopyError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, context, cause);
  }
}

/**
 * Worktree directory no longer exists (deleted externally).
 * Used to signal that a worktree monitor should stop polling and clean up.
 */
export class WorktreeRemovedError extends GitError {
  constructor(path: string, cause?: Error) {
    super('Worktree directory no longer exists', { path }, cause);
  }
}

/**
 * File system operation failed (permission denied, file not found, read error)
 */
export class FileSystemError extends CanopyError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, context, cause);
  }
}

/**
 * Configuration loading or validation failed
 */
export class ConfigError extends CanopyError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, context, cause);
  }
}

/**
 * External process execution failed (editor not found, command error)
 */
export class ProcessError extends CanopyError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, context, cause);
  }
}

/**
 * File watcher setup or operation failed
 */
export class WatcherError extends CanopyError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, context, cause);
  }
}

/**
 * Check if error is a specific Canopy error type
 */
export function isCanopyError(error: unknown): error is CanopyError {
  return error instanceof CanopyError;
}

/**
 * Check if error is a permission/access error (EACCES, EPERM)
 */
export function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EACCES' || code === 'EPERM';
}

/**
 * Check if error is a "not found" error (ENOENT)
 */
export function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/**
 * Check if error is a transient error that might succeed on retry
 */
export function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as NodeJS.ErrnoException).code;
  // File busy, resource temporarily unavailable, etc.
  return ['EBUSY', 'EAGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'].includes(code || '');
}

/**
 * Extract user-friendly message from any error
 */
export function getUserMessage(error: unknown): string {
  if (isCanopyError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Extract technical details for logging
 * Handles circular references safely to prevent infinite recursion
 */
export function getErrorDetails(error: unknown, seen = new WeakSet<Error>()): Record<string, unknown> {
  const details: Record<string, unknown> = {
    message: getUserMessage(error),
  };

  if (error instanceof Error) {
    details.name = error.name;
    details.stack = error.stack;
  }

  if (isCanopyError(error)) {
    details.context = error.context;
    if (error.cause) {
      // Prevent circular reference stack overflow
      if (error.cause instanceof Error && !seen.has(error.cause)) {
        seen.add(error.cause);
        details.cause = getErrorDetails(error.cause, seen);
      } else if (!(error.cause instanceof Error)) {
        // Handle non-Error causes
        details.cause = getErrorDetails(error.cause, seen);
      }
    }
  }

  if (error && typeof error === 'object') {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code) details.code = nodeError.code;
    if (nodeError.errno) details.errno = nodeError.errno;
    if (nodeError.syscall) details.syscall = nodeError.syscall;
    if (nodeError.path) details.path = nodeError.path;
  }

  return details;
}
