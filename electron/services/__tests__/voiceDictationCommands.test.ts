import { describe, it, expect } from "vitest";
import { applyDictationCommands } from "../voiceDictationCommands.js";

describe("applyDictationCommands", () => {
  describe("individual commands at end of utterance", () => {
    it("replaces trailing 'period' with '.'", () => {
      expect(applyDictationCommands("hello period")).toBe("hello.");
    });

    it("replaces trailing 'full stop' with '.'", () => {
      expect(applyDictationCommands("hello full stop")).toBe("hello.");
    });

    it("replaces trailing 'comma' with ','", () => {
      expect(applyDictationCommands("hello comma")).toBe("hello,");
    });

    it("replaces trailing 'question mark' with '?'", () => {
      expect(applyDictationCommands("are you there question mark")).toBe("are you there?");
    });

    it("replaces trailing 'exclamation point' with '!'", () => {
      expect(applyDictationCommands("watch out exclamation point")).toBe("watch out!");
    });

    it("replaces trailing 'exclamation mark' with '!'", () => {
      expect(applyDictationCommands("watch out exclamation mark")).toBe("watch out!");
    });

    it("replaces trailing 'new paragraph' with '\\n\\n'", () => {
      expect(applyDictationCommands("hello new paragraph")).toBe("hello\n\n");
    });

    it("replaces trailing 'new line' with '\\n'", () => {
      expect(applyDictationCommands("hello new line")).toBe("hello\n");
    });
  });

  describe("command-only utterances", () => {
    it("replaces a standalone 'period'", () => {
      expect(applyDictationCommands("period")).toBe(".");
    });

    it("replaces a standalone 'new paragraph'", () => {
      expect(applyDictationCommands("new paragraph")).toBe("\n\n");
    });

    it("replaces a standalone 'new line'", () => {
      expect(applyDictationCommands("new line")).toBe("\n");
    });
  });

  describe("case insensitivity", () => {
    it("replaces uppercase commands", () => {
      expect(applyDictationCommands("hello PERIOD")).toBe("hello.");
    });

    it("replaces mixed-case commands", () => {
      expect(applyDictationCommands("hello New Paragraph")).toBe("hello\n\n");
    });

    it("replaces 'NEW PARAGRAPH' (caps)", () => {
      expect(applyDictationCommands("NEW PARAGRAPH")).toBe("\n\n");
    });
  });

  describe("false-positive safety (mid-sentence)", () => {
    it("leaves 'I'll add a new paragraph here' literal", () => {
      const input = "I'll add a new paragraph here";
      expect(applyDictationCommands(input)).toBe(input);
    });

    it("leaves 'periodic table' literal", () => {
      const input = "periodic table";
      expect(applyDictationCommands(input)).toBe(input);
    });

    it("leaves 'an Oxford comma matters' literal", () => {
      const input = "an Oxford comma matters";
      expect(applyDictationCommands(input)).toBe(input);
    });

    it("leaves 'I question mark choices' literal (mid-sentence)", () => {
      const input = "I question mark choices";
      expect(applyDictationCommands(input)).toBe(input);
    });

    it("leaves empty string unchanged", () => {
      expect(applyDictationCommands("")).toBe("");
    });

    it("leaves text without any commands unchanged", () => {
      const input = "the quick brown fox";
      expect(applyDictationCommands(input)).toBe(input);
    });
  });

  describe("chained trailing commands", () => {
    it("replaces 'hello comma period' as a chain", () => {
      expect(applyDictationCommands("hello comma period")).toBe("hello,.");
    });

    it("replaces 'hello comma new paragraph' as a chain", () => {
      expect(applyDictationCommands("hello comma new paragraph")).toBe("hello,\n\n");
    });

    it("replaces a long chain at the tail", () => {
      expect(applyDictationCommands("done period new paragraph")).toBe("done.\n\n");
    });

    it("replaces the trailing chain only when literal text intervenes", () => {
      // "world" interrupts the chain, so only "period" at the tail fires.
      expect(applyDictationCommands("hello comma world period")).toBe("hello comma world.");
    });
  });

  describe("whitespace handling", () => {
    it("handles multiple spaces between text and command", () => {
      expect(applyDictationCommands("hello   period")).toBe("hello.");
    });

    it("handles trailing whitespace after command", () => {
      expect(applyDictationCommands("hello period   ")).toBe("hello.");
    });

    it("preserves leading whitespace before the literal portion", () => {
      // Leading whitespace before "hello" is preserved; only the trailing chain replaces.
      expect(applyDictationCommands("  hello period")).toBe("  hello.");
    });
  });

  describe("idempotence", () => {
    it("running twice produces the same result", () => {
      const once = applyDictationCommands("hello period");
      const twice = applyDictationCommands(once);
      expect(twice).toBe(once);
    });

    it("does not re-process already-replaced punctuation", () => {
      // After replacement, "." is not a command — running again is a no-op.
      expect(applyDictationCommands("hello.")).toBe("hello.");
    });
  });

  describe("word-boundary safety", () => {
    it("does not match 'period' inside 'periodic'", () => {
      expect(applyDictationCommands("periodic")).toBe("periodic");
    });

    it("does not match 'period' inside 'periodically'", () => {
      expect(applyDictationCommands("worked periodically")).toBe("worked periodically");
    });

    it("does not match 'comma' inside 'commando'", () => {
      expect(applyDictationCommands("the commando")).toBe("the commando");
    });
  });
});
