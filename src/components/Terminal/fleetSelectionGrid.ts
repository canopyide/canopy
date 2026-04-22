/**
 * Grid geometry helpers for fleet shift-click range extension.
 *
 * A terminal pane grid is a CSS grid, so visual rows are not an explicit
 * data structure — we recover them by reading `[data-panel-id]` bounding
 * rects and clustering panes whose top edges agree within a threshold.
 * This lets shift-click extend select a 2-D rectangle (min col..max col ×
 * min row..max row) rather than a 1-D DOM-order "snake" that surprises
 * users when the grid wraps.
 */

export interface PaneCoord {
  id: string;
  col: number;
  row: number;
}

interface RectEntry {
  id: string;
  rect: DOMRect;
}

/**
 * Rows are considered the same when their top edges differ by less than the
 * row tolerance. 20px is larger than any realistic sub-pixel drift yet
 * smaller than any pane we'd ever render, so adjacent grid rows are cleanly
 * separated.
 */
const ROW_CLUSTER_TOLERANCE_PX = 20;

/**
 * Walk every `[data-panel-id]` inside `container`, keep the ones in
 * `eligibleIds`, cluster by row via bounding rect, and return (col, row)
 * grid coordinates. Coordinates are only stable for the current layout —
 * callers should recompute on each click rather than caching.
 */
export function readEligiblePaneCoords(
  container: HTMLElement,
  eligibleIds: ReadonlySet<string>
): PaneCoord[] {
  const entries: RectEntry[] = [];
  const panes = container.querySelectorAll<HTMLElement>("[data-panel-id]");
  for (const el of panes) {
    const id = el.dataset.panelId;
    if (!id || !eligibleIds.has(id)) continue;
    entries.push({ id, rect: el.getBoundingClientRect() });
  }
  if (entries.length === 0) return [];

  entries.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

  const rows: RectEntry[][] = [];
  for (const entry of entries) {
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(lastRow[0]!.rect.top - entry.rect.top) < ROW_CLUSTER_TOLERANCE_PX) {
      lastRow.push(entry);
    } else {
      rows.push([entry]);
    }
  }

  const coords: PaneCoord[] = [];
  rows.forEach((row, rowIdx) => {
    row.sort((a, b) => a.rect.left - b.rect.left);
    row.forEach((entry, colIdx) => {
      coords.push({ id: entry.id, col: colIdx, row: rowIdx });
    });
  });
  return coords;
}

/**
 * Given a coord list and two endpoint ids, return every id whose (col, row)
 * falls inside the rectangle spanned by the endpoints. Order of anchor vs
 * target doesn't matter — the rect is always min..max in both axes.
 */
export function collectBoundingBoxIds(
  coords: ReadonlyArray<PaneCoord>,
  anchorId: string,
  targetId: string
): string[] {
  const anchor = coords.find((c) => c.id === anchorId);
  const target = coords.find((c) => c.id === targetId);
  if (!anchor || !target) return [];

  const minCol = Math.min(anchor.col, target.col);
  const maxCol = Math.max(anchor.col, target.col);
  const minRow = Math.min(anchor.row, target.row);
  const maxRow = Math.max(anchor.row, target.row);

  const out: string[] = [];
  for (const c of coords) {
    if (c.col >= minCol && c.col <= maxCol && c.row >= minRow && c.row <= maxRow) {
      out.push(c.id);
    }
  }
  return out;
}
