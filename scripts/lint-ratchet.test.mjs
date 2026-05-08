import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Test the lint-ratchet shrinkage guard logic in isolation. We don't shell out
// to eslint; we test the guard that fires inside the --update path.

const UPDATE_SHRINKAGE_THRESHOLD = 0.1;

/**
 * Core guard logic extracted from lint-ratchet.mjs for testability.
 * Returns `{ blocked: true, message: string }` or `{ blocked: false }`.
 */
function checkShrinkageGuard(priorCount, newCount, force, threshold = UPDATE_SHRINKAGE_THRESHOLD) {
  if (force) return { blocked: false };

  if (priorCount > 0) {
    const drop = (priorCount - newCount) / priorCount;
    if (drop > threshold) {
      return {
        blocked: true,
        message: `::error::refusing to update baseline — warning count would drop from ${priorCount} to ${newCount} (${(drop * 100).toFixed(1)}% shrinkage > ${(threshold * 100).toFixed(0)}% threshold).`,
      };
    }
  }

  return { blocked: false };
}

describe("lint-ratchet shrinkage guard", () => {
  describe("UPDATE_SHRINKAGE_THRESHOLD = 0.1", () => {
    it("passes when warnings decrease by exactly 10%", () => {
      // prior=100, new=90 → drop=0.10 exactly → not > 0.1
      const result = checkShrinkageGuard(100, 90, false);
      expect(result.blocked).toBe(false);
    });

    it("passes when warnings decrease by less than 10%", () => {
      // prior=100, new=91 → drop=0.09
      const result = checkShrinkageGuard(100, 91, false);
      expect(result.blocked).toBe(false);
    });

    it("blocks when warnings decrease by more than 10%", () => {
      // prior=100, new=89 → drop=0.11 > 0.1
      const result = checkShrinkageGuard(100, 89, false);
      expect(result.blocked).toBe(true);
      expect(result.message).toContain("::error::refusing to update baseline");
      expect(result.message).toContain("11.0% shrinkage");
      expect(result.message).toContain("10% threshold");
    });

    it("blocks large drops", () => {
      // prior=200, new=100 → drop=0.50
      const result = checkShrinkageGuard(200, 100, false);
      expect(result.blocked).toBe(true);
      expect(result.message).toContain("50.0% shrinkage");
    });

    it("passes when warning count stays the same", () => {
      const result = checkShrinkageGuard(100, 100, false);
      expect(result.blocked).toBe(false);
    });

    it("passes when warnings increase", () => {
      const result = checkShrinkageGuard(90, 100, false);
      expect(result.blocked).toBe(false);
    });
  });

  describe("--force flag", () => {
    it("bypasses the guard when --force is true", () => {
      // 30% drop → would normally block
      const result = checkShrinkageGuard(100, 70, true);
      expect(result.blocked).toBe(false);
    });

    it("bypasses the guard even at 100% drop", () => {
      const result = checkShrinkageGuard(100, 0, true);
      expect(result.blocked).toBe(false);
    });
  });

  describe("priorCount=0 edge cases", () => {
    it("allows update when prior count is 0 (avoids division by zero)", () => {
      // prior=0, new=5 → skip guard, not a shrinkage scenario
      const result = checkShrinkageGuard(0, 5, false);
      expect(result.blocked).toBe(false);
    });

    it("allows update when prior count is 0 and new count is 0", () => {
      const result = checkShrinkageGuard(0, 0, false);
      expect(result.blocked).toBe(false);
    });
  });

  describe("priorCount edge cases", () => {
    it("allows update when prior count is Infinity (malformed baseline)", () => {
      const result = checkShrinkageGuard(Infinity, 50, false);
      expect(result.blocked).toBe(false);
    });

    it("allows update when prior count is NaN (malformed baseline)", () => {
      const result = checkShrinkageGuard(NaN, 50, false);
      expect(result.blocked).toBe(false);
    });
  });

  describe("threshold boundary values", () => {
    it("10% boundary: prior=1000 new=900 → exactly 10%, passes", () => {
      const result = checkShrinkageGuard(1000, 900, false);
      expect(result.blocked).toBe(false);
    });

    it("just over 10%: prior=1000 new=899 → 10.1%, blocks", () => {
      const result = checkShrinkageGuard(1000, 899, false);
      expect(result.blocked).toBe(true);
    });

    it("small absolute numbers: prior=10 new=8 → 20%, blocks", () => {
      const result = checkShrinkageGuard(10, 8, false);
      expect(result.blocked).toBe(true);
    });

    it("small absolute numbers: prior=10 new=9 → 10%, passes", () => {
      const result = checkShrinkageGuard(10, 9, false);
      expect(result.blocked).toBe(false);
    });
  });
});
