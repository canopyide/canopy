import { useMemo, useCallback, useRef, useEffect } from "react";
import { useTerminalStore, useLayoutConfigStore } from "@/store";
import { useShallow } from "zustand/react/shallow";

export type NavigationDirection = "up" | "down" | "left" | "right";

interface GridPosition {
  terminalId: string;
  row: number;
  col: number;
  center: { x: number; y: number };
}

interface UseGridNavigationOptions {
  containerSelector?: string;
}

export function useGridNavigation(options: UseGridNavigationOptions = {}) {
  const { containerSelector = "[role='grid']" } = options;

  const { terminals, focusedId } = useTerminalStore(
    useShallow((state) => ({
      terminals: state.terminals,
      focusedId: state.focusedId,
    }))
  );

  const layoutConfig = useLayoutConfigStore((state) => state.layoutConfig);

  const gridTerminals = useMemo(
    () => terminals.filter((t) => t.location === "grid" || t.location === undefined),
    [terminals]
  );

  const dockTerminals = useMemo(() => terminals.filter((t) => t.location === "dock"), [terminals]);

  const directionCache = useRef(new Map<string, string | null>());

  const gridLayout = useMemo(() => {
    if (gridTerminals.length === 0) return [];

    const container = document.querySelector(containerSelector);
    if (!container) return [];

    const positions: GridPosition[] = [];

    for (const terminal of gridTerminals) {
      // Find element by data-terminal-id attribute on sortable wrapper
      const element = container.querySelector(`[data-terminal-id="${terminal.id}"]`);

      if (!element) continue;

      const bounds = element.getBoundingClientRect();
      positions.push({
        terminalId: terminal.id,
        row: -1,
        col: -1,
        center: {
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        },
      });
    }

    if (positions.length === 0) return [];

    // Sort by Y position (top to bottom)
    positions.sort((a, b) => a.center.y - b.center.y);

    // Group into rows (terminals with similar Y positions)
    const rows: GridPosition[][] = [];
    const Y_THRESHOLD = 50; // Pixels of Y overlap to consider same row

    for (const pos of positions) {
      let addedToRow = false;
      for (const row of rows) {
        const rowY = row[0].center.y;
        if (Math.abs(pos.center.y - rowY) < Y_THRESHOLD) {
          row.push(pos);
          addedToRow = true;
          break;
        }
      }
      if (!addedToRow) {
        rows.push([pos]);
      }
    }

    // Within each row, sort by X position (left to right) and assign indices
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      row.sort((a, b) => a.center.x - b.center.x);
      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        row[colIndex].row = rowIndex;
        row[colIndex].col = colIndex;
      }
    }

    return positions;
  }, [gridTerminals, containerSelector, layoutConfig]);

  // Clear cache when grid layout changes
  useEffect(() => {
    directionCache.current.clear();
  }, [gridLayout]);

  const findNearest = useCallback(
    (currentId: string, direction: NavigationDirection): string | null => {
      const cacheKey = `${currentId}:${direction}`;
      if (directionCache.current.has(cacheKey)) {
        return directionCache.current.get(cacheKey) ?? null;
      }

      const current = gridLayout.find((p) => p.terminalId === currentId);
      if (!current) return null;

      let candidates: GridPosition[];

      switch (direction) {
        case "up":
          // Same column, lower row index
          candidates = gridLayout.filter((p) => p.col === current.col && p.row < current.row);
          // Get closest (max row index)
          candidates.sort((a, b) => b.row - a.row);
          // Fallback: if no exact column match, find nearest by X distance
          if (candidates.length === 0) {
            candidates = gridLayout.filter((p) => p.row < current.row);
            candidates.sort(
              (a, b) =>
                b.row - a.row ||
                Math.abs(a.center.x - current.center.x) - Math.abs(b.center.x - current.center.x)
            );
          }
          break;

        case "down":
          // Same column, higher row index
          candidates = gridLayout.filter((p) => p.col === current.col && p.row > current.row);
          // Get closest (min row index)
          candidates.sort((a, b) => a.row - b.row);
          // Fallback: if no exact column match, find nearest by X distance
          if (candidates.length === 0) {
            candidates = gridLayout.filter((p) => p.row > current.row);
            candidates.sort(
              (a, b) =>
                a.row - b.row ||
                Math.abs(a.center.x - current.center.x) - Math.abs(b.center.x - current.center.x)
            );
          }
          break;

        case "left":
          // Same row, lower col index
          candidates = gridLayout.filter((p) => p.row === current.row && p.col < current.col);
          // Get closest (max col index)
          candidates.sort((a, b) => b.col - a.col);
          break;

        case "right":
          // Same row, higher col index
          candidates = gridLayout.filter((p) => p.row === current.row && p.col > current.col);
          // Get closest (min col index)
          candidates.sort((a, b) => a.col - b.col);
          break;
      }

      let result = candidates[0]?.terminalId ?? null;

      // If we hit an edge, fall back to linear reading order (row-major)
      if (!result) {
        const sortedPositions = [...gridLayout].sort((a, b) => {
          if (a.row !== b.row) return a.row - b.row;
          return a.col - b.col;
        });

        const currentIndex = sortedPositions.findIndex((p) => p.terminalId === currentId);
        if (currentIndex !== -1) {
          if (direction === "right" || direction === "down") {
            const nextIndex = (currentIndex + 1) % sortedPositions.length;
            result = sortedPositions[nextIndex].terminalId;
          } else {
            const prevIndex = (currentIndex - 1 + sortedPositions.length) % sortedPositions.length;
            result = sortedPositions[prevIndex].terminalId;
          }
        }
      }

      directionCache.current.set(cacheKey, result);
      return result;
    },
    [gridLayout]
  );

  const findByIndex = useCallback(
    (index: number): string | null => {
      // Use visual order (sorted by row, then col)
      const sortedPositions = [...gridLayout].sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return a.col - b.col;
      });

      // Index is 1-based for user convenience (Cmd+1 = first terminal)
      const position = sortedPositions[index - 1];
      return position?.terminalId ?? null;
    },
    [gridLayout]
  );

  const findDockByIndex = useCallback(
    (currentId: string, direction: "left" | "right"): string | null => {
      if (dockTerminals.length === 0) return null;

      const currentIndex = dockTerminals.findIndex((t) => t.id === currentId);
      if (currentIndex === -1) return null;

      if (direction === "left") {
        return currentIndex > 0 ? dockTerminals[currentIndex - 1].id : null;
      } else {
        return currentIndex < dockTerminals.length - 1 ? dockTerminals[currentIndex + 1].id : null;
      }
    },
    [dockTerminals]
  );

  const getCurrentLocation = useCallback((): "grid" | "dock" | null => {
    if (!focusedId) return null;
    const terminal = terminals.find((t) => t.id === focusedId);
    if (!terminal) return null;
    return terminal.location === "dock" ? "dock" : "grid";
  }, [focusedId, terminals]);

  return {
    gridLayout,
    gridTerminals,
    dockTerminals,
    findNearest,
    findByIndex,
    findDockByIndex,
    getCurrentLocation,
  };
}
