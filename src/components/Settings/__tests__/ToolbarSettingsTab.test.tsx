// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { AgentSettings } from "@shared/types";

interface ToolbarStateShape {
  layout: {
    leftButtons: string[];
    rightButtons: string[];
    hiddenButtons: string[];
  };
  launcher: {
    alwaysShowDevServer: boolean;
    defaultSelection?: string;
  };
  setLeftButtons: ReturnType<typeof vi.fn>;
  setRightButtons: ReturnType<typeof vi.fn>;
  toggleButtonVisibility: ReturnType<typeof vi.fn>;
  setAlwaysShowDevServer: ReturnType<typeof vi.fn>;
  setDefaultSelection: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
}

const hoisted = vi.hoisted(() => {
  const setLeftButtonsMock = vi.fn();
  const setRightButtonsMock = vi.fn();
  const toggleButtonVisibilityMock = vi.fn();
  const setAlwaysShowDevServerMock = vi.fn();
  const setDefaultSelectionMock = vi.fn();
  const resetMock = vi.fn();
  const setAgentPinnedMock = vi.fn().mockResolvedValue(undefined);

  const toolbarState = {
    layout: {
      leftButtons: [] as string[],
      rightButtons: [] as string[],
      hiddenButtons: [] as string[],
    },
    launcher: { alwaysShowDevServer: false, defaultSelection: undefined as string | undefined },
    setLeftButtons: setLeftButtonsMock,
    setRightButtons: setRightButtonsMock,
    toggleButtonVisibility: toggleButtonVisibilityMock,
    setAlwaysShowDevServer: setAlwaysShowDevServerMock,
    setDefaultSelection: setDefaultSelectionMock,
    reset: resetMock,
  };

  const agentSlice = {
    settings: null as AgentSettings | null,
    setAgentPinned: setAgentPinnedMock,
  };

  type ToolbarHook = ((selector: (s: typeof toolbarState) => unknown) => unknown) & {
    getState: () => typeof toolbarState;
  };
  const toolbarHook = ((selector: (s: typeof toolbarState) => unknown) =>
    selector(toolbarState)) as ToolbarHook;
  toolbarHook.getState = () => toolbarState;

  type AgentHook = ((selector: (s: typeof agentSlice) => unknown) => unknown) & {
    getState: () => typeof agentSlice;
  };
  const agentHook = ((selector: (s: typeof agentSlice) => unknown) =>
    selector(agentSlice)) as AgentHook;
  agentHook.getState = () => agentSlice;

  return {
    toolbarState,
    agentSlice,
    toolbarHook,
    agentHook,
    setLeftButtonsMock,
    setRightButtonsMock,
    toggleButtonVisibilityMock,
    setAlwaysShowDevServerMock,
    setDefaultSelectionMock,
    resetMock,
    setAgentPinnedMock,
  };
});

const {
  toolbarState,
  agentSlice,
  setLeftButtonsMock,
  setRightButtonsMock,
  toggleButtonVisibilityMock,
  setAlwaysShowDevServerMock,
  setDefaultSelectionMock,
  resetMock,
  setAgentPinnedMock,
} = hoisted;

vi.mock("@/store", () => ({
  useToolbarPreferencesStore: hoisted.toolbarHook,
}));

vi.mock("@/store/agentSettingsStore", () => ({
  useAgentSettingsStore: hoisted.agentHook,
}));

vi.mock("@shared/config/agentIds", () => ({
  BUILT_IN_AGENT_IDS: ["claude", "gemini", "codex"] as const,
}));

vi.mock("@/config/agents", () => ({
  getAgentConfig: (id: string) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    icon: () => null,
  }),
}));

vi.mock("@/hooks/usePluginToolbarButtons", () => ({
  usePluginToolbarButtons: () => ({ buttonIds: [], configs: new Map() }),
}));

// @dnd-kit renders a sortable context plus listeners for each row. For unit
// tests we only care about the rendered rows and the checkbox toggle paths —
// stub the context and sortable hook so drag behavior doesn't need a real DOM.
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: () => [],
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));

vi.mock("../SettingsSection", () => ({
  SettingsSection: ({
    children,
    description,
    title,
  }: {
    children: React.ReactNode;
    description?: string;
    title?: string;
  }) => (
    <section data-testid={`section-${title}`} data-description={description}>
      {children}
    </section>
  ),
}));

vi.mock("../SettingsSwitchCard", () => ({
  SettingsSwitchCard: () => null,
}));

import { ToolbarSettingsTab } from "../ToolbarSettingsTab";

function agentSettings(overrides: Record<string, { pinned?: boolean }>): AgentSettings {
  return { agents: overrides } as unknown as AgentSettings;
}

function setLayout(layout: ToolbarStateShape["layout"]) {
  toolbarState.layout = layout;
}

function setAgentSettings(s: AgentSettings | null) {
  agentSlice.settings = s;
}

