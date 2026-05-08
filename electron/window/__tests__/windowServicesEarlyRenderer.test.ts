import { describe, expect, it } from "vitest";
import { shouldDeferRendererLoadForE2E, shouldEnableEarlyRenderer } from "../earlyRenderer.js";

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

describe("shouldDeferRendererLoadForE2E", () => {
  it("returns true only for the explicit Windows E2E deferral flag", () => {
    expect(shouldDeferRendererLoadForE2E({ env: { DAINTREE_E2E_DEFER_RENDERER_LOAD: "1" } })).toBe(
      true
    );

    for (const value of [undefined, "", "0", "true", "yes"]) {
      expect(
        shouldDeferRendererLoadForE2E({
          env: value === undefined ? {} : { DAINTREE_E2E_DEFER_RENDERER_LOAD: value },
        })
      ).toBe(false);
    }
  });
});
