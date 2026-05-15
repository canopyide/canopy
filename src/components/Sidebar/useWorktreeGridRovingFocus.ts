import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type React from "react";

type GridMode = "list" | "toolbar";

const ROW_SELECTOR = "[data-worktree-row]";
const TOOLBAR_SELECTOR = "[data-worktree-row-toolbar]";
const TOOLBAR_ITEM_SELECTOR =
  "button:not(:disabled), [role='button']:not([aria-disabled='true']), [tabindex]:not([tabindex='-1'])";
// Every natively-focusable element inside a row that isn't the row itself.
// These are demoted to tabIndex=-1 so the grid presents exactly one tab stop;
// access happens via the row → toolbar mode flow or directly via mouse.
const ROW_DESCENDANT_SELECTOR =
  "button, a[href], input, select, textarea, [tabindex]:not([data-worktree-row])";

function isElementVisible(el: HTMLElement): boolean {
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

// Row count to advance per Page key. Read viewport height from the scroll
// container and divide by the height of a row inside that container — pinned
// rows live outside the scroll viewport and have a different height (e.g. the
// taller main worktree card), so sampling them would over- or under-count.
// Fall back to 10 when sizes aren't measurable yet (initial layout, container
// detached).
const PAGE_SIZE_FALLBACK = 10;
function computeGridPageSize(
  container: HTMLElement | null | undefined,
  rows: HTMLElement[]
): number {
  if (!container || rows.length === 0) return PAGE_SIZE_FALLBACK;
  const viewportHeight = container.clientHeight;
  if (viewportHeight <= 0) return PAGE_SIZE_FALLBACK;
  const scrollableRow = rows.find((row) => container.contains(row)) ?? rows[0];
  const sampleHeight = scrollableRow?.getBoundingClientRect().height ?? 0;
  if (sampleHeight <= 0) return PAGE_SIZE_FALLBACK;
  return Math.max(1, Math.floor(viewportHeight / sampleHeight));
}

export interface UseWorktreeGridRovingFocusOptions {
  /**
   * Called when the user presses Alt+ArrowUp/ArrowDown on a focused row.
   * The hook resolves the row element and the move delta; the caller owns
   * the reorder mutation (Alt+Arrow is a sidebar-specific shortcut, not a
   * generic roving-focus concern).
   */
  onKeyboardReorder?: (rowElement: HTMLElement, delta: -1 | 1) => void;
}

export interface UseWorktreeGridRovingFocusReturn {
  gridRef: React.RefObject<HTMLDivElement | null>;
  handleGridKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  handleGridFocusCapture: (e: React.FocusEvent<HTMLDivElement>) => void;
}

export function useWorktreeGridRovingFocus(
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>,
  options?: UseWorktreeGridRovingFocusOptions
): UseWorktreeGridRovingFocusReturn {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef<GridMode>("list");
  const activeRowIndexRef = useRef<number>(0);
  const activeToolbarIndexRef = useRef<number>(0);
  // Stash the callback in a ref so a fresh `options` identity each render
  // doesn't re-create handleGridKeyDown (which would re-run useEffect deps
  // and rebind tab stops unnecessarily).
  const onKeyboardReorderRef = useRef<UseWorktreeGridRovingFocusOptions["onKeyboardReorder"]>(
    options?.onKeyboardReorder
  );
  useEffect(() => {
    onKeyboardReorderRef.current = options?.onKeyboardReorder;
  });

  const getRows = useCallback((): HTMLElement[] => {
    if (!gridRef.current) return [];
    return Array.from(gridRef.current.querySelectorAll<HTMLElement>(ROW_SELECTOR)).filter(
      isElementVisible
    );
  }, []);

  const getRowToolbarItems = useCallback((row: HTMLElement): HTMLElement[] => {
    const toolbar = row.querySelector<HTMLElement>(TOOLBAR_SELECTOR);
    if (!toolbar) return [];
    return Array.from(toolbar.querySelectorAll<HTMLElement>(TOOLBAR_ITEM_SELECTOR)).filter(
      isElementVisible
    );
  }, []);

  // Force every native focusable inside the row out of the tab order. Called
  // every render and on every navigation event — without it, every per-row
  // button (select, collapse, PR link, etc.) keeps tabIndex=0 and the user
  // still hits hundreds of tab stops to traverse the list.
  const demoteRowDescendants = useCallback((row: HTMLElement) => {
    const descendants = row.querySelectorAll<HTMLElement>(ROW_DESCENDANT_SELECTOR);
    for (const el of descendants) {
      if (el.tabIndex !== -1) el.tabIndex = -1;
    }
  }, []);

  const syncRowTabStops = useCallback(
    (rows: HTMLElement[], activeIdx: number) => {
      for (const row of rows) {
        row.tabIndex = -1;
        demoteRowDescendants(row);
      }
      if (rows[activeIdx]) rows[activeIdx].tabIndex = 0;
    },
    [demoteRowDescendants]
  );

  const syncToolbarTabStops = useCallback((items: HTMLElement[], activeIdx: number) => {
    for (const el of items) el.tabIndex = -1;
    if (items[activeIdx]) items[activeIdx].tabIndex = 0;
  }, []);

  const selectRow = useCallback(
    (row: HTMLElement | undefined, e: React.KeyboardEvent | React.SyntheticEvent) => {
      if (!row) return;
      const selectBtn = row.querySelector<HTMLElement>("button[aria-label^='Select worktree']");
      if (selectBtn) {
        e.preventDefault();
        e.stopPropagation();
        selectBtn.click();
      }
    },
    []
  );

  const enterListMode = useCallback(
    (rows: HTMLElement[], rowIdx: number) => {
      modeRef.current = "list";
      activeRowIndexRef.current = rowIdx;
      // Reset toolbar items in the previously active row so they are no longer
      // tab-reachable from outside the grid.
      const previousRow = rows[rowIdx];
      if (previousRow) {
        const items = getRowToolbarItems(previousRow);
        for (const el of items) el.tabIndex = -1;
      }
      syncRowTabStops(rows, rowIdx);
    },
    [getRowToolbarItems, syncRowTabStops]
  );

  const enterToolbarMode = useCallback(
    (rows: HTMLElement[], rowIdx: number): boolean => {
      const row = rows[rowIdx];
      if (!row) return false;
      const items = getRowToolbarItems(row);
      if (items.length === 0) return false;
      modeRef.current = "toolbar";
      activeToolbarIndexRef.current = 0;
      // Hand the tab stop off from the row to the first toolbar button so a
      // re-entrant Tab still hits this row's actions.
      row.tabIndex = -1;
      syncToolbarTabStops(items, 0);
      items[0]!.focus();
      return true;
    },
    [getRowToolbarItems, syncToolbarTabStops]
  );

  // After every render, re-sync the tab stops so a single row owns tabIndex=0.
  // Mirrors Toolbar.tsx's approach — survives re-renders without storing the
  // active index in React state.
  useLayoutEffect(() => {
    const rows = getRows();
    if (rows.length === 0) return;
    const clamped = Math.min(activeRowIndexRef.current, rows.length - 1);
    activeRowIndexRef.current = clamped;
    if (modeRef.current === "list") {
      syncRowTabStops(rows, clamped);
    } else {
      const row = rows[clamped];
      if (row) {
        const items = getRowToolbarItems(row);
        if (items.length === 0) {
          // Toolbar disappeared (e.g., row no longer hover/focus visible) —
          // fall back to list mode.
          enterListMode(rows, clamped);
        } else {
          row.tabIndex = -1;
          const itemIdx = Math.min(activeToolbarIndexRef.current, items.length - 1);
          activeToolbarIndexRef.current = itemIdx;
          syncToolbarTabStops(items, itemIdx);
        }
      }
    }
  });

  // Reset to list mode when the window loses focus so re-entering the grid
  // always starts on a row, never inside a toolbar (lesson #4591). Repairs the
  // DOM tab stops too — leaving stale tabIndex=0 on a toolbar item would let
  // the next Tab land back inside that toolbar instead of on the row.
  useEffect(() => {
    const handleBlur = () => {
      const wasInToolbar = modeRef.current === "toolbar";
      modeRef.current = "list";
      if (!wasInToolbar) return;
      const rows = getRows();
      if (rows.length === 0) return;
      const rowIdx = Math.min(activeRowIndexRef.current, rows.length - 1);
      const row = rows[rowIdx];
      if (row) {
        const items = getRowToolbarItems(row);
        for (const el of items) el.tabIndex = -1;
      }
      syncRowTabStops(rows, rowIdx);
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [getRows, getRowToolbarItems, syncRowTabStops]);

  const handleGridFocusCapture = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const rows = getRows();
      if (rows.length === 0) return;

      const rowIdx = rows.findIndex((row) => row === target);
      if (rowIdx !== -1) {
        // Focus landed on the row wrapper itself.
        activeRowIndexRef.current = rowIdx;
        if (modeRef.current === "toolbar") {
          enterListMode(rows, rowIdx);
        } else {
          syncRowTabStops(rows, rowIdx);
        }
        return;
      }

      // Focus landed inside a row — find which one.
      const containingRowIdx = rows.findIndex((row) => row.contains(target));
      if (containingRowIdx === -1) return;

      activeRowIndexRef.current = containingRowIdx;
      const row = rows[containingRowIdx]!;

      // If the focus target is inside the per-row action toolbar, switch to
      // toolbar mode and remember which item is active.
      const toolbar = row.querySelector<HTMLElement>(TOOLBAR_SELECTOR);
      if (toolbar && toolbar.contains(target)) {
        const items = getRowToolbarItems(row);
        const itemIdx = items.indexOf(target);
        if (itemIdx !== -1) {
          modeRef.current = "toolbar";
          activeToolbarIndexRef.current = itemIdx;
          row.tabIndex = -1;
          syncToolbarTabStops(items, itemIdx);
          return;
        }
      }
      // Focus landed somewhere inside the row but outside the toolbar (e.g.,
      // the underlying full-card "Select worktree" button, or a click into a
      // different row while we were in toolbar mode on row A). Always reset
      // toolbar items in the previously active row before promoting this row.
      enterListMode(rows, containingRowIdx);
    },
    [enterListMode, getRowToolbarItems, getRows, syncRowTabStops, syncToolbarTabStops]
  );

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.metaKey) return;
      // Carve Alt+ArrowUp / Alt+ArrowDown through the modifier guard so a
      // focused row can be reordered without leaving the keyboard. Every
      // other Alt combo still bails so global shortcuts keep firing. Arrow
      // keys don't get Option-transformed on macOS (lesson #1678), so
      // checking e.key is safe cross-platform.
      const isAltArrowReorder = e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown");
      if (e.altKey && !isAltArrowReorder) return;
      // Allow Ctrl+Home / Ctrl+End through (mandatory APG grid shortcuts);
      // bail on every other Ctrl combo so global shortcuts (Ctrl+C, Ctrl+T,
      // Ctrl+W, …) still reach their handlers.
      if (e.ctrlKey && e.key !== "Home" && e.key !== "End") return;

      const rows = getRows();
      if (rows.length === 0) return;

      const mode = modeRef.current;
      if (!(e.target instanceof HTMLElement)) return;
      const target = e.target;
      const isOnRow = rows.some((row) => row === target);

      if (mode === "list") {
        // If focus isn't on a row wrapper, skip — the user is interacting with
        // some other in-grid element (e.g., a scroll indicator).
        if (!isOnRow) return;

        const currentIdx = Math.min(activeRowIndexRef.current, rows.length - 1);

        if (isAltArrowReorder) {
          // Reorder the focused row in place. The hook stays unaware of
          // worktrees — it just hands the focused row element + direction
          // back to the caller, which owns the persistence mutation. Always
          // preventDefault so Alt+Arrow never falls through to row navigation
          // (which would move focus and confuse the user) even if no
          // reorder handler is wired.
          e.preventDefault();
          e.stopPropagation();
          const row = rows[currentIdx];
          if (row && onKeyboardReorderRef.current) {
            onKeyboardReorderRef.current(row, e.key === "ArrowDown" ? 1 : -1);
          }
          return;
        }

        let newIdx: number | null = null;

        if (e.key === "Enter" || e.key === "ArrowRight") {
          // Try to enter toolbar mode. If the row has no toolbar items
          // (e.g., the actions wrapper is hidden), fall back to selecting
          // the row's primary worktree (the absolute "Select worktree" button).
          if (enterToolbarMode(rows, currentIdx)) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          selectRow(rows[currentIdx], e);
          return;
        }

        if (e.key === " " || e.key === "Spacebar") {
          selectRow(rows[currentIdx], e);
          return;
        }

        switch (e.key) {
          case "ArrowDown":
            newIdx = Math.min(currentIdx + 1, rows.length - 1);
            break;
          case "ArrowUp":
            newIdx = Math.max(currentIdx - 1, 0);
            break;
          case "PageDown": {
            const pageSize = computeGridPageSize(scrollContainerRef?.current, rows);
            newIdx = Math.min(currentIdx + pageSize, rows.length - 1);
            break;
          }
          case "PageUp": {
            const pageSize = computeGridPageSize(scrollContainerRef?.current, rows);
            newIdx = Math.max(currentIdx - pageSize, 0);
            break;
          }
          case "Home":
            newIdx = 0;
            break;
          case "End":
            newIdx = rows.length - 1;
            break;
        }
        if (newIdx !== null) {
          e.preventDefault();
          activeRowIndexRef.current = newIdx;
          syncRowTabStops(rows, newIdx);
          rows[newIdx]!.focus();
        }
        return;
      }

      // Toolbar mode
      const rowIdx = activeRowIndexRef.current;
      const row = rows[rowIdx];
      if (!row) return;
      const items = getRowToolbarItems(row);
      if (items.length === 0) {
        enterListMode(rows, rowIdx);
        return;
      }
      const currentIdx = Math.min(activeToolbarIndexRef.current, items.length - 1);

      if (e.key === "Escape") {
        enterListMode(rows, rowIdx);
        row.focus();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Ctrl+Home / Ctrl+End are grid-level shortcuts even when focus has
      // descended into a row's action toolbar. Bounce back to list mode and
      // jump to the first/last row, mirroring the APG grid pattern.
      if (e.ctrlKey && (e.key === "Home" || e.key === "End")) {
        const targetRowIdx = e.key === "Home" ? 0 : rows.length - 1;
        enterListMode(rows, targetRowIdx);
        e.preventDefault();
        activeRowIndexRef.current = targetRowIdx;
        syncRowTabStops(rows, targetRowIdx);
        rows[targetRowIdx]!.focus();
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        // Up/Down in toolbar mode bounces back to list mode and moves rows.
        // Boundary-stop (no wrap) so users don't silently jump from the last
        // row to the first — matches APG grid row navigation.
        enterListMode(rows, rowIdx);
        const nextIdx =
          e.key === "ArrowDown" ? Math.min(rowIdx + 1, rows.length - 1) : Math.max(rowIdx - 1, 0);
        e.preventDefault();
        activeRowIndexRef.current = nextIdx;
        syncRowTabStops(rows, nextIdx);
        rows[nextIdx]!.focus();
        return;
      }

      let newIdx: number | null = null;
      switch (e.key) {
        case "ArrowRight":
          newIdx = (currentIdx + 1) % items.length;
          break;
        case "ArrowLeft":
          newIdx = (currentIdx - 1 + items.length) % items.length;
          break;
        case "Home":
          newIdx = 0;
          break;
        case "End":
          newIdx = items.length - 1;
          break;
      }
      if (newIdx !== null) {
        e.preventDefault();
        activeToolbarIndexRef.current = newIdx;
        syncToolbarTabStops(items, newIdx);
        items[newIdx]!.focus();
      }
    },
    [
      enterListMode,
      enterToolbarMode,
      getRowToolbarItems,
      getRows,
      scrollContainerRef,
      selectRow,
      syncRowTabStops,
      syncToolbarTabStops,
    ]
  );

  return { gridRef, handleGridKeyDown, handleGridFocusCapture };
}
