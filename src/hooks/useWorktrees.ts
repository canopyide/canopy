import { useEffect, useCallback, useMemo } from "react";
import type { WorktreeState } from "../types";
import { useWorktreeDataStore } from "@/store/worktreeDataStore";
import { useProjectStore } from "@/store/projectStore";
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

const emptyMap = new Map<string, WorktreeState>();

export function useWorktrees(): UseWorktreesReturn {
  const worktreeMap = useWorktreeDataStore((state) => state.worktrees);
  const storeProjectId = useWorktreeDataStore((state) => state.projectId);
  const isLoading = useWorktreeDataStore((state) => state.isLoading);
  const error = useWorktreeDataStore((state) => state.error);
  const isInitialized = useWorktreeDataStore((state) => state.isInitialized);
  const initialize = useWorktreeDataStore((state) => state.initialize);
  const storeRefresh = useWorktreeDataStore((state) => state.refresh);
  const currentProjectId = useProjectStore((state) => state.currentProject?.id ?? null);

  // Worktrees loaded for a different project must never be displayed.
  // storeProjectId is null only during the initial load (no switch yet) — safe to show.
  const projectMismatch =
    storeProjectId !== null && currentProjectId !== null && storeProjectId !== currentProjectId;

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

  const effectiveMap = projectMismatch ? emptyMap : worktreeMap;

  const worktrees = useMemo(() => {
    return Array.from(effectiveMap.values()).sort((a, b) => {
      // Use isMainWorktree flag for consistent sorting
      if (a.isMainWorktree && !b.isMainWorktree) return -1;
      if (!a.isMainWorktree && b.isMainWorktree) return 1;

      // Secondary sort by last activity
      const timeA = a.lastActivityTimestamp ?? 0;
      const timeB = b.lastActivityTimestamp ?? 0;
      if (timeA !== timeB) {
        return timeB - timeA;
      }

      return a.name.localeCompare(b.name);
    });
  }, [effectiveMap]);

  return {
    worktrees,
    worktreeMap: effectiveMap,
    activeId: worktrees.length > 0 ? worktrees[0].id : null,
    isLoading: isLoading || projectMismatch,
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
