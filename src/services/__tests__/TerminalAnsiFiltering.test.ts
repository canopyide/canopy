import { describe, it, expect } from "vitest";

// Extracted from TerminalInstanceService.ts for isolated testing
// This ensures the regex logic is correct without needing to mock the entire browser environment
// or deal with xterm.js dependencies in the test runner.
function filterProblematicSequences(data: string): string {
  let filtered = data;

  /* eslint-disable no-control-regex */
  // Strip Mouse Tracking (?1000h - ?1006h)
  filtered = filtered.replace(/\u001b\[\?100[0-6][hl]/g, "");

  // Strip Alternate Screen Buffer (?1049h/l, ?47h/l)
  filtered = filtered.replace(/\u001b\[\?1049[hl]/g, "");
  filtered = filtered.replace(/\u001b\[\?47[hl]/g, "");

  // Strip Scrollback Clear (3J)
  filtered = filtered.replace(/\u001b\[3J/g, "");
  /* eslint-enable no-control-regex */

  return filtered;
}

describe("Terminal ANSI Filtering Logic", () => {
  it("strips mouse tracking sequences", () => {
    const input = "Hello\u001b[?1000hWorld\u001b[?1006h";
    expect(filterProblematicSequences(input)).toBe("HelloWorld");
  });

  it("strips alternate screen buffer sequences", () => {
    const input = "Start\u001b[?1049hApp\u001b[?1049lEnd";
    expect(filterProblematicSequences(input)).toBe("StartAppEnd");
  });

  it("strips scrollback clear (3J)", () => {
    const input = "Clear\u001b[3JUp";
    expect(filterProblematicSequences(input)).toBe("ClearUp");
  });

  it("preserves other ANSI sequences (colors, cursor moves)", () => {
    const input = "\u001b[31mRed\u001b[0m\u001b[H";
    expect(filterProblematicSequences(input)).toBe(input);
  });

  it("handles mixed sequences", () => {
    // \u001b[3J (strip) + \u001b[H (keep) + \u001b[?1000h (strip)
    const input = "\u001b[3J\u001b[H\u001b[?1000hContent";
    expect(filterProblematicSequences(input)).toBe("\u001b[HContent");
  });

  it("strips multiple occurrences", () => {
    const input = "\u001b[?1000hStart\u001b[?1000lEnd";
    expect(filterProblematicSequences(input)).toBe("StartEnd");
  });
});
