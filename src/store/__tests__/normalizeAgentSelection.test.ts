// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeAgentSelection } from "../agentSettingsStore";
import { getEffectiveAgentIds } from "../../../shared/config/agentRegistry";
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

  it("seeds pinned: true for registered agents with no stored pinned value", () => {
    const settings = makeSettings({
      claude: {},
      gemini: {},
    });
    const result = normalizeAgentSelection(settings);
    expect(result.agents.claude.pinned).toBe(true);
    expect(result.agents.gemini.pinned).toBe(true);
  });

  it("creates pinned: true entries for registered agents missing from stored settings", () => {
    const settings: AgentSettings = { agents: {} };
    const result = normalizeAgentSelection(settings);

    for (const id of getEffectiveAgentIds()) {
      expect(result.agents[id]).toEqual({ pinned: true });
    }
  });

  it("returns same reference when no changes are needed", () => {
    const settings: AgentSettings = {
      agents: Object.fromEntries(
        getEffectiveAgentIds().map((id) => [
          id,
          { customFlags: "", dangerousArgs: "", dangerousEnabled: false, pinned: true },
        ])
      ),
    };
    const result = normalizeAgentSelection(settings);
    expect(result).toBe(settings);
  });
});
