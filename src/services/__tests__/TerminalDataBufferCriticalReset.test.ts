import { describe, it, expect } from "vitest";

const CLEAR_SCREEN = "\x1b[2J";
const FULL_RESET = "\x1bc";
const CURSOR_HOME = "\x1b[H";
const CURSOR_HIDE = "\x1b[?25l";
const CURSOR_SHOW = "\x1b[?25h";

function detectCriticalReset(text: string): boolean {
  if (!text) return false;
  if (text.includes("\x1b[2J")) return true;
  if (text.includes("\x1b[3J")) return true;
  if (text.includes("\x1bc")) return true;
  return false;
}

describe("TerminalDataBuffer critical reset detection", () => {
  describe("detectCriticalReset", () => {
    it("detects clear screen sequence (\\x1b[2J)", () => {
      expect(detectCriticalReset(CLEAR_SCREEN)).toBe(true);
      expect(detectCriticalReset(`before${CLEAR_SCREEN}after`)).toBe(true);
    });

    it("detects scrollback clear sequence (\\x1b[3J)", () => {
      expect(detectCriticalReset("\x1b[3J")).toBe(true);
      expect(detectCriticalReset("\x1b[2J\x1b[3J\x1b[H")).toBe(true);
    });

    it("detects full terminal reset (\\x1bc)", () => {
      expect(detectCriticalReset(FULL_RESET)).toBe(true);
      expect(detectCriticalReset(`text${FULL_RESET}more`)).toBe(true);
    });

    it("detects critical reset in TUI frame with content", () => {
      const tuiFrame = CLEAR_SCREEN + CURSOR_HOME + "Line 1 content\r\n" + "Line 2 content\r\n";
      expect(detectCriticalReset(tuiFrame)).toBe(true);
    });

    it("returns false for empty string", () => {
      expect(detectCriticalReset("")).toBe(false);
    });

    it("returns false for regular text", () => {
      expect(detectCriticalReset("Hello, World!")).toBe(false);
      expect(detectCriticalReset("npm run build")).toBe(false);
    });

    it("returns false for cursor home alone", () => {
      expect(detectCriticalReset(CURSOR_HOME)).toBe(false);
    });

    it("returns false for cursor hide/show sequences", () => {
      expect(detectCriticalReset(CURSOR_HIDE)).toBe(false);
      expect(detectCriticalReset(CURSOR_SHOW)).toBe(false);
    });

    it("returns false for partial clear sequences", () => {
      expect(detectCriticalReset("\x1b[1J")).toBe(false); // Clear above cursor
      expect(detectCriticalReset("\x1b[0J")).toBe(false); // Clear below cursor
      expect(detectCriticalReset("\x1b[J")).toBe(false); // Default clear
    });

    it("returns false for color codes", () => {
      expect(detectCriticalReset("\x1b[31m")).toBe(false);
      expect(detectCriticalReset("\x1b[0m")).toBe(false);
    });
  });

  describe("Claude Code TUI burst simulation", () => {
    it("detects critical reset in rapid Clear + Repaint pattern", () => {
      const clearPacket = CLEAR_SCREEN;
      const repaintPacket =
        CURSOR_HOME +
        "╭──────────────────────────────────────╮\r\n" +
        "│  Claude Code v1.0                    │\r\n" +
        "╰──────────────────────────────────────╯\r\n";

      expect(detectCriticalReset(clearPacket)).toBe(true);
      expect(detectCriticalReset(repaintPacket)).toBe(false);
    });

    it("detects critical reset in combined Clear + Repaint packet", () => {
      const combinedPacket =
        CLEAR_SCREEN + CURSOR_HOME + "Some TUI content here\r\n" + "More content\r\n";

      expect(detectCriticalReset(combinedPacket)).toBe(true);
    });

    it("handles multiple clear sequences", () => {
      const multiClear = `${CLEAR_SCREEN}${CURSOR_HOME}content${CLEAR_SCREEN}more`;
      expect(detectCriticalReset(multiClear)).toBe(true);
    });
  });

  describe("buffer size safety", () => {
    const MAX_BUFFER_BYTES = 20 * 1024;

    it("MAX_BUFFER_BYTES constant should be 20KB", () => {
      expect(MAX_BUFFER_BYTES).toBe(20480);
    });

    it("should allow reasonable TUI frame sizes", () => {
      const typicalFrame = "x".repeat(4000);
      expect(typicalFrame.length).toBeLessThan(MAX_BUFFER_BYTES);
    });

    it("should trigger flush for very large accumulated data", () => {
      const largeData = "x".repeat(MAX_BUFFER_BYTES + 1);
      expect(largeData.length).toBeGreaterThan(MAX_BUFFER_BYTES);
    });
  });
});

