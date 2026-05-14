import { useCallback } from "react";
import { useIssueSelectionStore, EMPTY_SELECTED_IDS } from "@/store/issueSelectionStore";

export interface UseIssueSelectionReturn {
  selectedIds: Set<number>;
  isSelectionActive: boolean;
  toggle: (id: number, index: number) => void;
  toggleRange: (toIndex: number, getIdAt: (index: number) => number) => void;
  selectAll: (ids: number[]) => void;
  clear: () => void;
}

// Thin component-facing view over `useIssueSelectionStore`, scoped to one
// `${type}:${projectPath}` key. The returned actions are stable per key, so a
// reference captured here (e.g. handed to the bulk-create dialog) keeps working
// even if this component remounts — it just calls back into the module store.
export function useIssueSelection(
  type: "issue" | "pr",
  projectPath: string
): UseIssueSelectionReturn {
  const key = `${type}:${projectPath}`;

  const selectedIds = useIssueSelectionStore(
    (s) => s.selections.get(key)?.selectedIds ?? EMPTY_SELECTED_IDS
  );
  const toggleAction = useIssueSelectionStore((s) => s.toggle);
  const toggleRangeAction = useIssueSelectionStore((s) => s.toggleRange);
  const selectAllAction = useIssueSelectionStore((s) => s.selectAll);
  const clearAction = useIssueSelectionStore((s) => s.clear);

  const toggle = useCallback(
    (id: number, index: number) => toggleAction(key, id, index),
    [toggleAction, key]
  );
  const toggleRange = useCallback(
    (toIndex: number, getIdAt: (index: number) => number) =>
      toggleRangeAction(key, toIndex, getIdAt),
    [toggleRangeAction, key]
  );
  const selectAll = useCallback(
    (ids: number[]) => selectAllAction(key, ids),
    [selectAllAction, key]
  );
  const clear = useCallback(() => clearAction(key), [clearAction, key]);

  return {
    selectedIds,
    isSelectionActive: selectedIds.size > 0,
    toggle,
    toggleRange,
    selectAll,
    clear,
  };
}
