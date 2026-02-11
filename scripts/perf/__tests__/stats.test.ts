import { describe, expect, it } from "vitest";
import { mean, percentile, stdDev, round } from "../lib/stats";

describe("perf stats utilities", () => {
  it("computes percentile with interpolation", () => {
    const values = [10, 20, 30, 40];
    expect(percentile(values, 50)).toBe(25);
    expect(percentile(values, 95)).toBeCloseTo(38.5, 5);
  });

  it("handles empty and edge percentile inputs", () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([3, 1, 2], 0)).toBe(1);
    expect(percentile([3, 1, 2], 100)).toBe(3);
  });

  it("computes mean, stddev, and rounding", () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(values)).toBe(5);
    expect(stdDev(values)).toBeCloseTo(2, 5);
    expect(round(3.141592, 3)).toBe(3.142);
  });
});
