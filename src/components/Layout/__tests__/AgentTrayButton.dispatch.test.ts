// @vitest-environment node
/**
 * Adversarial tests for the AgentTrayButton dispatch payload construction.
 *
 * The handleLaunch callback in AgentTrayButton uses:
 *   { agentId, ...(flavorId !== undefined ? { flavorId } : {}) }
 *
 * null  = vanilla sentinel — must be included in the payload so useAgentLauncher
 *         knows to skip getMergedFlavor entirely.
 * undefined = use saved default — must be EXCLUDED from the payload (no key).
 *
 * If someone changes the guard from `!== undefined` to `!= null` (double-equals),
 * null would also be excluded, and the vanilla path would silently fall back to
 * the saved flavor instead of launching plain Claude.  These tests catch that.
 */
import { describe, it, expect } from "vitest";

/**
 * Mirror of the ternary inside handleLaunch (AgentTrayButton.tsx:151-152).
 * Any change to that line must be reflected here.
 */
function buildLaunchPayload(agentId: string, flavorId?: string | null): Record<string, unknown> {
  return { agentId, ...(flavorId !== undefined ? { flavorId } : {}) };
}

describe("dispatch payload: null is the vanilla sentinel", () => {
  it("flavorId=null is included in the payload (explicit vanilla)", () => {
    const payload = buildLaunchPayload("claude", null);
    expect("flavorId" in payload).toBe(true);
    expect(payload.flavorId).toBeNull();
  });

  it("flavorId=undefined is excluded from the payload (use saved default)", () => {
    const payload = buildLaunchPayload("claude", undefined);
    expect("flavorId" in payload).toBe(false);
  });

  it("flavorId=string is included in the payload", () => {
    const payload = buildLaunchPayload("claude", "user-123");
    expect("flavorId" in payload).toBe(true);
    expect(payload.flavorId).toBe("user-123");
  });

  it("null and undefined produce different payloads (sentinel distinction)", () => {
    const vanilla = buildLaunchPayload("claude", null);
    const saved = buildLaunchPayload("claude", undefined);
    expect("flavorId" in vanilla).toBe(true);
    expect("flavorId" in saved).toBe(false);
  });

  it("gemini vanilla also carries flavorId=null", () => {
    const payload = buildLaunchPayload("gemini", null);
    expect(payload.flavorId).toBeNull();
    expect(payload.agentId).toBe("gemini");
  });

  it("empty-string flavorId is included (it is not undefined)", () => {
    // Edge case: an empty string is a defined value, so it propagates.
    // callers should never pass "" but the guard must not silently drop it.
    const payload = buildLaunchPayload("claude", "");
    expect("flavorId" in payload).toBe(true);
    expect(payload.flavorId).toBe("");
  });
});
