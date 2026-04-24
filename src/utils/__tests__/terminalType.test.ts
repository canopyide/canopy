import { describe, expect, it } from "vitest";
import {
  getBuiltInRuntimeAgentId,
  getRuntimeAgentId,
  getRuntimeOrBootAgentId,
  isAgentTerminal,
} from "../terminalType";

describe("isAgentTerminal", () => {
  it("uses runtimeIdentity before legacy detectedAgentId fallback", () => {
    expect(
      isAgentTerminal({
        detectedAgentId: "claude",
        runtimeIdentity: {
          kind: "process",
          id: "npm",
          iconId: "npm",
          processId: "npm",
        },
      })
    ).toBe(false);
  });

  it("falls back to detectedAgentId for legacy terminal records", () => {
    expect(isAgentTerminal({ detectedAgentId: "claude" })).toBe(true);
  });
});

describe("runtime agent identity helpers", () => {
  it("returns runtime identity before legacy detectedAgentId fallback", () => {
    expect(
      getRuntimeAgentId({
        detectedAgentId: "claude",
        runtimeIdentity: {
          kind: "agent",
          id: "codex",
          iconId: "codex",
          agentId: "codex",
        },
      })
    ).toBe("codex");
  });

  it("does not treat process runtime identity as an agent", () => {
    expect(
      getRuntimeAgentId({
        detectedAgentId: "claude",
        runtimeIdentity: {
          kind: "process",
          id: "npm",
          iconId: "npm",
          processId: "npm",
        },
      })
    ).toBeUndefined();
  });

  it("uses launch intent only as a boot-window fallback", () => {
    expect(getRuntimeOrBootAgentId({ launchAgentId: "claude" })).toBe("claude");
    expect(
      getRuntimeOrBootAgentId({
        launchAgentId: "claude",
        everDetectedAgent: true,
      })
    ).toBeUndefined();
  });

  it("narrows runtime agent ids to built-ins", () => {
    expect(getBuiltInRuntimeAgentId({ detectedAgentId: "claude" })).toBe("claude");
    expect(getBuiltInRuntimeAgentId({ detectedAgentId: "custom-agent" })).toBeUndefined();
  });
});
