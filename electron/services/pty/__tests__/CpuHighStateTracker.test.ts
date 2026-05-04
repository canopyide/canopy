import { describe, it, expect, vi } from "vitest";
import { CpuHighStateTracker } from "../CpuHighStateTracker.js";
import type { ProcessStateValidator } from "../../ActivityMonitor.js";

const OPTS = {
  cpuHighThreshold: 10,
  cpuLowThreshold: 3,
  maxCpuHighEscapeMs: 60000,
};

function makeValidator(cpuValues: number[]): ProcessStateValidator {
  let i = 0;
  return {
    hasActiveChildren: () => true,
    getDescendantsCpuUsage: () => cpuValues[Math.min(i++, cpuValues.length - 1)],
  };
}

describe("CpuHighStateTracker", () => {
  describe("threshold transitions", () => {
    it("flips low → high at the high threshold", () => {
      const validator = makeValidator([9, 10, 11]);
      const t = new CpuHighStateTracker(validator, OPTS);

      // 9: below high threshold, stays low
      expect(t.isHighAndNotDeadlined(1000)).toBe(false);
      // 10: at threshold, flips high (>=)
      expect(t.isHighAndNotDeadlined(2000)).toBe(true);
      // 11: stays high
      expect(t.isHighAndNotDeadlined(3000)).toBe(true);
    });

    it("flips high → low only when CPU drops below the low threshold", () => {
      // Start by flipping high.
      const validator = makeValidator([15, 4, 3, 2]);
      const t = new CpuHighStateTracker(validator, OPTS);
      expect(t.isHighAndNotDeadlined(1000)).toBe(true);
      // 4: between thresholds (hysteresis band) — stays high
      expect(t.isHighAndNotDeadlined(2000)).toBe(true);
      // 3: at the low threshold — must drop strictly BELOW to flip
      expect(t.isHighAndNotDeadlined(3000)).toBe(true);
      // 2: now below low threshold — flips low
      expect(t.isHighAndNotDeadlined(4000)).toBe(false);
    });
  });

  describe("deadline", () => {
    it("returns false once now - cpuHighSince >= maxCpuHighEscapeMs", () => {
      const validator = makeValidator([15, 15, 15]);
      const t = new CpuHighStateTracker(validator, OPTS);
      expect(t.isHighAndNotDeadlined(1000)).toBe(true); // cpuHighSince = 1000
      expect(t.isHighAndNotDeadlined(60999)).toBe(true); // 59999 < 60000
      expect(t.isHighAndNotDeadlined(61000)).toBe(false); // 60000 >= 60000 — deadlined
    });

    it("re-arms cpuHighSince after a low → high cycle", () => {
      const validator = makeValidator([15, 2, 15]);
      const t = new CpuHighStateTracker(validator, OPTS);
      expect(t.isHighAndNotDeadlined(1000)).toBe(true); // cpuHighSince = 1000
      expect(t.isHighAndNotDeadlined(2000)).toBe(false); // dropped low, cpuHighSince = 0
      expect(t.isHighAndNotDeadlined(3000)).toBe(true); // re-armed at 3000
      // The new arm fires its own deadline window, not the old one.
      expect(t.isHighAndNotDeadlined(62000)).toBe(true); // 59000 < 60000
    });
  });

  describe("null-safe fail-open", () => {
    it("returns false when validator is undefined", () => {
      const t = new CpuHighStateTracker(undefined, OPTS);
      expect(t.isHighAndNotDeadlined(1000)).toBe(false);
    });

    it("returns false when validator lacks getDescendantsCpuUsage", () => {
      const validator: ProcessStateValidator = {
        hasActiveChildren: () => true,
      };
      const t = new CpuHighStateTracker(validator, OPTS);
      expect(t.isHighAndNotDeadlined(1000)).toBe(false);
    });

    it("returns false when getDescendantsCpuUsage throws", () => {
      const validator: ProcessStateValidator = {
        hasActiveChildren: () => true,
        getDescendantsCpuUsage: vi.fn(() => {
          throw new Error("kaput");
        }),
      };
      const t = new CpuHighStateTracker(validator, OPTS);
      expect(t.isHighAndNotDeadlined(1000)).toBe(false);
    });
  });

  describe("reset()", () => {
    it("clears isCpuHigh and cpuHighSince", () => {
      // Push to high, then reset; the next call must re-arm cpuHighSince to the new now.
      const validator = makeValidator([15, 15]);
      const t = new CpuHighStateTracker(validator, OPTS);
      expect(t.isHighAndNotDeadlined(1000)).toBe(true); // cpuHighSince = 1000
      t.reset();
      // Without reset, t=70_000 would be deadlined. After reset, isCpuHigh=false; next sample re-arms.
      expect(t.isHighAndNotDeadlined(70000)).toBe(true); // cpuHighSince = 70000
      expect(t.isHighAndNotDeadlined(70500)).toBe(true); // 500 < 60000
    });
  });

  describe("update()", () => {
    it("advances internal state without returning a boolean", () => {
      const validator = makeValidator([15]);
      const t = new CpuHighStateTracker(validator, OPTS);
      t.update(1000);
      // After update at t=1000, isHighAndNotDeadlined still returns true at t=1500
      // and resamples a fresh value (validator returns last value when exhausted).
      expect(t.isHighAndNotDeadlined(1500)).toBe(true);
    });
  });
});
