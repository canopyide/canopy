import { describe, expect, it } from "vitest";
import { shouldEnableEarlyRenderer } from "../earlyRenderer.js";

describe("shouldEnableEarlyRenderer", () => {
  it("returns true when DAINTREE_EARLY_RENDERER is unset (default on)", () => {
    expect(shouldEnableEarlyRenderer({ isSmokeTest: false, env: {} })).toBe(true);
  });

  it("returns false when DAINTREE_EARLY_RENDERER=0 (opt-out)", () => {
    expect(
      shouldEnableEarlyRenderer({
        isSmokeTest: false,
        env: { DAINTREE_EARLY_RENDERER: "0" },
      })
    ).toBe(false);
  });

  it("returns true for non-zero values", () => {
    for (const value of ["1", "true", "yes", "on", ""]) {
      expect(
        shouldEnableEarlyRenderer({
          isSmokeTest: false,
          env: { DAINTREE_EARLY_RENDERER: value },
        })
      ).toBe(true);
    }
  });

  it("returns false in smoke-test mode regardless of DAINTREE_EARLY_RENDERER", () => {
    // Smoke tests assert deterministic readiness — keep them on the serial path.
    expect(
      shouldEnableEarlyRenderer({
        isSmokeTest: true,
        env: {},
      })
    ).toBe(false);
    expect(
      shouldEnableEarlyRenderer({
        isSmokeTest: true,
        env: { DAINTREE_EARLY_RENDERER: "1" },
      })
    ).toBe(false);
  });
});
