import { describe, expect, it } from "vitest";
import { resolveAgentLaunchBaseCommand } from "../useAgentLauncher";
import type { AgentCliDetail } from "@shared/types";

function detail(overrides: Partial<AgentCliDetail>): AgentCliDetail {
  return {
    state: "ready",
    resolvedPath: "/opt/bin/claude",
    via: "which",
    ...overrides,
  };
}

describe("resolveAgentLaunchBaseCommand", () => {
  it("uses the availability-resolved executable path when the CLI is ready", () => {
    expect(
      resolveAgentLaunchBaseCommand("claude", detail({ resolvedPath: "/tmp/bin/claude" }))
    ).toBe("/tmp/bin/claude");
  });

  it("quotes resolved paths that need shell escaping", () => {
    // Shell-quoting uses single quotes on Unix, double quotes on Windows
    // (cmd.exe), to match the surrounding spawn shell.
    const q = process.platform === "win32" ? '"' : "'";
    expect(
      resolveAgentLaunchBaseCommand(
        "claude",
        detail({ resolvedPath: "/tmp/Daintree Test/bin/claude" })
      )
    ).toBe(`${q}/tmp/Daintree Test/bin/claude${q}`);
  });

  it("falls back to the registry command when the detail is missing or not ready", () => {
    expect(resolveAgentLaunchBaseCommand("claude", undefined)).toBe("claude");
    expect(
      resolveAgentLaunchBaseCommand(
        "claude",
        detail({ state: "missing", resolvedPath: null, via: null })
      )
    ).toBe("claude");
  });
});
