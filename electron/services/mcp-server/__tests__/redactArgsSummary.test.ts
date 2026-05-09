import { describe, expect, it, vi } from "vitest";
import os from "node:os";

// TelemetryService imports `electron` and the main-process store at module
// load. Mock both so this unit test can exercise the redaction path without
// dragging in Sentry initialization or store side effects.
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/mock-userdata"),
    getVersion: vi.fn(() => "0.0.0-test"),
    getName: vi.fn(() => "daintree-test"),
    on: vi.fn(),
    isReady: vi.fn(() => true),
  },
}));

vi.mock("../../../store.js", () => ({
  store: {
    get: vi.fn(() => ({})),
    set: vi.fn(),
  },
}));

import { redactArgsSummary } from "../redactArgsSummary.js";

describe("redactArgsSummary", () => {
  it("returns the input unchanged when no path or secret is present", () => {
    expect(redactArgsSummary('{"action":"focus","panelId":"abc"}')).toBe(
      '{"action":"focus","panelId":"abc"}'
    );
  });

  it("returns an empty string unchanged", () => {
    expect(redactArgsSummary("")).toBe("");
  });

  it("substitutes the user's home directory with ~", () => {
    const home = os.homedir();
    const summary = `{"path":"${home}/projects/secret-app"}`;
    const result = redactArgsSummary(summary);
    expect(result).not.toContain(home);
    expect(result).toContain("~");
  });

  it("collapses /Users/<name>/ paths to /Users/USER/", () => {
    const result = redactArgsSummary('{"path":"/Users/alice/secret-app/file.ts"}');
    expect(result).not.toContain("/alice/");
    expect(result).toContain("/Users/USER/");
  });

  it("collapses /home/<name>/ paths to /home/USER/", () => {
    const result = redactArgsSummary('{"path":"/home/bob/keys/id_rsa"}');
    expect(result).not.toContain("/bob/");
    expect(result).toContain("/home/USER/");
  });

  it("redacts a github personal access token", () => {
    const summary = `{"token":"ghp_${"x".repeat(40)}"}`;
    const result = redactArgsSummary(summary);
    expect(result).not.toContain("ghp_");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts an Anthropic API key", () => {
    const summary = `{"apiKey":"sk-ant-${"a".repeat(95)}"}`;
    const result = redactArgsSummary(summary);
    expect(result).not.toContain("sk-ant-");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts an OpenAI API key embedded in args", () => {
    const summary = `{"key":"sk-${"A".repeat(48)}"}`;
    const result = redactArgsSummary(summary);
    expect(result).not.toContain("sk-AAAA");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts a Bearer token", () => {
    const summary = '{"auth":"Bearer abcdef0123456789"}';
    const result = redactArgsSummary(summary);
    expect(result).toContain("Bearer [REDACTED]");
  });

  it("is idempotent — running twice yields the same output", () => {
    const home = os.homedir();
    const summary = `{"path":"${home}/x","token":"ghp_${"y".repeat(40)}"}`;
    const once = redactArgsSummary(summary);
    const twice = redactArgsSummary(once);
    expect(twice).toBe(once);
  });

  it("redacts both a path and a secret in the same input", () => {
    const home = os.homedir();
    const summary = `{"path":"${home}/.aws","key":"ghp_${"z".repeat(40)}"}`;
    const result = redactArgsSummary(summary);
    expect(result).not.toContain(home);
    expect(result).not.toContain("ghp_");
    expect(result).toContain("~");
    expect(result).toContain("[REDACTED]");
  });
});
