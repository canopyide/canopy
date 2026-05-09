import { describe, expect, it } from "vitest";
import {
  MCP_ARGS_INLINE_STRING_LIMIT,
  MCP_ARGS_SUMMARY_LIMIT,
  summarizeMcpArgs,
} from "../mcpArgsSummary.js";

describe("summarizeMcpArgs", () => {
  it("returns null for null and undefined inputs", () => {
    expect(summarizeMcpArgs(null)).toBe("null");
    expect(summarizeMcpArgs(undefined)).toBe("null");
  });

  it("collapses long strings to a length placeholder", () => {
    const long = "x".repeat(MCP_ARGS_INLINE_STRING_LIMIT + 10);
    const out = summarizeMcpArgs({ note: long });
    expect(out).toContain(`<string: ${long.length} chars>`);
    expect(out).not.toContain("xxx");
  });

  it("collapses nested objects to <object>", () => {
    const out = summarizeMcpArgs({ args: { deep: { value: 1 } } });
    expect(out).toBe('{"args":"<object>"}');
  });

  it("excludes the _meta field entirely", () => {
    const out = summarizeMcpArgs({ toolId: "x", _meta: { secret: "abc" } });
    expect(out).toBe('{"toolId":"x"}');
  });

  it("redacts short string values keyed under sensitive names", () => {
    const out = summarizeMcpArgs({
      token: "abc123",
      apiKey: "sk-xyz",
      password: "hunter2",
      authToken: "Bearer xyz",
      credential: "x",
      bearerToken: "x",
      api_key: "x",
    });
    expect(out).toContain('"token":"<redacted>"');
    expect(out).toContain('"apiKey":"<redacted>"');
    expect(out).toContain('"password":"<redacted>"');
    expect(out).toContain('"authToken":"<redacted>"');
    expect(out).toContain('"credential":"<redacted>"');
    expect(out).toContain('"bearerToken":"<redacted>"');
    expect(out).toContain('"api_key":"<redacted>"');
  });

  it("redacts conservatively on key names that contain a sensitive substring", () => {
    // Substring matching is intentional: `tokenizer` contains `token`,
    // `keyword` contains `key`. Erring toward false positives keeps short
    // secret values from slipping through under unfamiliar argument names.
    const out = summarizeMcpArgs({ tokenizer: "ok", keyword: "ok" });
    expect(out).toContain('"tokenizer":"<redacted>"');
    expect(out).toContain('"keyword":"<redacted>"');
  });

  it("does not redact non-string values under sensitive keys", () => {
    const out = summarizeMcpArgs({ tokenCount: 42, hasKey: true });
    expect(out).toContain('"tokenCount":42');
    expect(out).toContain('"hasKey":true');
  });

  it("does not redact empty strings (callers pass through)", () => {
    const out = summarizeMcpArgs({ token: "" });
    expect(out).toBe('{"token":""}');
  });

  it("does not redact non-sensitive keys with similarly-named substrings", () => {
    // `tool` and `path` and `query` should not match the sensitive pattern.
    const out = summarizeMcpArgs({ tool: "hello", path: "/tmp", query: "world" });
    expect(out).not.toContain("<redacted>");
  });

  it("truncates the serialized summary at MCP_ARGS_SUMMARY_LIMIT", () => {
    const big: Record<string, string> = {};
    for (let i = 0; i < 100; i += 1) {
      big[`key${i}`] = "v";
    }
    const out = summarizeMcpArgs(big);
    expect(out.length).toBeLessThanOrEqual(MCP_ARGS_SUMMARY_LIMIT);
    expect(out.endsWith("…")).toBe(true);
  });

  it("inlines short non-sensitive string values verbatim", () => {
    const out = summarizeMcpArgs({ name: "hello" });
    expect(out).toBe('{"name":"hello"}');
  });
});
