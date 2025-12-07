import { useEffect, useCallback, useMemo } from "react";
import type { WorktreeState } from "../types";
import { useWorktreeDataStore } from "@/store/worktreeDataStore";
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
  const worktreeMap = useWorktreeDataStore((state) => state.worktrees);
  const isLoading = useWorktreeDataStore((state) => state.isLoading);
  const error = useWorktreeDataStore((state) => state.error);
  const isInitialized = useWorktreeDataStore((state) => state.isInitialized);
  const initialize = useWorktreeDataStore((state) => state.initialize);
  const storeRefresh = useWorktreeDataStore((state) => state.refresh);

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  const refresh = useCallback(async () => {
    await storeRefresh();
  }, [storeRefresh]);

  const setActive = useCallback((id: string) => {
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
    activeId: worktrees.length > 0 ? worktrees[0].id : null,
    isLoading,
    error,
    refresh,
    setActive,
  };
}

export function useWorktree(worktreeId: string): WorktreeState | null {
  const getWorktree = useWorktreeDataStore((state) => state.getWorktree);
  const isInitialized = useWorktreeDataStore((state) => state.isInitialized);
  const initialize = useWorktreeDataStore((state) => state.initialize);

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  return getWorktree(worktreeId) ?? null;
}
