import { describe, it, expect, beforeEach } from "vitest";
import { InputTracker, CLEAR_COMMANDS } from "../clearCommandDetection";

describe("InputTracker", () => {
  let tracker: InputTracker;

  beforeEach(() => {
    tracker = new InputTracker();
  });

  describe("clear command detection", () => {
    it("detects /clear command", () => {
      expect(tracker.process("/")).toBe(false);
      expect(tracker.process("c")).toBe(false);
      expect(tracker.process("l")).toBe(false);
      expect(tracker.process("e")).toBe(false);
      expect(tracker.process("a")).toBe(false);
      expect(tracker.process("r")).toBe(false);
      expect(tracker.process("\r")).toBe(true);
    });

    it("detects /new command", () => {
      "/new".split("").forEach((c) => expect(tracker.process(c)).toBe(false));
      expect(tracker.process("\r")).toBe(true);
    });

    it("detects /reset command", () => {
      "/reset".split("").forEach((c) => expect(tracker.process(c)).toBe(false));
      expect(tracker.process("\r")).toBe(true);
    });

    it("detects standard clear command", () => {
      "clear".split("").forEach((c) => expect(tracker.process(c)).toBe(false));
      expect(tracker.process("\r")).toBe(true);
    });

    it("detects cls command", () => {
      "cls".split("").forEach((c) => expect(tracker.process(c)).toBe(false));
      expect(tracker.process("\r")).toBe(true);
    });

    it("triggers on LF as well as CR", () => {
      "/clear".split("").forEach((c) => tracker.process(c));
      expect(tracker.process("\n")).toBe(true);
    });
  });

  describe("backspace handling", () => {
    it("handles backspace correctly", () => {
      tracker.process("/");
      tracker.process("c");
      tracker.process("\x7f"); // Backspace
      tracker.process("n");
      tracker.process("e");
      tracker.process("w");
      expect(tracker.process("\r")).toBe(true); // Now reads "/new"
    });

    it("handles multiple backspaces", () => {
      "/clearXXX".split("").forEach((c) => tracker.process(c));
      tracker.process("\x7f");
      tracker.process("\x7f");
      tracker.process("\x7f");
      expect(tracker.process("\r")).toBe(true); // Back to "/clear"
    });

    it("handles backspace on empty buffer", () => {
      tracker.process("\x7f");
      expect(tracker.process("\r")).toBe(false);
    });
  });

  describe("control character handling", () => {
    it("resets buffer on Ctrl+C", () => {
      "/cle".split("").forEach((c) => tracker.process(c));
      tracker.process("\x03"); // Ctrl+C
      expect(tracker.process("\r")).toBe(false);
    });

    it("resets buffer on Ctrl+D", () => {
      "/clear".split("").forEach((c) => tracker.process(c));
      tracker.process("\x04"); // Ctrl+D
      expect(tracker.process("\r")).toBe(false);
    });

    it("resets buffer on Escape", () => {
      "/new".split("").forEach((c) => tracker.process(c));
      tracker.process("\x1b"); // Escape
      expect(tracker.process("\r")).toBe(false);
    });
  });

  describe("false positive prevention", () => {
    it("ignores partial matches like /clear-cache", () => {
      "/clear-cache".split("").forEach((c) => tracker.process(c));
      expect(tracker.process("\r")).toBe(false);
    });

    it("ignores commands with extra text", () => {
      "/clear something".split("").forEach((c) => tracker.process(c));
      expect(tracker.process("\r")).toBe(false);
    });

    it("ignores non-command input", () => {
      "echo hello".split("").forEach((c) => tracker.process(c));
      expect(tracker.process("\r")).toBe(false);
    });

    it("ignores empty input", () => {
      expect(tracker.process("\r")).toBe(false);
    });
  });

  describe("whitespace handling", () => {
    it("trims leading spaces", () => {
      "  /clear".split("").forEach((c) => tracker.process(c));
      expect(tracker.process("\r")).toBe(true);
    });

    it("trims trailing spaces", () => {
      "/clear  ".split("").forEach((c) => tracker.process(c));
      expect(tracker.process("\r")).toBe(true);
    });
  });

  describe("buffer reset after Enter", () => {
    it("resets buffer after successful clear command", () => {
      "/clear".split("").forEach((c) => tracker.process(c));
      expect(tracker.process("\r")).toBe(true);
      // Should be fresh for next command
      "/new".split("").forEach((c) => tracker.process(c));
      expect(tracker.process("\r")).toBe(true);
    });

    it("resets buffer after non-clear command", () => {
      "ls -la".split("").forEach((c) => tracker.process(c));
      expect(tracker.process("\r")).toBe(false);
      // Should be fresh for next command
      "/clear".split("").forEach((c) => tracker.process(c));
      expect(tracker.process("\r")).toBe(true);
    });
  });

  describe("multi-char chunks and paste operations", () => {
    it("detects clear command in pasted text with LF", () => {
      expect(tracker.process("/clear\n")).toBe(true);
    });

    it("detects clear command in pasted text with CR", () => {
      expect(tracker.process("/clear\r")).toBe(true);
    });

    it("detects clear command in pasted text with CRLF", () => {
      expect(tracker.process("/clear\r\n")).toBe(true);
    });

    it("handles multi-line paste - only first command matters", () => {
      expect(tracker.process("/clear\nsecond line\nthird line")).toBe(true);
    });

    it("handles partial paste followed by manual Enter", () => {
      tracker.process("/cle");
      tracker.process("ar");
      expect(tracker.process("\r")).toBe(true);
    });

    it("resets buffer after first newline in multi-line input", () => {
      tracker.process("ls -la\n");
      // Buffer should be fresh after first newline
      tracker.process("/clear");
      expect(tracker.process("\r")).toBe(true);
    });
  });

  describe("escape sequence handling", () => {
    it("resets buffer on arrow keys", () => {
      "/clear".split("").forEach((c) => tracker.process(c));
      tracker.process("\x1b[A"); // Up arrow
      expect(tracker.process("\r")).toBe(false);
    });

    it("resets buffer on Home key", () => {
      "/new".split("").forEach((c) => tracker.process(c));
      tracker.process("\x1b[H"); // Home
      expect(tracker.process("\r")).toBe(false);
    });

    it("resets buffer on bracketed paste start", () => {
      "/reset".split("").forEach((c) => tracker.process(c));
      tracker.process("\x1b[200~"); // Bracketed paste start
      expect(tracker.process("\r")).toBe(false);
    });

    it("handles escape key during typing", () => {
      "/cle".split("").forEach((c) => tracker.process(c));
      tracker.process("\x1b"); // Escape key
      "ar".split("").forEach((c) => tracker.process(c));
      expect(tracker.process("\r")).toBe(false); // Buffer was reset by ESC
    });
  });

  describe("race condition scenarios", () => {
    it("handles quick Ctrl+C followed by clear command", () => {
      "/par".split("").forEach((c) => tracker.process(c));
      tracker.process("\x03"); // Ctrl+C
      "/clear".split("").forEach((c) => tracker.process(c));
      expect(tracker.process("\r")).toBe(true);
    });

    it("handles interleaved backspace and typing", () => {
      tracker.process("/");
      tracker.process("c");
      tracker.process("l");
      tracker.process("e");
      tracker.process("a");
      tracker.process("r");
      tracker.process("X");
      tracker.process("\x7f"); // Backspace
      expect(tracker.process("\r")).toBe(true); // Back to "/clear"
    });

    it("handles rapid control character spam", () => {
      "/clear".split("").forEach((c) => tracker.process(c));
      tracker.process("\x03\x04\x1b"); // Multiple control chars
      expect(tracker.process("\r")).toBe(false); // Buffer reset
    });
  });
});

describe("CLEAR_COMMANDS", () => {
  it("contains all expected AI agent clear commands", () => {
    expect(CLEAR_COMMANDS.has("/clear")).toBe(true);
    expect(CLEAR_COMMANDS.has("/new")).toBe(true);
    expect(CLEAR_COMMANDS.has("/reset")).toBe(true);
  });

  it("contains standard shell clear commands", () => {
    expect(CLEAR_COMMANDS.has("clear")).toBe(true);
    expect(CLEAR_COMMANDS.has("cls")).toBe(true);
  });

  it("does not contain partial matches", () => {
    expect(CLEAR_COMMANDS.has("/cle")).toBe(false);
    expect(CLEAR_COMMANDS.has("clea")).toBe(false);
    expect(CLEAR_COMMANDS.has("/clear-cache")).toBe(false);
  });
});
