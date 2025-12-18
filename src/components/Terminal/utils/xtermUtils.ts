import { Terminal } from "@xterm/xterm";

export interface XtermVisualMetrics {
  cellW: number;
  cellH: number;
  screenW: number;
  screenH: number;
  cols: number;
  rows: number;
}

/**
 * Read xterm's actual cell dimensions from its internal renderer.
 * Falls back to measuring the screen element if internals unavailable.
 */
export function readXtermVisualMetrics(term: Terminal): XtermVisualMetrics | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const core = (term as any)?._core;
  const dims = core?._renderService?.dimensions;

  // Try known internal dimension shapes (varies by xterm version)
  const cssCellW = dims?.css?.cell?.width ?? dims?.actualCellWidth ?? dims?.cell?.width;
  const cssCellH = dims?.css?.cell?.height ?? dims?.actualCellHeight ?? dims?.cell?.height;

  // Fallback: measure screen element and divide by cols/rows
  const screenEl = term.element?.querySelector(".xterm-screen") as HTMLElement | null;
  if (!screenEl) return null;

  const rect = screenEl.getBoundingClientRect();
  const cols = term.cols || 0;
  const rows = term.rows || 0;
  if (rect.width <= 0 || rect.height <= 0 || cols <= 0 || rows <= 0) return null;

  const screenW = rect.width;
  const screenH = rect.height;

  const cellW = typeof cssCellW === "number" && cssCellW > 0 ? cssCellW : screenW / cols;
  const cellH = typeof cssCellH === "number" && cssCellH > 0 ? cssCellH : screenH / rows;

  return { cellW, cellH, screenW, screenH, cols, rows };
}

/**
 * Convert wheel deltaY to pixels, handling different deltaMode values.
 */
export function wheelDeltaToPx(e: WheelEvent, cellH: number, pageH: number): number {
  if (e.deltaMode === 1) return e.deltaY * cellH; // DOM_DELTA_LINE
  if (e.deltaMode === 2) return e.deltaY * pageH; // DOM_DELTA_PAGE
  return e.deltaY; // DOM_DELTA_PIXEL
}
