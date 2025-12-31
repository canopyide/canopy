import type { Terminal, IBufferLine, IBufferCell } from "@xterm/xterm";
import type { SerializeAddon } from "@xterm/addon-serialize";
import { escapeHtml, linkifyHtml } from "./htmlUtils";

export const HISTORY_JUMP_BACK_PERSIST_MS = 100;
export const HISTORY_JUMP_BACK_PERSIST_FRAMES = 2;

export interface HistoryState {
  lines: string[];
  htmlLines: string[];
  rowBackgrounds: (string | null)[];
  windowStart: number;
  windowEnd: number;
  takenAt: number;
}

// Standard ANSI 256-color palette (colors 0-255)
// Colors 0-15 are the standard colors, 16-231 are the 6x6x6 color cube, 232-255 are grayscale
const ANSI_COLORS: string[] = [
  // Standard colors (0-7)
  "#000000",
  "#cd0000",
  "#00cd00",
  "#cdcd00",
  "#0000ee",
  "#cd00cd",
  "#00cdcd",
  "#e5e5e5",
  // Bright colors (8-15)
  "#7f7f7f",
  "#ff0000",
  "#00ff00",
  "#ffff00",
  "#5c5cff",
  "#ff00ff",
  "#00ffff",
  "#ffffff",
];

// Generate 6x6x6 color cube (colors 16-231)
for (let r = 0; r < 6; r++) {
  for (let g = 0; g < 6; g++) {
    for (let b = 0; b < 6; b++) {
      const ri = r ? r * 40 + 55 : 0;
      const gi = g ? g * 40 + 55 : 0;
      const bi = b ? b * 40 + 55 : 0;
      ANSI_COLORS.push(
        `#${ri.toString(16).padStart(2, "0")}${gi.toString(16).padStart(2, "0")}${bi.toString(16).padStart(2, "0")}`
      );
    }
  }
}

// Generate grayscale (colors 232-255)
for (let i = 0; i < 24; i++) {
  const v = i * 10 + 8;
  ANSI_COLORS.push(`#${v.toString(16).padStart(2, "0").repeat(3)}`);
}

interface CellStyle {
  fg: string | null;
  bg: string | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  dim: boolean;
}

function getCellStyle(cell: IBufferCell): CellStyle {
  let fg: string | null = null;
  let bg: string | null = null;

  // Get foreground color
  if (cell.isFgRGB()) {
    const color = cell.getFgColor();
    fg = `#${color.toString(16).padStart(6, "0")}`;
  } else if (cell.isFgPalette()) {
    const idx = cell.getFgColor();
    fg = ANSI_COLORS[idx] ?? null;
  }

  // Get background color
  if (cell.isBgRGB()) {
    const color = cell.getBgColor();
    bg = `#${color.toString(16).padStart(6, "0")}`;
  } else if (cell.isBgPalette()) {
    const idx = cell.getBgColor();
    bg = ANSI_COLORS[idx] ?? null;
  }

  return {
    fg,
    bg,
    bold: cell.isBold() !== 0,
    italic: cell.isItalic() !== 0,
    underline: cell.isUnderline() !== 0,
    strikethrough: cell.isStrikethrough() !== 0,
    dim: cell.isDim() !== 0,
  };
}

function stylesEqual(a: CellStyle, b: CellStyle): boolean {
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough &&
    a.dim === b.dim
  );
}

function styleToInlineCss(style: CellStyle): string {
  const parts: string[] = [];

  if (style.fg) {
    parts.push(`color:${style.fg}`);
  }
  if (style.bg) {
    parts.push(`background-color:${style.bg}`);
  }
  if (style.bold) {
    parts.push("font-weight:bold");
  }
  if (style.italic) {
    parts.push("font-style:italic");
  }
  if (style.dim) {
    parts.push("opacity:0.5");
  }

  const decorations: string[] = [];
  if (style.underline) decorations.push("underline");
  if (style.strikethrough) decorations.push("line-through");
  if (decorations.length > 0) {
    parts.push(`text-decoration:${decorations.join(" ")}`);
  }

  return parts.join(";");
}

