// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSettings } from "@shared/types";
import type { CliAvailability } from "@shared/types/ipc/system";

const setAgentPinnedMock = vi.fn().mockResolvedValue(undefined);
const toggleButtonVisibilityMock = vi.fn();

let mockAgentSettings: AgentSettings | null = null;
let mockAvailability: CliAvailability | undefined = undefined;

vi.mock("@/store/agentSettingsStore", () => ({
  useAgentSettingsStore: {
    getState: () => ({
      settings: mockAgentSettings,
      setAgentPinned: setAgentPinnedMock,
    }),
  },
}));

vi.mock("@/store/cliAvailabilityStore", () => ({
  useCliAvailabilityStore: {
    getState: () => ({ availability: mockAvailability }),
  },
}));

vi.mock("@/store/toolbarPreferencesStore", () => ({
  useToolbarPreferencesStore: {
    getState: () => ({ toggleButtonVisibility: toggleButtonVisibilityMock }),
  },
}));

import { dispatchToolbarVisibility } from "../toolbarVisibilityDispatch";

function settings(overrides: Record<string, { pinned?: boolean }>): AgentSettings {
  return { agents: overrides } as unknown as AgentSettings;
}

describe("dispatchToolbarVisibility — agent branch", () => {
  beforeEach(() => {
    setAgentPinnedMock.mockClear();
    toggleButtonVisibilityMock.mockClear();
    mockAgentSettings = null;
    mockAvailability = undefined;
  });

  it("toggles pinned=true → false when agent is currently visible", () => {
    mockAgentSettings = settings({ claude: { pinned: true } });
    dispatchToolbarVisibility("claude", "left");
    expect(setAgentPinnedMock).toHaveBeenCalledWith("claude", false);
    expect(toggleButtonVisibilityMock).not.toHaveBeenCalled();
  });

  it("toggles pinned=false → true when agent is currently hidden", () => {
    mockAgentSettings = settings({ gemini: { pinned: false } });
    dispatchToolbarVisibility("gemini", "right");
    expect(setAgentPinnedMock).toHaveBeenCalledWith("gemini", true);
  });

  it("flips tri-state undefined according to live availability (installed → hide)", () => {
    mockAgentSettings = settings({ claude: {} });
    mockAvailability = { claude: "ready" } as CliAvailability;
    dispatchToolbarVisibility("claude", "left");
    expect(setAgentPinnedMock).toHaveBeenCalledWith("claude", false);
  });

  it("flips tri-state undefined according to live availability (missing → show)", () => {
    mockAgentSettings = settings({ claude: {} });
    mockAvailability = { claude: "missing" } as CliAvailability;
    dispatchToolbarVisibility("claude", "left");
    expect(setAgentPinnedMock).toHaveBeenCalledWith("claude", true);
  });

  it("forces explicit unpin (explicitPinned=false) without reading current state", () => {
    mockAgentSettings = settings({ codex: { pinned: true } });
    dispatchToolbarVisibility("codex", "left", false);
    expect(setAgentPinnedMock).toHaveBeenCalledWith("codex", false);
  });

  it("accepts explicitPinned=true to force pinned even when currently visible", () => {
    mockAgentSettings = settings({ codex: { pinned: true } });
    dispatchToolbarVisibility("codex", "right", true);
    expect(setAgentPinnedMock).toHaveBeenCalledWith("codex", true);
  });

  it("does not call toggleButtonVisibility for agent IDs regardless of side", () => {
    dispatchToolbarVisibility("claude", "left");
    dispatchToolbarVisibility("gemini", "right");
    expect(toggleButtonVisibilityMock).not.toHaveBeenCalled();
  });
});

describe("dispatchToolbarVisibility — non-agent branch", () => {
  beforeEach(() => {
    setAgentPinnedMock.mockClear();
    toggleButtonVisibilityMock.mockClear();
  });

  it("dispatches toggleButtonVisibility for non-agent IDs (left side)", () => {
    dispatchToolbarVisibility("terminal", "left");
    expect(toggleButtonVisibilityMock).toHaveBeenCalledWith("terminal", "left");
    expect(setAgentPinnedMock).not.toHaveBeenCalled();
  });

  it("forwards the right side to toggleButtonVisibility", () => {
    dispatchToolbarVisibility("copy-tree", "right");
    expect(toggleButtonVisibilityMock).toHaveBeenCalledWith("copy-tree", "right");
  });

  it("ignores explicitPinned for non-agent IDs (still toggles via the store)", () => {
    dispatchToolbarVisibility("settings", "left", false);
    expect(toggleButtonVisibilityMock).toHaveBeenCalledWith("settings", "left");
    expect(setAgentPinnedMock).not.toHaveBeenCalled();
  });

  it("routes the agent-tray (non-agent) ID to toggleButtonVisibility", () => {
    dispatchToolbarVisibility("agent-tray", "left");
    expect(toggleButtonVisibilityMock).toHaveBeenCalledWith("agent-tray", "left");
    expect(setAgentPinnedMock).not.toHaveBeenCalled();
  });
});
