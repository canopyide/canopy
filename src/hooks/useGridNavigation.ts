import { useMemo, useCallback, useRef, useEffect } from "react";
import { useTerminalStore } from "@/store";
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

    positions.sort((a, b) => a.center.y - b.center.y);

    const rows: GridPosition[][] = [];
    const Y_THRESHOLD = 50;
    const X_THRESHOLD = 50;

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

    const xSorted = [...positions].sort((a, b) => a.center.x - b.center.x);
    const xClusters: number[] = [];
    for (const pos of xSorted) {
      const x = pos.center.x;
      const last = xClusters[xClusters.length - 1];
      if (last === undefined || Math.abs(x - last) >= X_THRESHOLD) {
        xClusters.push(x);
      }
      pos.col = xClusters.length - 1;
    }

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      row.sort((a, b) => a.center.x - b.center.x);
      for (const pos of row) {
        pos.row = rowIndex;
      }
    }

    return positions;
  }, [gridTerminals, containerSelector]);

  const rowMajor = useMemo(() => {
    return [...gridLayout].sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });
  }, [gridLayout]);

  const positionById = useMemo(() => {
    const map = new Map<string, GridPosition>();
    for (const pos of gridLayout) map.set(pos.terminalId, pos);
    return map;
  }, [gridLayout]);

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    rowMajor.forEach((pos, index) => {
      map.set(pos.terminalId, index);
    });
    return map;
  }, [rowMajor]);

  const columnBuckets = useMemo(() => {
    const buckets = new Map<number, GridPosition[]>();
    for (const pos of gridLayout) {
      const col = pos.col;
      if (!buckets.has(col)) {
        buckets.set(col, []);
      }
      buckets.get(col)!.push(pos);
    }
    for (const bucket of buckets.values()) {
      bucket.sort((a, b) => a.row - b.row);
    }
    return buckets;
  }, [gridLayout]);

  useEffect(() => {
    directionCache.current.clear();
  }, [gridLayout, rowMajor, columnBuckets]);

  const findNearest = useCallback(
    (currentId: string, direction: NavigationDirection): string | null => {
      const cacheKey = `${currentId}:${direction}`;
      if (directionCache.current.has(cacheKey)) {
        return directionCache.current.get(cacheKey) ?? null;
      }

      if (rowMajor.length === 0) return null;

      const current = positionById.get(currentId);
      if (!current) return null;

      let result: string | null = null;

      switch (direction) {
        case "left":
        case "right": {
          const currentIndex = indexById.get(currentId);
          if (currentIndex === undefined) break;

          if (direction === "right") {
            const nextIndex = (currentIndex + 1) % rowMajor.length;
            result = rowMajor[nextIndex].terminalId;
          } else {
            const prevIndex = (currentIndex - 1 + rowMajor.length) % rowMajor.length;
            result = rowMajor[prevIndex].terminalId;
          }
          break;
        }

        case "up":
        case "down": {
          const colBucket = columnBuckets.get(current.col);
          if (!colBucket || colBucket.length === 0) break;

          const currentColIndex = colBucket.findIndex((p) => p.terminalId === currentId);
          if (currentColIndex === -1) break;

          if (direction === "down") {
            const nextIndex = (currentColIndex + 1) % colBucket.length;
            result = colBucket[nextIndex].terminalId;
          } else {
            const prevIndex = (currentColIndex - 1 + colBucket.length) % colBucket.length;
            result = colBucket[prevIndex].terminalId;
          }
          break;
        }
      }

      directionCache.current.set(cacheKey, result);
      return result;
    },
    [rowMajor, indexById, columnBuckets, positionById]
  );

  const findByIndex = useCallback(
    (index: number): string | null => {
      const position = rowMajor[index - 1];
      return position?.terminalId ?? null;
    },
    [rowMajor]
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
