// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeAgentSelection } from "../agentSettingsStore";
import type { AgentSettings } from "@shared/types";

describe("normalizeAgentSelection", () => {
  const makeSettings = (agents: Record<string, { pinned?: boolean }>): AgentSettings => ({
    agents: Object.fromEntries(
      Object.entries(agents).map(([id, overrides]) => [
        id,
        { customFlags: "", dangerousArgs: "", dangerousEnabled: false, ...overrides },
      ])
    ),
  });

  it("preserves explicit pinned: true and pinned: false", () => {
    const settings = makeSettings({
      claude: { pinned: false },
      gemini: { pinned: true },
    });
    const result = normalizeAgentSelection(settings);
    expect(result.agents.claude.pinned).toBe(false);
    expect(result.agents.gemini.pinned).toBe(true);
  });

  it("seeds pinned: false for registered agents with no stored pinned value", () => {
    const settings = makeSettings({
      claude: {},
      gemini: {},
    });
    const result = normalizeAgentSelection(settings);
    expect(result.agents.claude.pinned).toBe(false);
    expect(result.agents.gemini.pinned).toBe(false);
  });

  it("returns same reference when no changes are needed", () => {
    const settings = makeSettings({
      claude: { pinned: true },
      gemini: { pinned: false },
    });
    const result = normalizeAgentSelection(settings);
    expect(result).toBe(settings);
  });
});
