import { useState, useEffect, useCallback, useMemo } from "react";
import type { WorktreeState } from "../types";
import { worktreeClient } from "@/clients";

export interface UseWorktreesReturn {
  worktrees: WorktreeState[];
  worktreeMap: Map<string, WorktreeState>;
  activeId: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setActive: (id: string) => void;
}

export function useWorktrees(): UseWorktreesReturn {
  const [worktreeMap, setWorktreeMap] = useState<Map<string, WorktreeState>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWorktrees() {
      try {
        setIsLoading(true);
        setError(null);
        const states = await worktreeClient.getAll();
        if (!cancelled) {
          const map = new Map(states.map((s) => [s.id, s]));
          setWorktreeMap(map);

          if (states.length > 0 && activeId === null) {
            const currentWorktree = states.find((s) => s.isCurrent);
            const mainWorktree = states.find((s) => s.isMainWorktree);
            const initialActive = currentWorktree?.id ?? mainWorktree?.id ?? states[0].id;
            setActiveId(initialActive);

            worktreeClient.setActive(initialActive).catch(() => {});
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load worktrees");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadWorktrees();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsubUpdate = worktreeClient.onUpdate((state) => {
      setWorktreeMap((prev) => {
        const next = new Map(prev);
        next.set(state.id, state);
        return next;
      });
    });

    const unsubRemove = worktreeClient.onRemove(({ worktreeId }) => {
      setWorktreeMap((prev) => {
        const next = new Map(prev);
        next.delete(worktreeId);
        return next;
      });

      setActiveId((current) => {
        if (current === worktreeId) {
          return null;
        }
        return current;
      });
    });

    return () => {
      unsubUpdate();
      unsubRemove();
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      await worktreeClient.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh worktrees");
    }
  }, []);

  const setActive = useCallback((id: string) => {
    setActiveId(id);
    worktreeClient.setActive(id).catch(() => {});
  }, []);

  const worktrees = useMemo(() => {
    return Array.from(worktreeMap.values()).sort((a, b) => {
      const aIsMain = a.branch === "main" || a.branch === "master";
      const bIsMain = b.branch === "main" || b.branch === "master";
      if (aIsMain !== bIsMain) {
        return aIsMain ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });
  }, [worktreeMap]);

  return {
    worktrees,
    worktreeMap,
    activeId,
    isLoading,
    error,
    refresh,
    setActive,
  };
}

export function useWorktree(worktreeId: string): WorktreeState | null {
  const [worktree, setWorktree] = useState<WorktreeState | null>(null);

  useEffect(() => {
    let cancelled = false;

    worktreeClient
      .getAll()
      .then((states) => {
        if (!cancelled) {
          const found = states.find((s) => s.id === worktreeId);
          setWorktree(found ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorktree(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [worktreeId]);

  useEffect(() => {
    const unsubUpdate = worktreeClient.onUpdate((state) => {
      if (state.id === worktreeId) {
        setWorktree(state);
      }
    });

    const unsubRemove = worktreeClient.onRemove(({ worktreeId: removedId }) => {
      if (removedId === worktreeId) {
        setWorktree(null);
      }
    });

    return () => {
      unsubUpdate();
      unsubRemove();
    };
  }, [worktreeId]);

  return worktree;
}
