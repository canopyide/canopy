// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { AgentSettings } from "@shared/types";

const hoisted = vi.hoisted(() => {
  const setAgentPinnedMock = vi.fn().mockResolvedValue(undefined);
  const toggleButtonVisibilityMock = vi.fn();
  const refs: {
    toolbar: {
      layout: { hiddenButtons: string[] };
      toggleButtonVisibility: typeof toggleButtonVisibilityMock;
    };
    agent: { settings: AgentSettings | null; setAgentPinned: typeof setAgentPinnedMock };
  } = {
    toolbar: {
      layout: { hiddenButtons: [] },
      toggleButtonVisibility: toggleButtonVisibilityMock,
    },
    agent: { settings: null, setAgentPinned: setAgentPinnedMock },
  };

  type ToolbarHook = ((selector: (s: typeof refs.toolbar) => unknown) => unknown) & {
    getState: () => typeof refs.toolbar;
  };
  const toolbarHook = ((selector: (s: typeof refs.toolbar) => unknown) =>
    selector(refs.toolbar)) as ToolbarHook;
  toolbarHook.getState = () => refs.toolbar;

  type AgentHook = ((selector: (s: typeof refs.agent) => unknown) => unknown) & {
    getState: () => typeof refs.agent;
  };
  const agentHook = ((selector: (s: typeof refs.agent) => unknown) =>
    selector(refs.agent)) as AgentHook;
  agentHook.getState = () => refs.agent;

  return { setAgentPinnedMock, toggleButtonVisibilityMock, refs, toolbarHook, agentHook };
});

const { setAgentPinnedMock, toggleButtonVisibilityMock, refs } = hoisted;

vi.mock("@/store", () => ({
  useToolbarPreferencesStore: hoisted.toolbarHook,
}));

vi.mock("@/store/agentSettingsStore", () => ({
  useAgentSettingsStore: hoisted.agentHook,
}));

vi.mock("@shared/config/agentIds", () => ({
  BUILT_IN_AGENT_IDS: ["claude", "gemini", "codex"] as const,
}));

import { useUnifiedToolbarVisibility } from "../useUnifiedToolbarVisibility";

function agentSettings(overrides: Record<string, { pinned?: boolean }>): AgentSettings {
  return { agents: overrides } as unknown as AgentSettings;
}

function setAgentSettings(s: AgentSettings | null) {
  refs.agent.settings = s;
}

function setHiddenButtons(ids: string[]) {
  refs.toolbar.layout = { hiddenButtons: ids };
}

describe("useUnifiedToolbarVisibility", () => {
  beforeEach(() => {
    setAgentPinnedMock.mockClear();
    toggleButtonVisibilityMock.mockClear();
    setAgentSettings(null);
    setHiddenButtons([]);
  });

  describe("isEffectivelyVisible", () => {
    it("reads agent IDs from agentSettings.pinned", () => {
      setAgentSettings(
        agentSettings({
          claude: { pinned: true },
          gemini: { pinned: false },
        })
      );
      const { result } = renderHook(() => useUnifiedToolbarVisibility());

      expect(result.current.isEffectivelyVisible("claude")).toBe(true);
      expect(result.current.isEffectivelyVisible("gemini")).toBe(false);
    });

    it("ignores hiddenButtons for agent IDs (agentSettingsStore wins)", () => {
      setHiddenButtons(["claude"]);
      setAgentSettings(agentSettings({ claude: { pinned: true } }));
      const { result } = renderHook(() => useUnifiedToolbarVisibility());

      expect(result.current.isEffectivelyVisible("claude")).toBe(true);
    });

    it("reads non-agent IDs from hiddenButtons", () => {
      setHiddenButtons(["terminal"]);
      const { result } = renderHook(() => useUnifiedToolbarVisibility());

      expect(result.current.isEffectivelyVisible("terminal")).toBe(false);
      expect(result.current.isEffectivelyVisible("browser")).toBe(true);
    });

    it("treats null agentSettings as all-unpinned", () => {
      setAgentSettings(null);
      const { result } = renderHook(() => useUnifiedToolbarVisibility());

      expect(result.current.isEffectivelyVisible("claude")).toBe(false);
      expect(result.current.isEffectivelyVisible("agent-tray")).toBe(true);
    });

    it("treats missing pinned field as not visible (opt-in semantics)", () => {
      setAgentSettings(agentSettings({ codex: {} }));
      const { result } = renderHook(() => useUnifiedToolbarVisibility());

      expect(result.current.isEffectivelyVisible("codex")).toBe(false);
    });
  });

  describe("toggleVisibility", () => {
    it("routes agent toggles through setAgentPinned, not toggleButtonVisibility", () => {
      setAgentSettings(agentSettings({ claude: { pinned: true } }));
      const { result } = renderHook(() => useUnifiedToolbarVisibility());

      act(() => result.current.toggleVisibility("claude", "left"));

      expect(setAgentPinnedMock).toHaveBeenCalledTimes(1);
      expect(setAgentPinnedMock).toHaveBeenCalledWith("claude", false);
      expect(toggleButtonVisibilityMock).not.toHaveBeenCalled();
    });

    it("flips agent from unpinned to pinned", () => {
      setAgentSettings(agentSettings({ gemini: { pinned: false } }));
      const { result } = renderHook(() => useUnifiedToolbarVisibility());

      act(() => result.current.toggleVisibility("gemini", "left"));

      expect(setAgentPinnedMock).toHaveBeenCalledWith("gemini", true);
    });

    it("routes non-agent toggles through toggleButtonVisibility with side", () => {
      const { result } = renderHook(() => useUnifiedToolbarVisibility());

      act(() => result.current.toggleVisibility("terminal", "left"));
      act(() => result.current.toggleVisibility("settings", "right"));

      expect(toggleButtonVisibilityMock).toHaveBeenCalledTimes(2);
      expect(toggleButtonVisibilityMock).toHaveBeenNthCalledWith(1, "terminal", "left");
      expect(toggleButtonVisibilityMock).toHaveBeenNthCalledWith(2, "settings", "right");
      expect(setAgentPinnedMock).not.toHaveBeenCalled();
    });

    it("reads pinned state via getState (not the render-time closure)", () => {
      // Render with claude unpinned. Before toggling, mutate the store so the
      // closure-captured value diverges from the latest state. The toggle
      // must read the fresh value to flip correctly.
      setAgentSettings(agentSettings({ claude: { pinned: false } }));
      const { result } = renderHook(() => useUnifiedToolbarVisibility());

      setAgentSettings(agentSettings({ claude: { pinned: true } }));

      act(() => result.current.toggleVisibility("claude", "left"));

      // With fresh read, pinned: true → flip to false. A stale closure read
      // would flip from false → true (wrong).
      expect(setAgentPinnedMock).toHaveBeenCalledWith("claude", false);
    });

    it("treats agent-tray as a non-agent button (routes through toggleButtonVisibility)", () => {
      const { result } = renderHook(() => useUnifiedToolbarVisibility());

      act(() => result.current.toggleVisibility("agent-tray", "left"));

      expect(toggleButtonVisibilityMock).toHaveBeenCalledWith("agent-tray", "left");
      expect(setAgentPinnedMock).not.toHaveBeenCalled();
    });
  });
});
