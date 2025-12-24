import { describe, it, expect } from "vitest";
import { getHorizontalScrollState, calculateScrollAmount } from "../horizontalScroll";

describe("getHorizontalScrollState", () => {
  describe("isOverflowing", () => {
    it("should return false when content fits (scrollWidth <= clientWidth)", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 0,
        scrollWidth: 500,
        clientWidth: 500,
      });
      expect(result.isOverflowing).toBe(false);
    });

    it("should return false when content fits with epsilon tolerance", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 0,
        scrollWidth: 501,
        clientWidth: 500,
      });
      expect(result.isOverflowing).toBe(false);
    });

    it("should return true when content overflows", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 0,
        scrollWidth: 800,
        clientWidth: 500,
      });
      expect(result.isOverflowing).toBe(true);
    });
  });

  describe("canScrollLeft", () => {
    it("should return false when at scroll start", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 0,
        scrollWidth: 800,
        clientWidth: 500,
      });
      expect(result.canScrollLeft).toBe(false);
    });

    it("should return false when within epsilon of scroll start", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 0.5,
        scrollWidth: 800,
        clientWidth: 500,
      });
      expect(result.canScrollLeft).toBe(false);
    });

    it("should return true when scrolled past start", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 50,
        scrollWidth: 800,
        clientWidth: 500,
      });
      expect(result.canScrollLeft).toBe(true);
    });

    it("should return false when no overflow even if scrollLeft is set", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 10,
        scrollWidth: 500,
        clientWidth: 500,
      });
      expect(result.canScrollLeft).toBe(false);
    });
  });

  describe("canScrollRight", () => {
    it("should return true when at scroll start with overflow", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 0,
        scrollWidth: 800,
        clientWidth: 500,
      });
      expect(result.canScrollRight).toBe(true);
    });

    it("should return true when partially scrolled with more content", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 100,
        scrollWidth: 800,
        clientWidth: 500,
      });
      expect(result.canScrollRight).toBe(true);
    });

    it("should return false when scrolled to end", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 300,
        scrollWidth: 800,
        clientWidth: 500,
      });
      expect(result.canScrollRight).toBe(false);
    });

    it("should return false when within epsilon of scroll end", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 299.5,
        scrollWidth: 800,
        clientWidth: 500,
      });
      expect(result.canScrollRight).toBe(false);
    });

    it("should return false when no overflow", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 0,
        scrollWidth: 500,
        clientWidth: 500,
      });
      expect(result.canScrollRight).toBe(false);
    });
  });

  describe("combined states", () => {
    it("should return all false when no overflow", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 0,
        scrollWidth: 300,
        clientWidth: 500,
      });
      expect(result).toEqual({
        isOverflowing: false,
        canScrollLeft: false,
        canScrollRight: false,
      });
    });

    it("should allow scroll right only when at start with overflow", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 0,
        scrollWidth: 1000,
        clientWidth: 500,
      });
      expect(result).toEqual({
        isOverflowing: true,
        canScrollLeft: false,
        canScrollRight: true,
      });
    });

    it("should allow both directions when in middle", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 250,
        scrollWidth: 1000,
        clientWidth: 500,
      });
      expect(result).toEqual({
        isOverflowing: true,
        canScrollLeft: true,
        canScrollRight: true,
      });
    });

    it("should allow scroll left only when at end", () => {
      const result = getHorizontalScrollState({
        scrollLeft: 500,
        scrollWidth: 1000,
        clientWidth: 500,
      });
      expect(result).toEqual({
        isOverflowing: true,
        canScrollLeft: true,
        canScrollRight: false,
      });
    });
  });
});

describe("calculateScrollAmount", () => {
  it("should return minimum scroll amount for small widths", () => {
    expect(calculateScrollAmount(100)).toBe(200);
    expect(calculateScrollAmount(200)).toBe(200);
  });

  it("should return 80% of width for medium widths", () => {
    expect(calculateScrollAmount(400)).toBe(320);
    expect(calculateScrollAmount(500)).toBe(400);
  });

  it("should return maximum scroll amount for large widths", () => {
    expect(calculateScrollAmount(1000)).toBe(600);
    expect(calculateScrollAmount(2000)).toBe(600);
  });

  it("should handle boundary value at 250px (200 / 0.8)", () => {
    expect(calculateScrollAmount(250)).toBe(200);
  });

  it("should handle boundary value at 750px (600 / 0.8)", () => {
    expect(calculateScrollAmount(750)).toBe(600);
  });
});
