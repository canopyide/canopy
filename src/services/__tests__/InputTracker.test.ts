import { describe, it, expect } from "vitest";

// The InputTracker and CLEAR_COMMANDS logic has been removed in favor of
// letting the shell handle clear/reset commands directly (VS Code-style).
// These tests remain only to document that behavior choice.

describe("InputTracker removal", () => {
  it("documents that clear-command detection is no longer used", () => {
    expect(true).toBe(true);
  });
});
