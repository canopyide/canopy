import { Terminal } from "@xterm/xterm";
import { SerializeAddon } from "@xterm/addon-serialize";
import { convertAnsiLinesToHtml, escapeHtml } from "./htmlUtils";

// Configuration
export const HISTORY_JUMP_BACK_PERSIST_MS = 100;
export const HISTORY_JUMP_BACK_PERSIST_FRAMES = 2;

export interface HistoryState {
  lines: string[]; // Plain text lines (for comparison)
  htmlLines: string[]; // HTML-rendered lines with colors (for display)
  windowStart: number; // Buffer line index where lines[0] came from
  windowEnd: number; // Buffer line index after last line
  takenAt: number;
}

/**
 * Extract snapshot from xterm buffer.
 * Returns the last maxLines lines from the buffer with both plain text and HTML.
 * Uses line-by-line serialization to respect xterm's column-based wrapping.
 * @param skipBottomLines - Number of lines to skip from the bottom (for seamless transition)
 */
export function extractSnapshot(
  term: Terminal,
  serializeAddon: SerializeAddon | null,
  maxLines: number,
  skipBottomLines: number = 0
): HistoryState {
  const buffer = term.buffer.active;
  const total = buffer.length;
  const cols = term.cols;

  // Calculate effective end (skip bottom lines for seamless history entry)
  const effectiveEnd = Math.max(0, total - skipBottomLines);
  const count = Math.min(maxLines, effectiveEnd);
  const start = Math.max(0, effectiveEnd - count);

  // Get plain text lines for comparison
  const lines: string[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const line = buffer.getLine(start + i);
    lines[i] = line ? line.translateToString(true, 0, cols) : "";
  }

  // Get ANSI-encoded content and convert to HTML
  // IMPORTANT: Serialize each buffer line individually to respect xterm's wrapping.
  // The buffer already wraps long content at `cols` characters, so each buffer line
  // is one visual row. Serializing the whole buffer doesn't preserve this wrapping.
  let htmlLines: string[];
  if (serializeAddon) {
    try {
      const ansiLines: string[] = new Array(count);
      for (let i = 0; i < count; i++) {
        const lineIdx = start + i;
        // Serialize just this one line using range option

        const serialized = serializeAddon.serialize({
          range: { start: lineIdx, end: lineIdx },
          excludeAltBuffer: true,
          excludeModes: true,
        } as any);
        // Remove trailing newline if present (single line shouldn't have one)
        ansiLines[i] = serialized.replace(/\n$/, "");
      }
      htmlLines = convertAnsiLinesToHtml(ansiLines);
    } catch {
      // Fallback to plain text if serialization fails
      htmlLines = lines.map((l) => escapeHtml(l) || " ");
    }
  } else {
    htmlLines = lines.map((l) => escapeHtml(l) || " ");
  }

  return {
    lines,
    htmlLines,
    windowStart: start,
    windowEnd: effectiveEnd,
    takenAt: performance.now(),
  };
}

/**
 * Compute how many lines were trimmed from the top.
 * Primary method: compare windowStart indices.
 * Fallback: overlap-based detection when windowStart is unreliable.
 */
export function computeTrimmedTopCount(oldState: HistoryState | null, newState: HistoryState): number {
  if (!oldState) return 0;

  // Primary: use window start difference
  const primaryTrimmed = Math.max(0, newState.windowStart - oldState.windowStart);
  if (primaryTrimmed > 0) return primaryTrimmed;

  // Fallback: overlap-based detection for when xterm buffer is saturated
  // (buffer.length stays constant but content shifts)
  const oldLines = oldState.lines;
  const newLines = newState.lines;

  if (oldLines.length === 0 || newLines.length === 0) return 0;

  // Try to find where old content appears in new content
  const probeLen = Math.min(20, oldLines.length, newLines.length);
  const maxShift = Math.min(500, oldLines.length - probeLen);

  // Take probe from near the end of old lines (more likely to still exist)
  const probeStart = Math.max(0, oldLines.length - probeLen - 50);
  const probe = oldLines.slice(probeStart, probeStart + probeLen);

  // Search for this probe in newLines
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

/**
 * Check if we should accept a new snapshot based on settle logic.
 * Avoids capturing mid-redraw "broken frames".
 */
export function shouldAcceptSnapshot(
  now: number,
  lastOutputAt: number,
  oldLines: string[],
  newLines: string[],
  settleMs: number
): boolean {
  // If enough time has passed since last output, always accept
  if (now - lastOutputAt >= settleMs) return true;

  // During active output, check if the diff is "small enough"
  // Large diffs during settle window likely indicate transient redraw
  const checkCount = Math.min(40, oldLines.length, newLines.length);
  let changedLines = 0;

  for (let i = 1; i <= checkCount; i++) {
    const oldIdx = oldLines.length - i;
    const newIdx = newLines.length - i;
    if (oldIdx < 0 || newIdx < 0) break;

    if (oldLines[oldIdx] !== newLines[newIdx]) {
      changedLines++;
      if (changedLines > 5) return false; // Too many changes, skip this tick
    }
  }

  return true;
}

/**
 * Check if a backward window move should be accepted (persistence check).
 * Returns { accept: boolean, updatePending: boolean } where updatePending
 * indicates whether the pending state was updated.
 */
export function checkJumpBackPersistence(
  newWindowStart: number,
  lastAcceptedWindowStart: number | null,
  pendingJumpBack: { windowStart: number; firstSeenAt: number; stableFrames: number } | null,
  now: number
): {
  accept: boolean;
  newPendingState: { windowStart: number; firstSeenAt: number; stableFrames: number } | null;
} {
  // No previous accepted position - accept immediately
  if (lastAcceptedWindowStart === null) {
    return { accept: true, newPendingState: null };
  }

  // Forward or same position - accept immediately, clear pending
  if (newWindowStart >= lastAcceptedWindowStart) {
    return { accept: true, newPendingState: null };
  }

  // Backward position - apply persistence check
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

  // Check if persistence criteria met
  const elapsed = now - newPending.firstSeenAt;
  const shouldAccept = 
    elapsed >= HISTORY_JUMP_BACK_PERSIST_MS ||
    newPending.stableFrames >= HISTORY_JUMP_BACK_PERSIST_FRAMES;

  if (shouldAccept) {
    return { accept: true, newPendingState: null };
  }

  // Not yet persistent - reject but update pending state
  return { accept: false, newPendingState: newPending };
}