function isEmptyStyle(style: CellStyle): boolean {
  return (
    style.fg === null &&
    style.bg === null &&
    !style.bold &&
    !style.italic &&
    !style.underline &&
    !style.strikethrough &&
    !style.dim
  );
}

/**
 * Convert a buffer line to safe HTML by iterating through cells.
 * Also extracts the dominant background color for the line.
 * 
 * This approach is fundamentally safer than parsing serializeAsHTML because:
 * 1. We never parse HTML - we only generate it from known-safe primitives
 * 2. All text content is escaped before being put into HTML
 * 3. We only generate the tags we want (spans with inline styles)
 */
export function lineToHtml(
  line: IBufferLine,
  cols: number,
  nullCell: IBufferCell
): { html: string; background: string | null } {
  const result: string[] = [];
  let currentText = "";
  let currentStyle: CellStyle = {
    fg: null,
    bg: null,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    dim: false,
  };

  // Background statistics
  const bgCounts = new Map<string, number>();
  let totalTextLength = 0;

  const flushSpan = () => {
    if (currentText.length === 0) return;

    const escapedText = escapeHtml(currentText);
    if (isEmptyStyle(currentStyle)) {
      result.push(escapedText);
    } else {
      const css = styleToInlineCss(currentStyle);
      result.push(`<span style="${css}">${escapedText}</span>`);
    }
    currentText = "";
  };

  for (let x = 0; x < cols; x++) {
    const cell = line.getCell(x, nullCell);
    if (!cell) continue;

    const width = cell.getWidth();
    if (width === 0) continue; // Skip continuation cells for wide characters

    const chars = cell.getChars() || " ";
    const cellStyle = getCellStyle(cell);

    // Update background stats
    const charLen = chars.length;
    totalTextLength += charLen;
    if (cellStyle.bg) {
      bgCounts.set(cellStyle.bg, (bgCounts.get(cellStyle.bg) ?? 0) + charLen);
    }

    if (!stylesEqual(cellStyle, currentStyle)) {
      flushSpan();
      currentStyle = cellStyle;
    }

    currentText += chars;
  }

  flushSpan();

  // Calculate dominant background
  let dominantBg: string | null = null;
  let maxCount = 0;
  for (const [bg, count] of bgCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantBg = bg;
    }
  }

  // Only return a background if it covers at least 20% of the row's text
  if (dominantBg && maxCount < totalTextLength * 0.2) {
    dominantBg = null;
  }

  // Trim trailing whitespace from the result
  const html = result.join("");
  return {
    html: html.trimEnd() || " ",
    background: dominantBg,
  };
}

/**
 * Extract HTML lines and background colors directly from xterm buffer by iterating cells.
 * This is safer than serializeAsHTML because we control exactly what HTML is generated.
 */
function extractHtmlLinesFromBuffer(
  term: Terminal,
  start: number,
  count: number
): { htmlLines: string[]; rowBackgrounds: (string | null)[] } {
  const buffer = term.buffer.active;
  const cols = term.cols;
  const nullCell = buffer.getNullCell();
  const htmlLines: string[] = new Array(count);
  const rowBackgrounds: (string | null)[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const line = buffer.getLine(start + i);
    if (line) {
      const { html, background } = lineToHtml(line, cols, nullCell);
      htmlLines[i] = linkifyHtml(html);
      rowBackgrounds[i] = background;
    } else {
      htmlLines[i] = " ";
      rowBackgrounds[i] = null;
    }
  }

  return { htmlLines, rowBackgrounds };
}

