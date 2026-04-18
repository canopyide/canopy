import { describe, expect, it } from "vitest";
import type { CliAvailability } from "@shared/types";
import { computeConvertToAgentIds } from "../convertToAgentFilter";

const AGENT_IDS = ["claude", "gemini", "codex"] as const;

function availability(overrides: Partial<Record<string, string>>): CliAvailability {
  return {
    claude: "missing",
    gemini: "missing",
    codex: "missing",
    ...overrides,
  } as unknown as CliAvailability;
}

describe("computeConvertToAgentIds (issue #5360)", () => {
  it("returns undefined (show all) while availability is not yet probed", () => {
    // Matches the show-all contract used by `computeGridSelectedAgentIds`:
    // the menu must not flash empty during the initial detection race.
    expect(computeConvertToAgentIds(false, availability({}), AGENT_IDS, null)).toBeUndefined();
  });

  it("returns undefined when agentAvailability is legitimately undefined", () => {
    expect(computeConvertToAgentIds(true, undefined, AGENT_IDS, null)).toBeUndefined();
  });

  it("filters to installed agents once availability is initialized", () => {
    const result = computeConvertToAgentIds(
      true,
      availability({ claude: "ready", gemini: "installed", codex: "missing" }),
      AGENT_IDS,
      null
    );
    expect(result).toEqual(["claude", "gemini"]);
  });

  it("keeps the current agent visible even if it becomes uninstalled", () => {
    // Covers the edge case where the CLI is uninstalled out from under a
    // running agent terminal — the panel should still show its own row so
    // the user can see what they're on and convert away from it.
    const result = computeConvertToAgentIds(
      true,
      availability({ claude: "missing", gemini: "ready" }),
      AGENT_IDS,
      "claude"
    );
    expect(result).toEqual(["claude", "gemini"]);
  });

  it("returns an empty list when nothing is installed and there is no current agent", () => {
    const result = computeConvertToAgentIds(true, availability({}), AGENT_IDS, null);
    expect(result).toEqual([]);
  });

  it("preserves input order", () => {
    const result = computeConvertToAgentIds(
      true,
      availability({ claude: "ready", gemini: "ready", codex: "ready" }),
      ["codex", "claude", "gemini"],
      null
    );
    expect(result).toEqual(["codex", "claude", "gemini"]);
  });
});
