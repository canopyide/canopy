import { describe, it, expect } from "vitest";

// Tests the pure logic introduced in #7454 — capturing compiler bailout
// reasons and categories. Mirrors the lint-ratchet.test.mjs pattern: extract
// the logic under test inline, no shell-out, no script import.

/**
 * Mirrors `summarizePipelineError` in vite.config.ts. Trims to first line,
 * caps at 200 chars, tolerates null/undefined.
 */
function summarizePipelineError(data) {
  return String(data ?? "")
    .split(/\r?\n/)[0]
    .slice(0, 200);
}

/**
 * Mirrors the writeBaseline reconstruction in check-compiler-budget.mjs.
 * Explicit field list (not spread) — prevents unintended propagation of
 * future report fields into the baseline.
 */
function reconstructBaselineEntry(e) {
  return {
    success: e.success,
    skip: e.skip,
    error: e.error,
    pipeline: e.pipeline,
    errorBailouts: Array.isArray(e.errorBailouts) ? e.errorBailouts : [],
    skipReasons: Array.isArray(e.skipReasons) ? e.skipReasons : [],
    pipelineErrors: Array.isArray(e.pipelineErrors) ? e.pipelineErrors : [],
  };
}

/**
 * Mirrors the validateShape COUNT_KEYS check — extra fields are tolerated;
 * only the four counts must be present and valid non-negative finite numbers.
 */
const COUNT_KEYS = ["success", "skip", "error", "pipeline"];
function entryShapeError(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "not-object";
  for (const key of COUNT_KEYS) {
    const v = entry[key];
    if (typeof v !== "number" || v < 0 || !Number.isFinite(v)) return `invalid-${key}`;
  }
  return null;
}

describe("summarizePipelineError", () => {
  it("returns empty string for null", () => {
    expect(summarizePipelineError(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(summarizePipelineError(undefined)).toBe("");
  });

  it("returns the input unchanged for short single-line input", () => {
    expect(summarizePipelineError("boom")).toBe("boom");
  });

  it("strips everything after the first newline (LF)", () => {
    expect(summarizePipelineError("ValidationError: foo\n  at bar (baz.ts:1:2)")).toBe(
      "ValidationError: foo"
    );
  });

  it("strips everything after the first newline (CRLF)", () => {
    expect(summarizePipelineError("ValidationError: foo\r\n  at bar")).toBe("ValidationError: foo");
  });

  it("caps single-line input at 200 characters", () => {
    const long = "x".repeat(500);
    const result = summarizePipelineError(long);
    expect(result.length).toBe(200);
    expect(result).toBe("x".repeat(200));
  });

  it("caps the first line, ignoring later lines, at 200 chars", () => {
    const first = "y".repeat(300);
    const input = `${first}\nsecond line`;
    const result = summarizePipelineError(input);
    expect(result.length).toBe(200);
    expect(result).toBe("y".repeat(200));
  });

  it("coerces non-string inputs via String()", () => {
    expect(summarizePipelineError(42)).toBe("42");
  });
});

describe("writeBaseline reconstruction", () => {
  it("preserves all four count keys", () => {
    const result = reconstructBaselineEntry({
      success: 3,
      skip: 1,
      error: 2,
      pipeline: 0,
    });
    expect(result.success).toBe(3);
    expect(result.skip).toBe(1);
    expect(result.error).toBe(2);
    expect(result.pipeline).toBe(0);
  });

  it("preserves diagnostic arrays from the report", () => {
    const result = reconstructBaselineEntry({
      success: 0,
      skip: 1,
      error: 1,
      pipeline: 1,
      errorBailouts: [{ category: "Hooks", reason: "called conditionally" }],
      skipReasons: ["Skipped due to 'use no memo' directive."],
      pipelineErrors: ["Internal error: boom"],
    });
    expect(result.errorBailouts).toEqual([{ category: "Hooks", reason: "called conditionally" }]);
    expect(result.skipReasons).toEqual(["Skipped due to 'use no memo' directive."]);
    expect(result.pipelineErrors).toEqual(["Internal error: boom"]);
  });

  it("defaults missing diagnostic arrays to [] (legacy report)", () => {
    const result = reconstructBaselineEntry({ success: 1, skip: 0, error: 0, pipeline: 0 });
    expect(result.errorBailouts).toEqual([]);
    expect(result.skipReasons).toEqual([]);
    expect(result.pipelineErrors).toEqual([]);
  });

  it("coerces non-array diagnostic fields to [] (defense in depth)", () => {
    const result = reconstructBaselineEntry({
      success: 1,
      skip: 0,
      error: 0,
      pipeline: 0,
      errorBailouts: "not an array",
      skipReasons: null,
      pipelineErrors: undefined,
    });
    expect(result.errorBailouts).toEqual([]);
    expect(result.skipReasons).toEqual([]);
    expect(result.pipelineErrors).toEqual([]);
  });

  it("does not propagate unknown report fields into the baseline", () => {
    const result = reconstructBaselineEntry({
      success: 1,
      skip: 0,
      error: 0,
      pipeline: 0,
      futureField: "should not appear",
    });
    expect(Object.prototype.hasOwnProperty.call(result, "futureField")).toBe(false);
  });
});

describe("validateShape tolerance", () => {
  it("accepts an entry with only the four count keys", () => {
    expect(entryShapeError({ success: 1, skip: 0, error: 0, pipeline: 0 })).toBeNull();
  });

  it("accepts an entry with the new diagnostic arrays alongside counts", () => {
    expect(
      entryShapeError({
        success: 1,
        skip: 1,
        error: 1,
        pipeline: 0,
        errorBailouts: [{ category: "Refs", reason: "x" }],
        skipReasons: ["y"],
        pipelineErrors: [],
      })
    ).toBeNull();
  });

  it("rejects an entry missing a count key", () => {
    expect(entryShapeError({ success: 1, skip: 0, error: 0 })).toBe("invalid-pipeline");
  });

  it("rejects negative counts", () => {
    expect(entryShapeError({ success: -1, skip: 0, error: 0, pipeline: 0 })).toBe(
      "invalid-success"
    );
  });

  it("rejects non-numeric counts", () => {
    expect(entryShapeError({ success: "1", skip: 0, error: 0, pipeline: 0 })).toBe(
      "invalid-success"
    );
  });

  it("rejects Infinity counts", () => {
    expect(entryShapeError({ success: Infinity, skip: 0, error: 0, pipeline: 0 })).toBe(
      "invalid-success"
    );
  });
});
