import { Terminal } from "@xterm/xterm";

// Tall canvas configuration for agent terminals
// This creates a fixed-height "screen" that the browser scrolls natively
// Using 600 rows as default - safe for most DPI/font combinations
// (600 rows * 25px font * 2x DPI = 30,000px, under the ~32k canvas limit)
export const TALL_CANVAS_ROWS = 600;

// Maximum canvas height in pixels (conservative limit - most browsers support ~32k)
const MAX_CANVAS_HEIGHT_PX = 16384;

/**
 * Calculate safe row count for tall canvas mode based on device pixel ratio.
 * Prevents canvas height from exceeding browser limits on high-DPI displays.
 */
export function getSafeTallCanvasRows(cellHeight: number): number {
  const dpr = window.devicePixelRatio || 1;
  const maxRows = Math.floor(MAX_CANVAS_HEIGHT_PX / (dpr * cellHeight));
  return Math.min(TALL_CANVAS_ROWS, maxRows);
}

/**
 * Measure cell height from terminal's render dimensions.
 * Falls back to fontSize-based estimate if internal API unavailable.
 */
export function measureCellHeight(terminal: Terminal): number {
  // @ts-expect-error - internal xterm API
  const cellHeight = terminal._core?._renderService?.dimensions?.css?.cell?.height;
  if (cellHeight && cellHeight > 0) return cellHeight;
  // Fallback: estimate from fontSize
  const fontSize = terminal.options.fontSize ?? 14;
  return fontSize * 1.1 + 2;
}
