import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const CLAUDE = readFileSync(path.join(root, "help/CLAUDE.md"), "utf8");
const GEMINI = readFileSync(path.join(root, "help/GEMINI.md"), "utf8");
const AGENTS = readFileSync(path.join(root, "help/AGENTS.md"), "utf8");
const SHARED = readFileSync(path.join(root, "scripts/help-src/SHARED.md"), "utf8");

const ALL_THREE = [
  ["CLAUDE.md", CLAUDE],
  ["GEMINI.md", GEMINI],
  ["AGENTS.md", AGENTS],
];

describe("help prompt outputs", () => {
  describe("shared content lands in all three files", () => {
    it.each(ALL_THREE)("%s contains the product anchor", (_name, body) => {
      expect(body).toContain("## What is Daintree?");
      expect(body).toContain("desktop application for orchestrating AI coding agents");
    });

    it.each(ALL_THREE)("%s carries the mandatory citation rule", (_name, body) => {
      expect(body).toMatch(/Cite every docs page you reference/);
      expect(body).toContain("https://daintree.org");
    });

    it.each(ALL_THREE)("%s carries the YouTube standalone-callout rule", (_name, body) => {
      expect(body).toMatch(/Surface video content as a standalone callout/);
      expect(body).toMatch(/standalone block/);
      expect(body).not.toMatch(/share them prominently/);
    });

    it.each(ALL_THREE)("%s carries the explicit IDK pattern", (_name, body) => {
      expect(body).toContain("I don't have documentation for that");
    });

    it.each(ALL_THREE)("%s lists the canonical topics", (_name, body) => {
      expect(body).toContain("## Topics You Can Help With");
      expect(body).toContain("Getting started and first-run setup");
      expect(body).toContain("Workflow engine and automation");
    });
  });

  describe("Claude-only content stays in CLAUDE.md", () => {
    it("CLAUDE.md contains the Tier Model and terminal.getStatus recipe", () => {
      expect(CLAUDE).toContain("## Tier Model");
      expect(CLAUDE).toContain("## Watching Multiple Agent Terminals");
      expect(CLAUDE).toContain("terminal.getStatus");
      expect(CLAUDE).toContain("ScheduleWakeup");
    });

    it("GEMINI.md and AGENTS.md omit the Tier Model and getStatus recipe", () => {
      for (const body of [GEMINI, AGENTS]) {
        expect(body).not.toContain("## Tier Model");
        expect(body).not.toContain("## Watching Multiple Agent Terminals");
        expect(body).not.toContain("terminal.getStatus");
      }
    });
  });

  describe("agent-specific framing stays in each head", () => {
    it("AGENTS.md retains the Codex role-override header", () => {
      expect(AGENTS.split("\n")[0]).toBe("# Role Override: Daintree Help Assistant");
    });

    it("GEMINI.md and AGENTS.md flag live-state guidance as not applicable", () => {
      for (const body of [GEMINI, AGENTS]) {
        expect(body).toMatch(/Phase 1[^\n]*docs-only/);
        expect(body).toMatch(/inspecting live state.*not applicable/);
      }
    });

    it("CLAUDE.md does not carry the docs-only Phase 1 disclaimer", () => {
      expect(CLAUDE).not.toMatch(/Phase 1[^\n]*docs-only/);
    });
  });

  describe("shared file structure", () => {
    it("SHARED.md does not declare a top-level title (heads own it)", () => {
      const firstHeading = SHARED.match(/^#\s.+/m);
      expect(firstHeading).toBeNull();
    });

    it("each generated file ends with exactly one trailing newline", () => {
      for (const [, body] of ALL_THREE) {
        expect(body.endsWith("\n")).toBe(true);
        expect(body.endsWith("\n\n")).toBe(false);
      }
    });
  });
});
