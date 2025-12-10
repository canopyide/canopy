import { describe, it, expect } from "vitest";
import { styleUrls, containsUrl } from "../UrlStyler.js";

// ANSI escape sequences used in the implementation
const ANSI = {
  BLUE_FG: "\x1b[38;2;56;189;248m",
  UNDERLINE_ON: "\x1b[4m",
  UNDERLINE_BLUE: "\x1b[58;2;56;189;248m",
  RESET: "\x1b[0m",
} as const;

describe("UrlStyler", () => {
  describe("styleUrls", () => {
    describe("basic URL styling", () => {
      it("styles a simple HTTP URL", () => {
        const input = "Check http://example.com for details";
        const output = styleUrls(input);

        expect(output).toContain(ANSI.BLUE_FG);
        expect(output).toContain(ANSI.UNDERLINE_ON);
        expect(output).toContain(ANSI.RESET);
        expect(output).toContain("http://example.com");
      });

      it("styles a simple HTTPS URL", () => {
        const input = "Visit https://github.com/user/repo";
        const output = styleUrls(input);

        expect(output).toContain(ANSI.BLUE_FG);
        expect(output).toContain("https://github.com/user/repo");
      });

      it("handles URL at the beginning of text", () => {
        const input = "https://example.com is a great site";
        const output = styleUrls(input);

        expect(output.startsWith(ANSI.BLUE_FG)).toBe(true);
        expect(output).toContain(" is a great site");
      });

      it("handles URL at the end of text", () => {
        const input = "Visit the site at https://example.com";
        const output = styleUrls(input);

        expect(output.endsWith(ANSI.RESET)).toBe(true);
        expect(output).toContain("Visit the site at ");
      });

      it("handles URL only (no surrounding text)", () => {
        const input = "https://example.com/path";
        const output = styleUrls(input);

        expect(output).toBe(
          `${ANSI.BLUE_FG}${ANSI.UNDERLINE_ON}${ANSI.UNDERLINE_BLUE}https://example.com/path${ANSI.RESET}`
        );
      });

      it("handles multiple URLs in single line", () => {
        const input = "See https://a.com and https://b.com for info";
        const output = styleUrls(input);

        // Count occurrences of BLUE_FG escape sequence
        const blueCount = output.split(ANSI.BLUE_FG).length - 1;
        expect(blueCount).toBe(2);
      });
    });

    describe("URL formats", () => {
      it("styles URLs with ports", () => {
        const input = "Server at http://localhost:3000/api";
        const output = styleUrls(input);

        expect(output).toContain("http://localhost:3000/api");
        expect(output).toContain(ANSI.BLUE_FG);
      });

      it("styles URLs with query parameters", () => {
        const input = "Search at https://google.com/search?q=test&lang=en";
        const output = styleUrls(input);

        expect(output).toContain("https://google.com/search?q=test&lang=en");
        expect(output).toContain(ANSI.BLUE_FG);
      });

      it("styles URLs with fragments", () => {
        const input = "Go to https://docs.com/page#section";
        const output = styleUrls(input);

        expect(output).toContain("https://docs.com/page#section");
        expect(output).toContain(ANSI.BLUE_FG);
      });

      it("styles URLs with authentication", () => {
        const input = "API at https://user:pass@api.example.com";
        const output = styleUrls(input);

        expect(output).toContain("https://user:pass@api.example.com");
        expect(output).toContain(ANSI.BLUE_FG);
      });

      it("handles complex URLs with all components", () => {
        const input =
          "Full URL: https://user@example.com:8080/path/to/resource?key=value&foo=bar#section";
        const output = styleUrls(input);

        expect(output).toContain(ANSI.BLUE_FG);
        expect(output).toContain(
          "https://user@example.com:8080/path/to/resource?key=value&foo=bar#section"
        );
      });
    });

    describe("preserving existing ANSI codes", () => {
      it("does not modify text with existing ANSI codes", () => {
        const input = "\x1b[31mError:\x1b[0m https://example.com";
        const output = styleUrls(input);

        expect(output).toBe(input);
      });

      it("preserves colorized ls output", () => {
        const input = "\x1b[34mdir/\x1b[0m \x1b[32mfile.txt\x1b[0m";
        const output = styleUrls(input);

        expect(output).toBe(input);
      });

      it("preserves ANSI codes even when URL present", () => {
        const input = "\x1b[1mBold\x1b[0m text with https://example.com";
        const output = styleUrls(input);

        expect(output).toBe(input);
      });
    });

    describe("edge cases", () => {
      it("returns empty string for empty input", () => {
        expect(styleUrls("")).toBe("");
      });

      it("returns original text when no URLs present", () => {
        const input = "Plain text without any URLs";
        expect(styleUrls(input)).toBe(input);
      });

      it("handles newlines", () => {
        const input = "Line 1\nhttps://example.com\nLine 3";
        const output = styleUrls(input);

        expect(output).toContain(ANSI.BLUE_FG);
        expect(output).toContain("\n");
      });

      it("handles tabs", () => {
        const input = "Tab:\thttps://example.com\ttab";
        const output = styleUrls(input);

        expect(output).toContain(ANSI.BLUE_FG);
        expect(output).toContain("\t");
      });

      it("styles URLs inside angle brackets", () => {
        const input = "Email: <https://example.com>";
        const output = styleUrls(input);

        expect(output).toContain(ANSI.BLUE_FG);
        expect(output).toContain("https://example.com");
      });

      it("styles URLs inside double quotes", () => {
        const input = 'URL is "https://example.com"';
        const output = styleUrls(input);

        expect(output).toContain(ANSI.BLUE_FG);
        expect(output).toContain("https://example.com");
      });

      it("handles URL followed by punctuation (period included in URL)", () => {
        const input = "Go to https://example.com. Then continue.";
        const output = styleUrls(input);

        expect(output).toContain(ANSI.BLUE_FG);
        expect(output).toContain("Then continue.");
      });

      it("handles URL followed by comma", () => {
        const input = "Sites like https://a.com, https://b.com work";
        const output = styleUrls(input);

        const blueCount = output.split(ANSI.BLUE_FG).length - 1;
        expect(blueCount).toBe(2);
      });
    });

    describe("performance considerations", () => {
      it("handles large text efficiently", () => {
        const text = "Some text with https://example.com embedded. ";
        const input = text.repeat(1000);
        const start = performance.now();
        const output = styleUrls(input);
        const duration = performance.now() - start;

        expect(output).toContain(ANSI.BLUE_FG);
        expect(duration).toBeLessThan(100);
      });

      it("handles text with no URLs quickly", () => {
        const input = "Lorem ipsum ".repeat(10000);
        const start = performance.now();
        const output = styleUrls(input);
        const duration = performance.now() - start;

        expect(output).toBe(input);
        expect(duration).toBeLessThan(50);
      });
    });
  });

  describe("containsUrl", () => {
    it("returns true for text with HTTP URL", () => {
      expect(containsUrl("Check http://example.com")).toBe(true);
    });

    it("returns true for text with HTTPS URL", () => {
      expect(containsUrl("Check https://example.com")).toBe(true);
    });

    it("returns false for text without URLs", () => {
      expect(containsUrl("Plain text without URLs")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(containsUrl("")).toBe(false);
    });

    it("returns false for text with ftp URL (not supported)", () => {
      expect(containsUrl("File at ftp://files.example.com")).toBe(false);
    });

    it("returns true for text with multiple URLs", () => {
      expect(containsUrl("https://a.com and https://b.com")).toBe(true);
    });
  });
});
