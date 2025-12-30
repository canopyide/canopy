import { describe, it, expect } from "vitest";
import {
  escapeShellArg,
  escapeShellArgOptional,
  isSafeUnescaped,
  isWindows,
} from "../shellEscape.js";

describe("shellEscape", () => {
  describe("escapeShellArg - POSIX", () => {
    it("should wrap simple strings in single quotes", () => {
      expect(escapeShellArg("hello", "posix")).toBe("'hello'");
      expect(escapeShellArg("hello world", "posix")).toBe("'hello world'");
    });

    it("should handle empty strings", () => {
      expect(escapeShellArg("", "posix")).toBe("''");
    });

    it("should escape single quotes by ending, escaping, and restarting", () => {
      expect(escapeShellArg("it's working", "posix")).toBe("'it'\\''s working'");
      expect(escapeShellArg("'quoted'", "posix")).toBe("''\\''quoted'\\'''");
    });

    it("should handle double quotes without special escaping", () => {
      expect(escapeShellArg('he said "hello"', "posix")).toBe("'he said \"hello\"'");
    });

    it("should handle newlines", () => {
      expect(escapeShellArg("line1\nline2", "posix")).toBe("'line1\nline2'");
      expect(escapeShellArg("line1\r\nline2", "posix")).toBe("'line1\r\nline2'");
    });

    it("should handle special shell characters", () => {
      expect(escapeShellArg("$HOME", "posix")).toBe("'$HOME'");
      expect(escapeShellArg("`whoami`", "posix")).toBe("'`whoami`'");
      expect(escapeShellArg("!important", "posix")).toBe("'!important'");
      expect(escapeShellArg("a & b", "posix")).toBe("'a & b'");
      expect(escapeShellArg("a ; b", "posix")).toBe("'a ; b'");
      expect(escapeShellArg("a | b", "posix")).toBe("'a | b'");
      expect(escapeShellArg("$(command)", "posix")).toBe("'$(command)'");
    });

    it("should handle backslashes", () => {
      expect(escapeShellArg("path\\to\\file", "posix")).toBe("'path\\to\\file'");
      expect(escapeShellArg("\\n", "posix")).toBe("'\\n'");
    });

    it("should handle unicode characters", () => {
      expect(escapeShellArg("こんにちは", "posix")).toBe("'こんにちは'");
      expect(escapeShellArg("🚀 rocket", "posix")).toBe("'🚀 rocket'");
      expect(escapeShellArg("café", "posix")).toBe("'café'");
    });

    it("should handle mixed quotes and special characters", () => {
      expect(escapeShellArg('it\'s a "test" with $vars', "posix")).toBe(
        "'it'\\''s a \"test\" with $vars'"
      );
    });

    it("should handle multiple single quotes", () => {
      expect(escapeShellArg("''", "posix")).toBe("''\\'''\\'''");
      expect(escapeShellArg("'''", "posix")).toBe("''\\'''\\'''\\'''");
    });

    it("should handle tabs and other whitespace", () => {
      expect(escapeShellArg("hello\tworld", "posix")).toBe("'hello\tworld'");
      expect(escapeShellArg("  spaced  ", "posix")).toBe("'  spaced  '");
    });

    it("should handle hash/comment characters", () => {
      expect(escapeShellArg("# comment", "posix")).toBe("'# comment'");
    });

    it("should handle glob patterns", () => {
      expect(escapeShellArg("*.txt", "posix")).toBe("'*.txt'");
      expect(escapeShellArg("file?.txt", "posix")).toBe("'file?.txt'");
      expect(escapeShellArg("[abc].txt", "posix")).toBe("'[abc].txt'");
    });

    it("should handle parentheses and braces", () => {
      expect(escapeShellArg("(sub)", "posix")).toBe("'(sub)'");
      expect(escapeShellArg("{a,b}", "posix")).toBe("'{a,b}'");
    });
  });

  describe("escapeShellArg - Windows", () => {
    it("should wrap simple strings in double quotes", () => {
      expect(escapeShellArg("hello", "windows")).toBe('"hello"');
      expect(escapeShellArg("hello world", "windows")).toBe('"hello world"');
    });

    it("should handle empty strings", () => {
      expect(escapeShellArg("", "windows")).toBe('""');
    });

    it("should escape double quotes by doubling them", () => {
      expect(escapeShellArg('say "hello"', "windows")).toBe('"say ""hello"""');
      expect(escapeShellArg('test"test', "windows")).toBe('"test""test"');
    });

    it("should handle single quotes without special escaping", () => {
      expect(escapeShellArg("it's working", "windows")).toBe('"it\'s working"');
    });

    it("should handle newlines", () => {
      expect(escapeShellArg("line1\nline2", "windows")).toBe('"line1\nline2"');
      expect(escapeShellArg("line1\r\nline2", "windows")).toBe('"line1\r\nline2"');
    });

    it("should handle special characters", () => {
      expect(escapeShellArg("%PATH%", "windows")).toBe('"%PATH%"');
      expect(escapeShellArg("a & b", "windows")).toBe('"a & b"');
      expect(escapeShellArg("a | b", "windows")).toBe('"a | b"');
    });

    it("should double trailing backslashes", () => {
      expect(escapeShellArg("path\\", "windows")).toBe('"path\\\\"');
      expect(escapeShellArg("path\\\\", "windows")).toBe('"path\\\\\\\\"');
    });

    it("should handle backslashes not at the end", () => {
      expect(escapeShellArg("path\\to\\file", "windows")).toBe('"path\\to\\file"');
    });

    it("should handle unicode characters", () => {
      expect(escapeShellArg("こんにちは", "windows")).toBe('"こんにちは"');
      expect(escapeShellArg("🚀 rocket", "windows")).toBe('"🚀 rocket"');
    });

    it("should handle mixed quotes", () => {
      expect(escapeShellArg('it\'s a "test"', "windows")).toBe('"it\'s a ""test"""');
    });

    it("should handle multiple double quotes", () => {
      expect(escapeShellArg('""', "windows")).toBe('""""""');
      expect(escapeShellArg('"""', "windows")).toBe('""""""""');
    });
  });

  describe("isSafeUnescaped", () => {
    it("should return true for alphanumeric strings", () => {
      expect(isSafeUnescaped("hello")).toBe(true);
      expect(isSafeUnescaped("Hello123")).toBe(true);
      expect(isSafeUnescaped("ABC")).toBe(true);
    });

    it("should return true for strings with hyphens and underscores", () => {
      expect(isSafeUnescaped("my-flag")).toBe(true);
      expect(isSafeUnescaped("my_var")).toBe(true);
      expect(isSafeUnescaped("flag-name_123")).toBe(true);
    });

    it("should return true for strings with forward slashes", () => {
      expect(isSafeUnescaped("path/to/file")).toBe(true);
      expect(isSafeUnescaped("/usr/bin")).toBe(true);
    });

    it("should return false for empty strings", () => {
      expect(isSafeUnescaped("")).toBe(false);
    });

    it("should return false for strings with spaces", () => {
      expect(isSafeUnescaped("hello world")).toBe(false);
    });

    it("should return false for strings with special characters", () => {
      expect(isSafeUnescaped("$HOME")).toBe(false);
      expect(isSafeUnescaped("it's")).toBe(false);
      expect(isSafeUnescaped('say "hi"')).toBe(false);
      expect(isSafeUnescaped("a&b")).toBe(false);
      expect(isSafeUnescaped("*.txt")).toBe(false);
    });

    it("should return false for strings with backslashes", () => {
      expect(isSafeUnescaped("path\\to")).toBe(false);
    });
  });

  describe("escapeShellArgOptional", () => {
    it("should return safe strings unquoted", () => {
      expect(escapeShellArgOptional("hello", "posix")).toBe("hello");
      expect(escapeShellArgOptional("my-flag", "posix")).toBe("my-flag");
      expect(escapeShellArgOptional("path/to/file", "posix")).toBe("path/to/file");
    });

    it("should escape unsafe strings", () => {
      expect(escapeShellArgOptional("hello world", "posix")).toBe("'hello world'");
      expect(escapeShellArgOptional("$HOME", "posix")).toBe("'$HOME'");
    });

    it("should handle empty strings", () => {
      expect(escapeShellArgOptional("", "posix")).toBe("''");
      expect(escapeShellArgOptional("", "windows")).toBe('""');
    });
  });

  describe("isWindows", () => {
    it("should return a boolean", () => {
      expect(typeof isWindows()).toBe("boolean");
    });
  });

  describe("real-world prompts", () => {
    const testCases = [
      "Implement a login feature",
      "Fix the bug in user's profile page",
      'Add a button that says "Submit"',
      "Review the code and look for:\n- Security issues\n- Performance problems",
      "Create a function that handles $variable interpolation",
      "Write tests for the `calculate()` function",
      "Update the README with installation instructions",
      "Fix issue #123: Users can't log in with special chars like &, <, >",
    ];

    it.each(testCases)("should safely escape: %s", (prompt) => {
      const posix = escapeShellArg(prompt, "posix");
      const windows = escapeShellArg(prompt, "windows");

      // Verify quotes are present
      expect(posix.startsWith("'")).toBe(true);
      expect(posix.endsWith("'")).toBe(true);
      expect(windows.startsWith('"')).toBe(true);
      expect(windows.endsWith('"')).toBe(true);
    });
  });

  describe("security edge cases", () => {
    it("should prevent command injection via semicolon", () => {
      const malicious = "; rm -rf /";
      expect(escapeShellArg(malicious, "posix")).toBe("'; rm -rf /'");
    });

    it("should prevent command injection via backticks", () => {
      const malicious = "`rm -rf /`";
      expect(escapeShellArg(malicious, "posix")).toBe("'`rm -rf /`'");
    });

    it("should prevent command injection via $() substitution", () => {
      const malicious = "$(rm -rf /)";
      expect(escapeShellArg(malicious, "posix")).toBe("'$(rm -rf /)'");
    });

    it("should prevent command injection via pipes", () => {
      const malicious = "| cat /etc/passwd";
      expect(escapeShellArg(malicious, "posix")).toBe("'| cat /etc/passwd'");
    });

    it("should handle null bytes (strings can't contain them in JS)", () => {
      const withNull = "before\0after";
      const escaped = escapeShellArg(withNull, "posix");
      expect(escaped.includes("\0")).toBe(true);
    });
  });
});
