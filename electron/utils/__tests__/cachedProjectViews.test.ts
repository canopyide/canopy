import { describe, expect, it } from "vitest";

import { computeDefaultCachedViews, isValidCachedProjectViews } from "../cachedProjectViews.js";

const GIB = 1024 ** 3;

describe("computeDefaultCachedViews", () => {
  it("returns 1 for machines with 16 GiB or less", () => {
    expect(computeDefaultCachedViews(4 * GIB)).toBe(1);
    expect(computeDefaultCachedViews(8 * GIB)).toBe(1);
    expect(computeDefaultCachedViews(16 * GIB)).toBe(1);
  });

  it("returns 1 for machines between 16 and 32 GiB", () => {
    expect(computeDefaultCachedViews(24 * GIB)).toBe(1);
    expect(computeDefaultCachedViews(32 * GIB - 1)).toBe(1);
  });

  it("returns 2 at the 32 GiB threshold and up to just below 64 GiB", () => {
    expect(computeDefaultCachedViews(32 * GIB)).toBe(2);
    expect(computeDefaultCachedViews(48 * GIB)).toBe(2);
    expect(computeDefaultCachedViews(64 * GIB - 1)).toBe(2);
  });

  it("returns 3 at the 64 GiB threshold and above", () => {
    expect(computeDefaultCachedViews(64 * GIB)).toBe(3);
    expect(computeDefaultCachedViews(96 * GIB)).toBe(3);
    expect(computeDefaultCachedViews(128 * GIB)).toBe(3);
  });

  it("falls back to 1 for invalid or non-positive inputs", () => {
    expect(computeDefaultCachedViews(0)).toBe(1);
    expect(computeDefaultCachedViews(-1)).toBe(1);
    expect(computeDefaultCachedViews(Number.NaN)).toBe(1);
    expect(computeDefaultCachedViews(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("isValidCachedProjectViews", () => {
  it("accepts integers within [1, 5]", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(isValidCachedProjectViews(n)).toBe(true);
    }
  });

  it("rejects out-of-range integers", () => {
    expect(isValidCachedProjectViews(0)).toBe(false);
    expect(isValidCachedProjectViews(6)).toBe(false);
    expect(isValidCachedProjectViews(-1)).toBe(false);
  });

  it("rejects non-integer numbers and non-numbers", () => {
    expect(isValidCachedProjectViews(2.5)).toBe(false);
    expect(isValidCachedProjectViews(Number.NaN)).toBe(false);
    expect(isValidCachedProjectViews("3")).toBe(false);
    expect(isValidCachedProjectViews(null)).toBe(false);
    expect(isValidCachedProjectViews(undefined)).toBe(false);
  });
});
