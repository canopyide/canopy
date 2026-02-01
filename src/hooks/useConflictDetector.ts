import { useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useWorktreeDataStore } from "@/store/worktreeDataStore";
import {
  detectConflicts,
  getWorktreeConflicts,
  type ConflictInfo,
  type WorktreeConflictSummary,
} from "@/utils/conflictDetector";

function areConflictsEqual(a: ConflictInfo[], b: ConflictInfo[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].filePath !== b[i].filePath) return false;
    if (a[i].worktreeIds.length !== b[i].worktreeIds.length) return false;
    for (let j = 0; j < a[i].worktreeIds.length; j++) {
      if (a[i].worktreeIds[j] !== b[i].worktreeIds[j]) return false;
    }
  }
  return true;
}

/**
 * Hook to detect file conflicts across all worktrees.
 * Uses Zustand selector to compute conflicts only once per store update.
 *
 * @returns All detected conflicts (files modified in 2+ worktrees)
 */
export function useAllConflicts(): ConflictInfo[] {
  const prevRef = useRef<ConflictInfo[]>([]);

  const worktreeArray = useWorktreeDataStore(
    useShallow((state) => Array.from(state.worktrees.values()))
  );

  return useMemo(() => {
    const conflicts = detectConflicts(worktreeArray);
    if (areConflictsEqual(conflicts, prevRef.current)) {
      return prevRef.current;
    }
    prevRef.current = conflicts;
    return conflicts;
  }, [worktreeArray]);
}

/**
 * Hook to get conflict summary for a specific worktree.
 *
 * @param worktreeId - ID of the worktree to check for conflicts
 * @returns Conflict summary for this worktree
 */
export function useWorktreeConflicts(worktreeId: string): WorktreeConflictSummary {
  const allConflicts = useAllConflicts();

  return useMemo(() => {
    return getWorktreeConflicts(worktreeId, allConflicts);
  }, [worktreeId, allConflicts]);
}

/**
 * Hook to check if a worktree has any conflicts.
 *
 * @param worktreeId - ID of the worktree to check
 * @returns True if worktree has files conflicting with other worktrees
 */
export function useHasConflicts(worktreeId: string): boolean {
  const { conflictCount } = useWorktreeConflicts(worktreeId);
  return conflictCount > 0;
}
