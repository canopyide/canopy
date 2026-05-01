import { describe, it, expect } from "vitest";
import { stripIdleTerminalSequences } from "../IdleSequenceFilter.js";

describe("stripIdleTerminalSequences", () => {
  it("returns plain text unchanged", () => {
    expect(stripIdleTerminalSequences("hello world")).toBe("hello world");
  });

  it("strips DECSET cursor hide/show", () => {
    expect(stripIdleTerminalSequences("\x1b[?25l\x1b[?25h")).toBe("");
  });

  it("strips DECSET focus event toggles", () => {
    expect(stripIdleTerminalSequences("\x1b[?1004h\x1b[?1004l")).toBe("");
  });

  it("strips DECSET bracketed-paste mode toggles", () => {
    expect(stripIdleTerminalSequences("\x1b[?2004h\x1b[?2004l")).toBe("");
  });

  it("strips DECSET sync-update toggles", () => {
    expect(stripIdleTerminalSequences("\x1b[?2026h\x1b[?2026l")).toBe("");
  });

  it("strips DECSET alt-screen toggles", () => {
    expect(stripIdleTerminalSequences("\x1b[?1049h\x1b[?1049l")).toBe("");
  });

  it("strips OSC 0 set-window-title", () => {
    expect(stripIdleTerminalSequences("\x1b]0;Window Title\x07")).toBe("");
  });

  it("strips OSC 1 set-icon-name", () => {
    expect(stripIdleTerminalSequences("\x1b]1;Icon\x07")).toBe("");
  });

  it("strips OSC 2 set-window-title-only", () => {
    expect(stripIdleTerminalSequences("\x1b]2;Claude — Working\x07")).toBe("");
  });

  it("strips OSC 7 set-cwd", () => {
    expect(stripIdleTerminalSequences("\x1b]7;file:///tmp\x07")).toBe("");
  });

  it("strips OSC 8 hyperlink", () => {
    expect(stripIdleTerminalSequences("\x1b]8;;https://example.com\x07")).toBe("");
  });

  it("strips OSC 9 taskbar progress", () => {
    expect(stripIdleTerminalSequences("\x1b]9;4;1;50\x07")).toBe("");
  });

  it("strips OSC 133 shell integration", () => {
    expect(stripIdleTerminalSequences("\x1b]133;A\x07\x1b]133;B\x07")).toBe("");
  });

  it("strips OSC 633 VS Code shell integration", () => {
    expect(stripIdleTerminalSequences("\x1b]633;P;Cwd=/foo\x07")).toBe("");
  });

  it("strips OSC terminated by ST (ESC \\)", () => {
    expect(stripIdleTerminalSequences("\x1b]0;Title\x1b\\")).toBe("");
  });

  it("strips CPR cursor-position responses", () => {
    expect(stripIdleTerminalSequences("\x1b[24;80R")).toBe("");
    expect(stripIdleTerminalSequences("\x1b[1;1R")).toBe("");
  });

  it("strips DSR cursor-position queries", () => {
    expect(stripIdleTerminalSequences("\x1b[6n")).toBe("");
  });

  it("strips bracketed-paste markers", () => {
    expect(stripIdleTerminalSequences("\x1b[200~\x1b[201~")).toBe("");
  });

  it("preserves spinner frames (CR + braille + text)", () => {
    expect(stripIdleTerminalSequences("\r⠋ Thinking…")).toBe("\r⠋ Thinking…");
  });

  it("preserves erase-line sequences (cosmetic, not idle-noise)", () => {
    expect(stripIdleTerminalSequences("\x1b[2K\r⠋")).toBe("\x1b[2K\r⠋");
  });

  it("preserves SGR color sequences", () => {
    expect(stripIdleTerminalSequences("\x1b[31mred\x1b[0m")).toBe("\x1b[31mred\x1b[0m");
  });

  it("strips noise but keeps wrapped content", () => {
    const input = "\x1b[?25l\rThinking…\x1b[?25h";
    expect(stripIdleTerminalSequences(input)).toBe("\rThinking…");
  });

  it("strips OSC payloads up to 512 chars", () => {
    const payload = "x".repeat(512);
    expect(stripIdleTerminalSequences(`\x1b]7;${payload}\x07`)).toBe("");
  });

  it("does not hang on unterminated OSC sequence", () => {
    const start = performance.now();
    const input = `\x1b]7;${"x".repeat(2000)}`;
    const out = stripIdleTerminalSequences(input);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
    expect(out).toBe(input);
  });

  it("does not hang on OSC payload exceeding 512 chars", () => {
    const start = performance.now();
    const payload = "x".repeat(2000);
    const input = `\x1b]7;${payload}\x07`;
    const out = stripIdleTerminalSequences(input);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
    expect(out).toBe(input);
  });

  it("strips multiple noise types interleaved with content", () => {
    const input = "\x1b[?25l\x1b]133;A\x07hello\x1b[24;80R world\x1b[?25h";
    expect(stripIdleTerminalSequences(input)).toBe("hello world");
  });

  it("does not strip 4-digit CPR-shaped numbers in plain text", () => {
    expect(stripIdleTerminalSequences("price: $1234")).toBe("price: $1234");
  });
});