export function extractSnapshot(
  term: Terminal,
  _serializeAddon: SerializeAddon | null,
  maxLines: number,
  skipBottomLines: number = 0
): HistoryState {
  const buffer = term.buffer.active;
  const total = buffer.length;
  const cols = term.cols;

  const effectiveEnd = Math.max(0, total - skipBottomLines);
  const count = Math.min(maxLines, effectiveEnd);
  const start = Math.max(0, effectiveEnd - count);

  // Extract plain text lines for diff comparison
  const lines: string[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const line = buffer.getLine(start + i);
    lines[i] = line ? line.translateToString(true, 0, cols) : "";
  }

  // Extract HTML lines directly from buffer cells
  let htmlLines: string[];
  let rowBackgrounds: (string | null)[];

  try {
    const result = extractHtmlLinesFromBuffer(term, start, count);
    htmlLines = result.htmlLines;
    rowBackgrounds = result.rowBackgrounds;
  } catch {
    // Fallback to plain text with escaping
    htmlLines = lines.map((l) => escapeHtml(l) || " ");
    rowBackgrounds = lines.map(() => null);
  }

  return {
    lines,
    htmlLines,
    rowBackgrounds,
    windowStart: start,
    windowEnd: effectiveEnd,
    takenAt: performance.now(),
  };
}

export function computeTrimmedTopCount(
  oldState: HistoryState | null,
  newState: HistoryState
): number {
  if (!oldState) return 0;

  const primaryTrimmed = Math.max(0, newState.windowStart - oldState.windowStart);
  if (primaryTrimmed > 0) return primaryTrimmed;

  const oldLines = oldState.lines;
  const newLines = newState.lines;

  if (oldLines.length === 0 || newLines.length === 0) return 0;

  const probeLen = Math.min(20, oldLines.length, newLines.length);
  const maxShift = Math.min(500, oldLines.length - probeLen);

  const probeStart = Math.max(0, oldLines.length - probeLen - 50);
  const probe = oldLines.slice(probeStart, probeStart + probeLen);

  for (let shift = 0; shift <= maxShift; shift++) {
    const searchIdx = probeStart - shift;
    if (searchIdx < 0) break;

    let match = true;
    for (let i = 0; i < probeLen && searchIdx + i < newLines.length; i++) {
      if (newLines[searchIdx + i] !== probe[i]) {
        match = false;
        break;
      }
    }
    if (match) return shift;
  }

  return 0;
}

export function shouldAcceptSnapshot(
  now: number,
  lastOutputAt: number,
  oldLines: string[],
  newLines: string[],
  settleMs: number
): boolean {
  if (now - lastOutputAt >= settleMs) return true;

  const checkCount = Math.min(40, oldLines.length, newLines.length);
  let changedLines = 0;

  for (let i = 1; i <= checkCount; i++) {
    const oldIdx = oldLines.length - i;
    const newIdx = newLines.length - i;
    if (oldIdx < 0 || newIdx < 0) break;

    if (oldLines[oldIdx] !== newLines[newIdx]) {
      changedLines++;
      if (changedLines > 5) return false;
    }
  }

  return true;
}

export function checkJumpBackPersistence(
  newWindowStart: number,
  lastAcceptedWindowStart: number | null,
  pendingJumpBack: { windowStart: number; firstSeenAt: number; stableFrames: number } | null,
  now: number
): {
  accept: boolean;
  newPendingState: { windowStart: number; firstSeenAt: number; stableFrames: number } | null;
} {
  if (lastAcceptedWindowStart === null) {
    return { accept: true, newPendingState: null };
  }

  if (newWindowStart >= lastAcceptedWindowStart) {
    return { accept: true, newPendingState: null };
  }

  const sameCandidate = pendingJumpBack && pendingJumpBack.windowStart === newWindowStart;

  let newPending: { windowStart: number; firstSeenAt: number; stableFrames: number };
  if (sameCandidate) {
    newPending = {
      ...pendingJumpBack,
      stableFrames: pendingJumpBack.stableFrames + 1,
    };
  } else {
    newPending = {
      windowStart: newWindowStart,
      firstSeenAt: now,
      stableFrames: 1,
    };
  }

  const elapsed = now - newPending.firstSeenAt;
  const shouldAccept =
    elapsed >= HISTORY_JUMP_BACK_PERSIST_MS ||
    newPending.stableFrames >= HISTORY_JUMP_BACK_PERSIST_FRAMES;

  if (shouldAccept) {
    return { accept: true, newPendingState: null };
  }

  return { accept: false, newPendingState: newPending };
}