describe("ToolbarSettingsTab — agent visibility routing", () => {
  beforeEach(() => {
    setLeftButtonsMock.mockClear();
    setRightButtonsMock.mockClear();
    toggleButtonVisibilityMock.mockClear();
    setAlwaysShowDevServerMock.mockClear();
    setDefaultSelectionMock.mockClear();
    resetMock.mockClear();
    setAgentPinnedMock.mockClear();

    setLayout({
      // Mix of agent IDs and non-agent IDs so we can test both branches.
      leftButtons: ["agent-tray", "claude", "gemini", "terminal"],
      rightButtons: ["copy-tree", "settings"],
      hiddenButtons: [],
    });
    toolbarState.launcher = { alwaysShowDevServer: false, defaultSelection: undefined };
    setAgentSettings(null);
  });

  it("shows agent rows as checked when pinned in agentSettingsStore", () => {
    setAgentSettings(
      agentSettings({
        claude: { pinned: true },
        gemini: { pinned: false },
      })
    );

    const { getByLabelText } = render(<ToolbarSettingsTab />);

    const claudeCheckbox = getByLabelText("Toggle Claude Agent visibility") as HTMLInputElement;
    const geminiCheckbox = getByLabelText("Toggle Gemini Agent visibility") as HTMLInputElement;
    expect(claudeCheckbox.checked).toBe(true);
    expect(geminiCheckbox.checked).toBe(false);
  });

  it("ignores hiddenButtons for agent IDs (agentSettingsStore wins)", () => {
    // Stale entry from pre-migration persisted state — the UI must still
    // derive the agent's visibility from `agentSettingsStore`, not from
    // `hiddenButtons`.
    toolbarState.layout.hiddenButtons = ["claude"];
    setAgentSettings(agentSettings({ claude: { pinned: true } }));

    const { getByLabelText } = render(<ToolbarSettingsTab />);
    const claudeCheckbox = getByLabelText("Toggle Claude Agent visibility") as HTMLInputElement;
    expect(claudeCheckbox.checked).toBe(true);
  });

  it("routes agent checkbox toggle to setAgentPinned (not toggleButtonVisibility)", () => {
    setAgentSettings(agentSettings({ claude: { pinned: true } }));

    const { getByLabelText } = render(<ToolbarSettingsTab />);
    fireEvent.click(getByLabelText("Toggle Claude Agent visibility"));

    expect(setAgentPinnedMock).toHaveBeenCalledTimes(1);
    expect(setAgentPinnedMock).toHaveBeenCalledWith("claude", false);
    expect(toggleButtonVisibilityMock).not.toHaveBeenCalled();
  });

  it("routes agent checkbox toggle upward (unpinned → pinned) via setAgentPinned", () => {
    setAgentSettings(agentSettings({ gemini: { pinned: false } }));

    const { getByLabelText } = render(<ToolbarSettingsTab />);
    fireEvent.click(getByLabelText("Toggle Gemini Agent visibility"));

    expect(setAgentPinnedMock).toHaveBeenCalledWith("gemini", true);
    expect(toggleButtonVisibilityMock).not.toHaveBeenCalled();
  });

  it("keeps non-agent checkbox toggle on toggleButtonVisibility", () => {
    const { getByLabelText } = render(<ToolbarSettingsTab />);
    fireEvent.click(getByLabelText("Toggle Terminal visibility"));

    expect(toggleButtonVisibilityMock).toHaveBeenCalledTimes(1);
    expect(toggleButtonVisibilityMock).toHaveBeenCalledWith("terminal", "left");
    expect(setAgentPinnedMock).not.toHaveBeenCalled();
  });

  it("reflects pinned agents in the section visible-count summary", () => {
    setAgentSettings(
      agentSettings({
        claude: { pinned: true },
        gemini: { pinned: false },
      })
    );

    const { getByTestId } = render(<ToolbarSettingsTab />);
    // Left side: agent-tray (visible), claude (pinned, visible),
    // gemini (unpinned, not visible), terminal (not hidden, visible) => 3 / 4.
    const leftSection = getByTestId("section-Left Side Buttons");
    expect(leftSection.getAttribute("data-description")).toContain("3 of 4 visible");
  });

  it("treats null agentSettings as all-unpinned without crashing", () => {
    setAgentSettings(null);

    const { getByLabelText } = render(<ToolbarSettingsTab />);
    const claudeCheckbox = getByLabelText("Toggle Claude Agent visibility") as HTMLInputElement;
    expect(claudeCheckbox.checked).toBe(false);
  });

  it("handles a right-side agent correctly (routes through setAgentPinned)", () => {
    // Relocate codex to the right side — an unlikely but possible layout.
    setLayout({
      leftButtons: ["agent-tray", "terminal"],
      rightButtons: ["codex", "settings"],
      hiddenButtons: [],
    });
    setAgentSettings(agentSettings({ codex: { pinned: true } }));

    const { getByLabelText } = render(<ToolbarSettingsTab />);
    fireEvent.click(getByLabelText("Toggle Codex Agent visibility"));

    expect(setAgentPinnedMock).toHaveBeenCalledWith("codex", false);
    expect(toggleButtonVisibilityMock).not.toHaveBeenCalled();
  });
});
