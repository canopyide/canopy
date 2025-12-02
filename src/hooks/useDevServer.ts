import { useState, useEffect, useCallback } from "react";
import type { DevServerState } from "../types";
import { devServerClient } from "@/clients";

interface UseDevServerOptions {
  worktreeId: string;
  worktreePath?: string;
}

interface UseDevServerReturn {
  state: DevServerState | null;
  hasDevScript: boolean;
  start: (command?: string) => Promise<void>;
  stop: () => Promise<void>;
  toggle: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function useDevServer({
  worktreeId,
  worktreePath,
}: UseDevServerOptions): UseDevServerReturn {
  const [state, setState] = useState<DevServerState | null>(null);
  const [hasDevScript, setHasDevScript] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    const unsubUpdate = devServerClient.onUpdate((newState) => {
      if (newState.worktreeId === worktreeId) {
        setState(newState);
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
