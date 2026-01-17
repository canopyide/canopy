import { access } from "fs/promises";

/**
 * Configuration for path existence polling
 */
interface WaitForPathOptions {
  /**
   * Initial check delay in milliseconds (default: 0 - check immediately)
   */
  initialDelayMs?: number;

  /**
   * Maximum total wait time in milliseconds (default: 5000)
   */
  timeoutMs?: number;

  /**
   * Backoff multiplier for retry delays (default: 2)
   */
  backoffMultiplier?: number;

  /**
   * Initial retry delay in milliseconds (default: 50)
   */
  initialRetryDelayMs?: number;

  /**
   * Maximum retry delay in milliseconds (default: 800)
   */
  maxRetryDelayMs?: number;
}

/**
 * Waits for a filesystem path to become accessible with exponential backoff.
 *
 * This utility handles race conditions where git operations complete before
 * the filesystem has flushed directory creation to disk. It's particularly
 * useful for worktree creation where node-pty requires the cwd to exist.
 *
 * @param path - The filesystem path to check
 * @param options - Configuration for polling behavior
 * @returns Promise that resolves when the path exists
 * @throws Error if the path doesn't exist within the timeout period
 *
 * @example
 * // Wait for worktree directory to exist before spawning terminals
 * await waitForPathExists('/path/to/worktree', { timeoutMs: 5000 });
 */
export async function waitForPathExists(
  path: string,
  options: WaitForPathOptions = {}
): Promise<void> {
  const {
    initialDelayMs = 0,
    timeoutMs = 5000,
    backoffMultiplier = 2,
    initialRetryDelayMs = 50,
    maxRetryDelayMs = 800,
  } = options;

  const startTime = Date.now();
  let retryDelayMs = initialRetryDelayMs;
  let timerId: NodeJS.Timeout | undefined;

  // Helper to check if path exists
  const checkExists = async (): Promise<boolean> => {
    try {
      await access(path);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Only retry on ENOENT (path doesn't exist yet)
      // Fail fast on permission errors (EACCES, EPERM) or ENOTDIR
      if (code && code !== "ENOENT") {
        throw new Error(`Cannot access path: ${path} (${code}: ${(error as Error).message})`);
      }
      return false;
    }
  };

  // Helper to sleep with cleanup
  const sleep = (ms: number): Promise<void> => {
    return new Promise((resolve) => {
      timerId = setTimeout(() => {
        timerId = undefined;
        resolve();
      }, ms);
      // Unref timer to avoid keeping process alive during shutdown
      if (timerId) {
        timerId.unref();
      }
    });
  };

  try {
    // Initial delay if specified
    if (initialDelayMs > 0) {
      await sleep(initialDelayMs);
    }

    // Poll until path exists or timeout
    while (true) {
      // Check if timeout exceeded
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        throw new Error(`Timeout waiting for path to exist: ${path} (waited ${elapsed}ms)`);
      }

      // Check if path exists
      if (await checkExists()) {
        return;
      }

      // Calculate next retry delay with backoff
      const nextDelay = Math.min(retryDelayMs, maxRetryDelayMs);

      // Ensure we don't exceed timeout on next attempt
      const remainingTime = timeoutMs - elapsed;
      const actualDelay = Math.min(nextDelay, remainingTime);

      if (actualDelay <= 0) {
        throw new Error(`Timeout waiting for path to exist: ${path} (waited ${elapsed}ms)`);
      }

      // Wait before next attempt
      await sleep(actualDelay);

      // Increase delay for next iteration
      retryDelayMs = Math.floor(retryDelayMs * backoffMultiplier);
    }
  } finally {
    // Clean up any pending timer
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  }
}