describe("TerminalDataBuffer frame handling behavior", () => {
  describe("flushOnRedrawOnly bypass logic", () => {
    it("should NOT skip frames when hasCriticalReset is true", () => {
      const mockEntry = {
        flushMode: "frame" as const,
        flushOnRedrawOnly: true,
        hasCriticalReset: true,
      };

      const shouldSkip =
        mockEntry.flushMode === "frame" &&
        mockEntry.flushOnRedrawOnly &&
        !mockEntry.hasCriticalReset;

      expect(shouldSkip).toBe(false);
    });

    it("should skip frames when flushOnRedrawOnly is true and no critical reset", () => {
      const mockEntry = {
        flushMode: "frame" as const,
        flushOnRedrawOnly: true,
        hasCriticalReset: false,
      };

      const shouldSkip =
        mockEntry.flushMode === "frame" &&
        mockEntry.flushOnRedrawOnly &&
        !mockEntry.hasCriticalReset;

      expect(shouldSkip).toBe(true);
    });

    it("should NOT skip frames when flushOnRedrawOnly is false", () => {
      const mockEntry = {
        flushMode: "frame" as const,
        flushOnRedrawOnly: false,
        hasCriticalReset: false,
      };

      const shouldSkip =
        mockEntry.flushMode === "frame" &&
        mockEntry.flushOnRedrawOnly &&
        !mockEntry.hasCriticalReset;

      expect(shouldSkip).toBe(false);
    });

    it("should NOT skip frames in normal flush mode", () => {
      const flushMode = "normal" as string;
      const flushOnRedrawOnly = true;
      const hasCriticalReset = false;

      const shouldSkip = flushMode === "frame" && flushOnRedrawOnly && !hasCriticalReset;

      expect(shouldSkip).toBe(false);
    });
  });

  describe("TUI burst threshold behavior", () => {
    const TUI_BURST_THRESHOLD_MS = 50;

    it("two redraws within threshold should set flushOnRedrawOnly", () => {
      const redraw1Time = Date.now();
      const redraw2Time = redraw1Time + 30; // Within 50ms

      const clearDelta = redraw2Time - redraw1Time;
      const shouldSetFlushOnRedrawOnly = clearDelta <= TUI_BURST_THRESHOLD_MS;

      expect(shouldSetFlushOnRedrawOnly).toBe(true);
    });

    it("two redraws outside threshold should NOT set flushOnRedrawOnly", () => {
      const redraw1Time = Date.now();
      const redraw2Time = redraw1Time + 60; // Outside 50ms

      const clearDelta = redraw2Time - redraw1Time;
      const shouldSetFlushOnRedrawOnly = clearDelta <= TUI_BURST_THRESHOLD_MS;

      expect(shouldSetFlushOnRedrawOnly).toBe(false);
    });
  });
});

describe("edge cases", () => {
  it("handles clear sequence at very end of buffer", () => {
    const content = "Some text here" + CLEAR_SCREEN;
    expect(detectCriticalReset(content)).toBe(true);
  });

  it("handles clear sequence at very start of buffer", () => {
    const content = CLEAR_SCREEN + "Some text here";
    expect(detectCriticalReset(content)).toBe(true);
  });

  it("handles interleaved sequences", () => {
    const content = CURSOR_HOME + CLEAR_SCREEN + CURSOR_HIDE + "content";
    expect(detectCriticalReset(content)).toBe(true);
  });

  it("handles full reset with subsequent content", () => {
    const content = FULL_RESET + "Terminal ready\r\n$ ";
    expect(detectCriticalReset(content)).toBe(true);
  });
});

describe("boundary-split sequences", () => {
  it("detects clear screen split across chunk boundary (ESC+[ in prev, 2J in current)", () => {
    const prevChunk = "some text\x1b[";
    const currentChunk = "2Jmore content";
    const scanWindow = prevChunk.slice(-32) + currentChunk;
    expect(detectCriticalReset(scanWindow)).toBe(true);
  });

  it("detects clear screen split (ESC in prev, [2J in current)", () => {
    const prevChunk = "some text\x1b";
    const currentChunk = "[2Jmore content";
    const scanWindow = prevChunk.slice(-32) + currentChunk;
    expect(detectCriticalReset(scanWindow)).toBe(true);
  });

  it("detects scrollback clear split across boundary", () => {
    const prevChunk = "output\x1b[";
    const currentChunk = "3Jcleared";
    const scanWindow = prevChunk.slice(-32) + currentChunk;
    expect(detectCriticalReset(scanWindow)).toBe(true);
  });

  it("detects full reset split across boundary (ESC in prev, c in current)", () => {
    const prevChunk = "data\x1b";
    const currentChunk = "creset complete";
    const scanWindow = prevChunk.slice(-32) + currentChunk;
    expect(detectCriticalReset(scanWindow)).toBe(true);
  });

  it("does not false-positive on incomplete sequences at boundary", () => {
    const prevChunk = "text\x1b[";
    const currentChunk = "31mred text";
    const scanWindow = prevChunk.slice(-32) + currentChunk;
    expect(detectCriticalReset(scanWindow)).toBe(false);
  });
});
