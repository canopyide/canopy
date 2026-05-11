import { describe, it, expect } from "vitest";

// Tests the severity filter logic extracted from find-critical-compiler-errors.mjs.
// The filter normalizes CompileError events (which may carry a single
// CompilerErrorDetail or a CompilerDiagnostic with multiple .details entries)
// into a flat array of Error-severity items. Each Error-severity detail
// produces a { line, reason } entry; non-Error severities are skipped.

/**
 * Mirrors the logger.logEvent severity filter in
 * scripts/find-critical-compiler-errors.mjs. Returns an array of { line,
 * reason } for every Error-severity diagnostic within the event.
 */
function extractCriticalErrorDetails(event) {
  if (!event || event.kind !== "CompileError") return [];
  const detail = event.detail;
  if (!detail) return [];
  const details = Array.isArray(detail.details) ? detail.details : [detail];
  const results = [];
  for (const d of details) {
    if (!d || d.severity !== "Error") continue;
    const loc = d.loc ?? event.fnLoc;
    const line = loc?.start?.line ?? "?";
    const reason = d.reason ?? d.description ?? detail.reason ?? detail.description ?? "(unknown)";
    results.push({ line, reason });
  }
  return results;
}

describe("extractCriticalErrorDetails", () => {
  it("returns empty array for non-CompileError events", () => {
    expect(extractCriticalErrorDetails({ kind: "CompileSuccess" })).toEqual([]);
    expect(extractCriticalErrorDetails(null)).toEqual([]);
    expect(extractCriticalErrorDetails(undefined)).toEqual([]);
  });

  it("returns empty array when detail is missing", () => {
    expect(extractCriticalErrorDetails({ kind: "CompileError" })).toEqual([]);
    expect(extractCriticalErrorDetails({ kind: "CompileError", detail: null })).toEqual([]);
  });

  it("returns empty array when no detail has Error severity", () => {
    expect(
      extractCriticalErrorDetails({
        kind: "CompileError",
        detail: { severity: "Todo", reason: "Handle Import expressions" },
      })
    ).toEqual([]);
  });

  it("extracts a single CompilerErrorDetail with Error severity", () => {
    const result = extractCriticalErrorDetails({
      kind: "CompileError",
      detail: { severity: "Error", reason: "Mutating a ref", loc: { start: { line: 42 } } },
    });
    expect(result).toEqual([{ line: 42, reason: "Mutating a ref" }]);
  });

  it("extracts only Error-severity entries from a CompilerDiagnostic", () => {
    const result = extractCriticalErrorDetails({
      kind: "CompileError",
      detail: {
        details: [
          { severity: "Todo", reason: "Handle Import expressions", loc: { start: { line: 10 } } },
          { severity: "Error", reason: "Mutating a ref", loc: { start: { line: 42 } } },
          { severity: "Hint", reason: "Consider memoizing", loc: { start: { line: 50 } } },
        ],
      },
    });
    expect(result).toEqual([{ line: 42, reason: "Mutating a ref" }]);
  });

  it("extracts multiple Error-severity entries from a CompilerDiagnostic", () => {
    const result = extractCriticalErrorDetails({
      kind: "CompileError",
      detail: {
        details: [
          { severity: "Error", reason: "First error", loc: { start: { line: 10 } } },
          { severity: "Error", reason: "Second error", loc: { start: { line: 20 } } },
        ],
      },
    });
    expect(result).toEqual([
      { line: 10, reason: "First error" },
      { line: 20, reason: "Second error" },
    ]);
  });

  it("falls back to fnLoc when detail has no loc", () => {
    const result = extractCriticalErrorDetails({
      kind: "CompileError",
      detail: { severity: "Error", reason: "No specific loc" },
      fnLoc: { start: { line: 99 } },
    });
    expect(result).toEqual([{ line: 99, reason: "No specific loc" }]);
  });

  it("falls back to '?' when no loc is available at all", () => {
    const result = extractCriticalErrorDetails({
      kind: "CompileError",
      detail: { severity: "Error", reason: "Nowhere" },
    });
    expect(result).toEqual([{ line: "?", reason: "Nowhere" }]);
  });

  it("prefers description over reason when reason is absent (CompilerDiagnostic shape)", () => {
    const result = extractCriticalErrorDetails({
      kind: "CompileError",
      detail: {
        details: [
          { severity: "Error", description: "From description field", loc: { start: { line: 5 } } },
        ],
      },
    });
    expect(result).toEqual([{ line: 5, reason: "From description field" }]);
  });

  it("falls back to parent detail.reason for entries missing their own reason", () => {
    const result = extractCriticalErrorDetails({
      kind: "CompileError",
      detail: {
        reason: "Parent reason",
        details: [{ severity: "Error", loc: { start: { line: 3 } } }],
      },
    });
    expect(result).toEqual([{ line: 3, reason: "Parent reason" }]);
  });

  it("handles mixed missing loc references in multiple entries", () => {
    const result = extractCriticalErrorDetails({
      kind: "CompileError",
      detail: {
        details: [
          { severity: "Error", reason: "Has loc", loc: { start: { line: 12 } } },
          { severity: "Error", reason: "No loc" },
        ],
      },
      fnLoc: { start: { line: 77 } },
    });
    expect(result).toEqual([
      { line: 12, reason: "Has loc" },
      { line: 77, reason: "No loc" },
    ]);
  });
});
