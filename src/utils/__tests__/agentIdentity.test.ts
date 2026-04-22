import { describe, expect, it } from "vitest";
import { resolveEffectiveAgentId } from "../agentIdentity";

describe("resolveEffectiveAgentId", () => {
  it("prefers detectedAgentId when both are present", () => {
    expect(resolveEffectiveAgentId("gemini", "claude")).toBe("gemini");
  });

  it("falls back to agentId when detectedAgentId is absent", () => {
    expect(resolveEffectiveAgentId(undefined, "claude")).toBe("claude");
  });

  it("returns detectedAgentId when agentId is absent", () => {
    expect(resolveEffectiveAgentId("claude", undefined)).toBe("claude");
  });

  it("returns undefined when neither is present", () => {
    expect(resolveEffectiveAgentId(undefined, undefined)).toBeUndefined();
  });
});
