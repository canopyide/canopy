// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs/promises";
import path from "path";

const MODAL_PATH = path.resolve(__dirname, "../WorktreeOverviewModal.tsx");

describe("WorktreeOverviewModal — clickable aggregate stats (#8385)", () => {
  let source: string;

  beforeEach(async () => {
    source = await fs.readFile(MODAL_PATH, "utf-8");
  });

  describe("imports", () => {
    it("imports matchesQuickStateFilter from worktreeFilters", () => {
      expect(source).toMatch(/matchesQuickStateFilter/);
    });

    it("imports setQuickStateFilter from the filter store", () => {
      expect(source).toContain("setQuickStateFilter");
    });
  });

  describe("store selector", () => {
    it("reads quickStateFilter from the store", () => {
      expect(source).toMatch(/quickStateFilter:\s*state\.quickStateFilter/);
    });
  });

  describe("filteredWorktrees computation", () => {
    it("gates on matchesQuickStateFilter when quickStateFilter is not 'all'", () => {
      expect(source).toMatch(
        /quickStateFilter\s*!==\s*"all"\s*&&\s*!matchesQuickStateFilter\(quickStateFilter,\s*derived\)/
      );
    });

    it("includes quickStateFilter in the useMemo dep array", () => {
      // Find the dep array that closes the filteredWorktrees useMemo
      const depArrayMatch = source.match(
        /const\s*\{\s*filteredWorktrees,\s*groupedSections\s*\}\s*=\s*useMemo[\s\S]*?\]\s*\);/
      );
      expect(depArrayMatch).not.toBeNull();
      expect(depArrayMatch![0]).toContain("quickStateFilter");
    });

    it("gates alwaysShowActive bypass on quickStateFilter === 'all'", () => {
      expect(source).toMatch(
        /alwaysShowActive\s*&&\s*isActive\s*&&\s*!hasActiveQuery\s*&&\s*quickStateFilter\s*===\s*"all"/
      );
    });

    it("gates alwaysShowWaiting bypass on quickStateFilter === 'all'", () => {
      expect(source).toMatch(
        /alwaysShowWaiting\s*&&\s*derived\.hasWaitingAgent\s*&&\s*!hasActiveQuery\s*&&\s*quickStateFilter\s*===\s*"all"/
      );
    });
  });

  describe("aggregate stats chips", () => {
    // Slice from the aggregate stats section to isolate assertions
    function statsSlice(src: string): string {
      const start = src.indexOf("Aggregate activity statistics");
      // Find the closing of that div
      let depth = 0;
      let i = start;
      let found = false;
      for (; i < src.length; i++) {
        if (src.slice(i, i + 4) === "<div") {
          depth++;
        } else if (src.slice(i, i + 6) === "</div>") {
          depth--;
          if (depth === 0 && found) break;
        }
        if (depth > 0 && !found) found = true;
      }
      return src.slice(start, i + 6);
    }

    it("uses button elements instead of span elements for the stat chips", () => {
      const stats = statsSlice(source);
      // The chips are now <button> elements
      const buttonCount = (stats.match(/<button/g) ?? []).length;
      expect(buttonCount).toBeGreaterThanOrEqual(1);
      // No <span> elements wrapping the chip content (pulse dot spans are fine)
      const spanOpenTags = stats.match(/<span/g) ?? [];
      // There should be span elements for the dot and text, but not the chip wrapper
      expect(spanOpenTags.length).toBeGreaterThan(0);
    });

    it("sets aria-pressed based on quickStateFilter for working chip", () => {
      expect(source).toMatch(/aria-pressed=\{quickStateFilter\s*===\s*"working"\}/);
    });

    it("sets aria-pressed based on quickStateFilter for waiting chip", () => {
      expect(source).toMatch(/aria-pressed=\{quickStateFilter\s*===\s*"waiting"\}/);
    });

    it("working chip onClick toggles between 'working' and 'all'", () => {
      expect(source).toMatch(
        /setQuickStateFilter\(quickStateFilter\s*===\s*"working"\s*\?\s*"all"\s*:\s*"working"\)/
      );
    });

    it("waiting chip onClick toggles between 'waiting' and 'all'", () => {
      expect(source).toMatch(
        /setQuickStateFilter\(quickStateFilter\s*===\s*"waiting"\s*\?\s*"all"\s*:\s*"waiting"\)/
      );
    });

    it("uses transition-colors on chip buttons (not transition-all)", () => {
      const stats = statsSlice(source);
      expect(stats).toContain("transition-colors");
      expect(stats).not.toContain("transition-all");
    });

    it("applies active styling with bg-overlay-subtle when chip is active", () => {
      expect(source).toContain("bg-overlay-subtle");
      expect(source).toContain("shadow-[inset_0_-2px_0_0_var(--color-text-secondary)]");
    });

    it("applies hover background on inactive chips", () => {
      expect(source).toContain("hover:bg-tint/[0.04]");
    });

    it("uses focus-visible:outline-hidden with ring for focus styling", () => {
      const stats = statsSlice(source);
      expect(stats).toContain("focus-visible:outline-hidden");
      expect(stats).toContain("focus-visible:ring-2");
      expect(stats).toContain("focus-visible:ring-daintree-accent");
    });

    it("wrapper uses role='group' instead of role='status'", () => {
      // The wrapper div now contains interactive controls; role="group" is appropriate
      const stats = statsSlice(source);
      expect(stats).toContain('role="group"');
      expect(stats).not.toContain('role="status"');
    });

    it("wrapper aria-label describes filter action", () => {
      expect(source).toContain("Filter by agent state");
    });

    it("keeps pulse dot and count text in working chip", () => {
      expect(source).toContain("motion-safe:animate-pulse");
      expect(source).toMatch(/\baggregateStats\.workingCount\b/);
    });

    it("keeps count text in waiting chip", () => {
      expect(source).toMatch(/\baggregateStats\.waitingCount\b/);
    });
  });

  describe("aggregateStats computation (unchanged)", () => {
    it("still computes workingCount and waitingCount from raw worktrees", () => {
      expect(source).toMatch(/workingCount\+\+/);
      expect(source).toMatch(/waitingCount\+\+/);
    });

    it("still respects hideMainWorktree", () => {
      expect(source).toMatch(/hideMainWorktree\s*&&\s*worktree\.isMainWorktree/);
    });
  });
});
