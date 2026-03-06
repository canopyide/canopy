import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getActivityColor } from "../colorInterpolation";

describe("getActivityColor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns idle color for null timestamp", () => {
    expect(getActivityColor(null)).toBe("#52525b");
  });

  it("returns idle color for undefined timestamp", () => {
    expect(getActivityColor(undefined)).toBe("#52525b");
  });

  it("returns idle color for non-finite timestamp", () => {
    expect(getActivityColor(Infinity)).toBe("#52525b");
    expect(getActivityColor(NaN)).toBe("#52525b");
  });

  it("returns 100% accent at t=0 (immediate activity)", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(getActivityColor(now)).toBe("color-mix(in oklab, #6b8de6 100%, #52525b)");
  });

  it("returns ~50% mix at midpoint (45s)", () => {
    const start = Date.now();
    vi.setSystemTime(start + 45_000);
    const result = getActivityColor(start);
    expect(result).toBe("color-mix(in oklab, #6b8de6 50%, #52525b)");
  });

  it("returns idle color at or beyond 90 seconds", () => {
    const start = Date.now();
    vi.setSystemTime(start + 90_000);
    expect(getActivityColor(start)).toBe("#52525b");

    vi.setSystemTime(start + 120_000);
    expect(getActivityColor(start)).toBe("#52525b");
  });
});
