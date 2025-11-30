/**
 * useDevServer Hook
 *
 * Provides dev server control for a specific worktree via IPC.
 * Manages state, start/stop/toggle actions, and dev script detection.
 */

import { useState, useEffect, useCallback } from "react";
import type { DevServerState } from "../types";
import { devServerClient } from "@/clients";

interface UseDevServerOptions {
  worktreeId: string;
  worktreePath?: string;
}

interface UseDevServerReturn {
  /** Current dev server state for this worktree */
  state: DevServerState | null;
  /** Whether the worktree has a detectable dev script */
  hasDevScript: boolean;
  /** Start the dev server (optionally with custom command) */
  start: (command?: string) => Promise<void>;
  /** Stop the dev server */
  stop: () => Promise<void>;
  /** Toggle the dev server state */
  toggle: () => Promise<void>;
  /** Whether an action is currently in progress */
  isLoading: boolean;
  /** Any error that occurred during the last action */
  error: string | null;
}

/**
 * Hook for controlling a dev server for a specific worktree
 *
 * @example
 * ```tsx
 * const { state, hasDevScript, toggle, isLoading } = useDevServer({
 *   worktreeId: worktree.id,
 *   worktreePath: worktree.path,
 * })
 *
 * if (!hasDevScript) return null
 *
 * return (
 *   <button onClick={toggle} disabled={isLoading}>
 *     {state?.status === 'running' ? 'Stop' : 'Start'}
 *   </button>
 * )
 * ```
 */
export function useDevServer({
  worktreeId,
  worktreePath,
}: UseDevServerOptions): UseDevServerReturn {
  const [state, setState] = useState<DevServerState | null>(null);
  const [hasDevScript, setHasDevScript] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for dev script availability on mount or when path changes
  useEffect(() => {
    if (!worktreePath) {
      setHasDevScript(false);
      return;
    }

    let cancelled = false;

    devServerClient
      .hasDevScript(worktreePath)
      .then((result) => {
        if (!cancelled) {
          setHasDevScript(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasDevScript(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [worktreePath]);

  // Get initial state on mount or when worktreeId changes
  useEffect(() => {
    let cancelled = false;

    devServerClient
      .getState(worktreeId)
      .then((state) => {
        if (!cancelled) {
          setState(state);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [worktreeId]);

  // Subscribe to state updates for this worktree
  useEffect(() => {
    const unsubUpdate = devServerClient.onUpdate((newState) => {
      if (newState.worktreeId === worktreeId) {
        setState(newState);
        // Clear loading state when update arrives
        setIsLoading(false);
      }
    });

    const unsubError = devServerClient.onError((data) => {
      if (data.worktreeId === worktreeId) {
        setError(data.error);
        setIsLoading(false);
      }
    });

    return () => {
      unsubUpdate();
      unsubError();
    };
  }, [worktreeId]);

  const start = useCallback(
    async (command?: string) => {
      if (!worktreePath) {
        setError("Worktree path is required to start dev server");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const newState = await devServerClient.start(worktreeId, worktreePath, command);
        setState(newState);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to start dev server";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [worktreeId, worktreePath]
  );

  const stop = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const newState = await devServerClient.stop(worktreeId);
      setState(newState);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to stop dev server";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [worktreeId]);

  const toggle = useCallback(async () => {
    if (!worktreePath) {
      setError("Worktree path is required to toggle dev server");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const newState = await devServerClient.toggle(worktreeId, worktreePath);
      setState(newState);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to toggle dev server";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [worktreeId, worktreePath]);

  return {
    state,
    hasDevScript,
    start,
    stop,
    toggle,
    isLoading,
    error,
  };
}

/**
 * Hook for managing all dev server states globally
 *
 * Use this when you need to track dev servers across multiple worktrees,
 * such as in a dashboard view.
 *
 * @example
 * ```tsx
 * const devServerStates = useDevServerStates()
 *
 * return (
 *   <ul>
 *     {Array.from(devServerStates.entries()).map(([id, state]) => (
 *       <li key={id}>{state.status}: {state.url}</li>
 *     ))}
 *   </ul>
 * )
 * ```
 */
export function useDevServerStates(): Map<string, DevServerState> {
  const [states, setStates] = useState<Map<string, DevServerState>>(new Map());

  useEffect(() => {
    const unsub = devServerClient.onUpdate((state) => {
      setStates((prev) => {
        const next = new Map(prev);
        next.set(state.worktreeId, state);
        return next;
      });
    });

    return unsub;
  }, []);

  return states;
}
