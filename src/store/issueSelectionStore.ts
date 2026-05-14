import { create } from "zustand";

// Bulk issue/PR selection for the GitHub toolbar dropdown, keyed by
// `${type}:${projectPath}`. This lives in a module-level store rather than a
// component-local reducer so the selection — and the actions that mutate it —
// survive the dropdown being hidden (`<Activity>`), remounted (the toolbar's
// lazy/direct component swap), or handed off by value to the bulk-create
// dialog. The dialog's "Done" handler clears by key, so completion no longer
// depends on a specific `GitHubResourceList` instance still being alive.

interface SelectionEntry {
  selectedIds: Set<number>;
  lastSelectedIndex: number;
}

interface IssueSelectionState {
  selections: Map<string, SelectionEntry>;
  toggle: (key: string, id: number, index: number) => void;
  toggleRange: (key: string, toIndex: number, getIdAt: (index: number) => number) => void;
  selectAll: (key: string, ids: number[]) => void;
  clear: (key: string) => void;
}

// Shared empty Set — entries are never mutated in place (mutations always
// build a fresh Set), so handing the same reference back keeps selector
// identity stable when a key has no selection yet.
export const EMPTY_SELECTED_IDS: Set<number> = new Set();

const EMPTY_ENTRY: SelectionEntry = {
  selectedIds: EMPTY_SELECTED_IDS,
  lastSelectedIndex: -1,
};

export const useIssueSelectionStore = create<IssueSelectionState>((set) => ({
  selections: new Map(),

  toggle: (key, id, index) =>
    set((state) => {
      const entry = state.selections.get(key) ?? EMPTY_ENTRY;
      const next = new Set(entry.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      const selections = new Map(state.selections);
      selections.set(key, { selectedIds: next, lastSelectedIndex: index });
      return { selections };
    }),

  toggleRange: (key, toIndex, getIdAt) =>
    set((state) => {
      const entry = state.selections.get(key) ?? EMPTY_ENTRY;
      const next = new Set(entry.selectedIds);
      const fromIndex = entry.lastSelectedIndex;
      // No prior anchor: fall back to a single toggle and seat the anchor.
      // With an anchor: extend the range but leave the anchor in place so a
      // follow-up shift-click re-extends from the original point.
      let lastSelectedIndex = entry.lastSelectedIndex;
      if (fromIndex < 0) {
        next.add(getIdAt(toIndex));
        lastSelectedIndex = toIndex;
      } else {
        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);
        for (let i = start; i <= end; i++) {
          next.add(getIdAt(i));
        }
      }
      const selections = new Map(state.selections);
      selections.set(key, { selectedIds: next, lastSelectedIndex });
      return { selections };
    }),

  selectAll: (key, ids) =>
    set((state) => {
      const entry = state.selections.get(key) ?? EMPTY_ENTRY;
      const selections = new Map(state.selections);
      selections.set(key, {
        selectedIds: new Set(ids),
        lastSelectedIndex: entry.lastSelectedIndex,
      });
      return { selections };
    }),

  clear: (key) =>
    set((state) => {
      const entry = state.selections.get(key);
      if (!entry || (entry.selectedIds.size === 0 && entry.lastSelectedIndex === -1)) {
        return state;
      }
      const selections = new Map(state.selections);
      selections.set(key, EMPTY_ENTRY);
      return { selections };
    }),
}));
