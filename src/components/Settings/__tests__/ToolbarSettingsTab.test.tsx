// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { AgentSettings } from "@shared/types";

const setLeftButtonsMock = vi.fn();
const setRightButtonsMock = vi.fn();
const setAlwaysShowDevServerMock = vi.fn();
const setDefaultSelectionMock = vi.fn();
const resetMock = vi.fn();
// Hoisted so the vi.mock factory below (also hoisted) can reference it; a
// plain `const` initializes after the mock factory runs.
const { dispatchToolbarVisibilityMock } = vi.hoisted(() => ({
  dispatchToolbarVisibilityMock: vi.fn(),
}));

interface ToolbarState {
  layout: {
    leftButtons: string[];
    rightButtons: string[];
    pinnedButtons: Record<string, boolean>;
  };
  launcher: {
    alwaysShowDevServer: boolean;
    defaultSelection?: string;
  };
  setLeftButtons: typeof setLeftButtonsMock;
  setRightButtons: typeof setRightButtonsMock;
  setAlwaysShowDevServer: typeof setAlwaysShowDevServerMock;
  setDefaultSelection: typeof setDefaultSelectionMock;
  reset: typeof resetMock;
}

let mockToolbarState: ToolbarState = {
  layout: { leftButtons: [], rightButtons: [], pinnedButtons: {} },
  launcher: { alwaysShowDevServer: false, defaultSelection: undefined },
  setLeftButtons: setLeftButtonsMock,
  setRightButtons: setRightButtonsMock,
  setAlwaysShowDevServer: setAlwaysShowDevServerMock,
  setDefaultSelection: setDefaultSelectionMock,
  reset: resetMock,
};

let mockAgentSettings: AgentSettings | null = null;

vi.mock("@/store", () => ({
  useToolbarPreferencesStore: (selector: (s: ToolbarState) => unknown) =>
    selector(mockToolbarState),
}));

vi.mock("@/store/agentSettingsStore", () => ({
  useAgentSettingsStore: (selector: (s: { settings: AgentSettings | null }) => unknown) =>
    selector({ settings: mockAgentSettings }),
}));

vi.mock("@/store/cliAvailabilityStore", () => ({
  useCliAvailabilityStore: (selector: (s: { availability: undefined }) => unknown) =>
    selector({ availability: undefined }),
}));

// The component delegates all visibility writes to dispatchToolbarVisibility.
// Tests assert on the dispatch directly rather than reaching through three
// store mocks for what is now a single-call boundary.
vi.mock("@/lib/toolbarVisibilityDispatch", () => ({
  dispatchToolbarVisibility: dispatchToolbarVisibilityMock,
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
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
  verticalListSortingStrategy: vi.fn(),
}));

// Test-time helper for restoring the default useSortable return between
// cases (the mock factory above is hoisted, so it can't reference this).
// The component only reads transform/transition/isDragging/listeners/
// attributes/setNodeRef; the cast keeps the partial shape without
// reconstructing dnd-kit's full ~20-field return type.
const defaultSortable = (): ReturnType<typeof useSortable> =>
  ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }) as unknown as ReturnType<typeof useSortable>;

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

import { useSortable } from "@dnd-kit/sortable";
import { DRAG_GHOST_OPACITY } from "@/lib/animationUtils";
import { ToolbarSettingsTab } from "../ToolbarSettingsTab";

function agentSettings(overrides: Record<string, { pinned?: boolean }>): AgentSettings {
  return { agents: overrides } as unknown as AgentSettings;
}

describe("ToolbarSettingsTab — agent visibility routing", () => {
  beforeEach(() => {
    setLeftButtonsMock.mockClear();
    setRightButtonsMock.mockClear();
    setAlwaysShowDevServerMock.mockClear();
    setDefaultSelectionMock.mockClear();
    resetMock.mockClear();
    dispatchToolbarVisibilityMock.mockClear();

    mockToolbarState = {
      layout: {
        // Mix of agent IDs and non-agent IDs so we can test both branches.
        leftButtons: ["agent-tray", "claude", "gemini", "terminal"],
        rightButtons: ["copy-tree", "settings"],
        pinnedButtons: {},
      },
      launcher: { alwaysShowDevServer: false, defaultSelection: undefined },
      setLeftButtons: setLeftButtonsMock,
      setRightButtons: setRightButtonsMock,
      setAlwaysShowDevServer: setAlwaysShowDevServerMock,
      setDefaultSelection: setDefaultSelectionMock,
      reset: resetMock,
    };
    mockAgentSettings = null;
  });

  it("shows agent rows as checked when pinned in agentSettingsStore", () => {
    mockAgentSettings = agentSettings({
      claude: { pinned: true },
      gemini: { pinned: false },
    });

    const { getByLabelText } = render(<ToolbarSettingsTab />);

    const claudeCheckbox = getByLabelText("Toggle Claude Agent visibility") as HTMLInputElement;
    const geminiCheckbox = getByLabelText("Toggle Gemini Agent visibility") as HTMLInputElement;
    expect(claudeCheckbox.checked).toBe(true);
    expect(geminiCheckbox.checked).toBe(false);
  });

  it("ignores pinnedButtons for agent IDs (agentSettingsStore wins)", () => {
    // Stale entry from pre-migration persisted state — the UI must still
    // derive the agent's visibility from `agentSettingsStore`, not from
    // `pinnedButtons`.
    mockToolbarState.layout.pinnedButtons = { claude: false };
    mockAgentSettings = agentSettings({
      claude: { pinned: true },
    });

    const { getByLabelText } = render(<ToolbarSettingsTab />);
    const claudeCheckbox = getByLabelText("Toggle Claude Agent visibility") as HTMLInputElement;
    expect(claudeCheckbox.checked).toBe(true);
  });

  it("dispatches agent checkbox toggle through dispatchToolbarVisibility", () => {
    mockAgentSettings = agentSettings({
      claude: { pinned: true },
    });

    const { getByLabelText } = render(<ToolbarSettingsTab />);
    fireEvent.click(getByLabelText("Toggle Claude Agent visibility"));

    expect(dispatchToolbarVisibilityMock).toHaveBeenCalledTimes(1);
    expect(dispatchToolbarVisibilityMock).toHaveBeenCalledWith("claude", "left");
  });

  it("dispatches an agent toggle on the left side (helper routes by ID, not by side)", () => {
    // Locks the contract: the component forwards the buttonId + side it
    // rendered for; routing to setAgentPinned vs toggleButtonVisibility is
    // the helper's responsibility — covered in toolbarVisibilityDispatch.test.ts.
    mockAgentSettings = agentSettings({
      gemini: { pinned: false },
    });

    const { getByLabelText } = render(<ToolbarSettingsTab />);
    fireEvent.click(getByLabelText("Toggle Gemini Agent visibility"));

    expect(dispatchToolbarVisibilityMock).toHaveBeenCalledWith("gemini", "left");
  });

  it("dispatches non-agent checkbox toggle with the left side argument", () => {
    const { getByLabelText } = render(<ToolbarSettingsTab />);
    fireEvent.click(getByLabelText("Toggle Terminal visibility"));

    expect(dispatchToolbarVisibilityMock).toHaveBeenCalledTimes(1);
    expect(dispatchToolbarVisibilityMock).toHaveBeenCalledWith("terminal", "left");
  });

  it("forwards `'right'` as the side argument for right-side toggles", () => {
    // Locks the side argument so a future regression to a single-side
    // handler can't silently collapse left and right into one call shape.
    const { getByLabelText } = render(<ToolbarSettingsTab />);
    fireEvent.click(getByLabelText("Toggle Copy Context visibility"));

    expect(dispatchToolbarVisibilityMock).toHaveBeenCalledTimes(1);
    expect(dispatchToolbarVisibilityMock).toHaveBeenCalledWith("copy-tree", "right");
  });

  it("reflects pinned agents in the section visible-count summary", () => {
    mockAgentSettings = agentSettings({
      claude: { pinned: true },
      gemini: { pinned: false },
    });

    const { getByTestId } = render(<ToolbarSettingsTab />);
    // Left side: agent-tray (visible), claude (pinned, visible),
    // gemini (unpinned, not visible), terminal (not hidden, visible) => 3 / 4.
    const leftSection = getByTestId("section-Left side buttons");
    expect(leftSection.getAttribute("data-description")).toContain("3 of 4 visible");
  });

  it("treats null agentSettings as all-unpinned without crashing", () => {
    mockAgentSettings = null;

    const { getByLabelText } = render(<ToolbarSettingsTab />);
    const claudeCheckbox = getByLabelText("Toggle Claude Agent visibility") as HTMLInputElement;
    expect(claudeCheckbox.checked).toBe(false);
  });

  it("dispatches a right-side agent toggle with side=right", () => {
    // Relocate codex to the right side — an unlikely but possible layout.
    mockToolbarState.layout = {
      leftButtons: ["agent-tray", "terminal"],
      rightButtons: ["codex", "settings"],
      pinnedButtons: {},
    };
    mockAgentSettings = agentSettings({
      codex: { pinned: true },
    });

    const { getByLabelText } = render(<ToolbarSettingsTab />);
    fireEvent.click(getByLabelText("Toggle Codex Agent visibility"));

    expect(dispatchToolbarVisibilityMock).toHaveBeenCalledWith("codex", "right");
  });
});

describe("ToolbarSettingsTab — drag-source vs hidden opacity deconfliction", () => {
  // The drag-source ghost (DRAG_GHOST_OPACITY) and the hidden-in-toolbar
  // preview (0.5) are semantically distinct states that previously shared a
  // magic 0.5. These tests lock the deconfliction so the two values can't
  // silently collapse back together.
  beforeEach(() => {
    dispatchToolbarVisibilityMock.mockClear();
    vi.mocked(useSortable).mockImplementation(defaultSortable);
    mockToolbarState = {
      layout: {
        leftButtons: ["agent-tray", "claude", "gemini", "terminal"],
        rightButtons: ["copy-tree", "settings"],
        pinnedButtons: {},
      },
      launcher: { alwaysShowDevServer: false, defaultSelection: undefined },
      setLeftButtons: setLeftButtonsMock,
      setRightButtons: setRightButtonsMock,
      setAlwaysShowDevServer: setAlwaysShowDevServerMock,
      setDefaultSelection: setDefaultSelectionMock,
      reset: resetMock,
    };
    mockAgentSettings = null;
  });

  function rowFor(label: string, container: HTMLElement): HTMLElement {
    const checkbox = container.querySelector(
      `input[aria-label="Toggle ${label} visibility"]`
    ) as HTMLInputElement;
    return checkbox.parentElement as HTMLElement;
  }

  it("applies DRAG_GHOST_OPACITY to a dragged row (not the legacy 0.5)", () => {
    vi.mocked(useSortable).mockImplementation(() => ({
      ...defaultSortable(),
      isDragging: true,
    }));

    const { getByLabelText, container } = render(<ToolbarSettingsTab />);
    getByLabelText("Toggle Terminal visibility");
    const row = rowFor("Terminal", container);
    expect(row.style.opacity).toBe(String(DRAG_GHOST_OPACITY));
    expect(row.style.opacity).not.toBe("0.5");
  });

  it("prefers DRAG_GHOST_OPACITY over the hidden preview when dragging a hidden row", () => {
    // Unreachable in production today (useSortable is called with
    // `disabled: !isVisible`, so a hidden row can't drag), but this locks
    // the ternary's `isDragging`-first ordering against a future refactor
    // that drops the disabled guard.
    mockAgentSettings = agentSettings({ gemini: { pinned: false } });
    vi.mocked(useSortable).mockImplementation(() => ({
      ...defaultSortable(),
      isDragging: true,
    }));

    const { container } = render(<ToolbarSettingsTab />);
    const row = rowFor("Gemini Agent", container);
    expect(row.style.opacity).toBe(String(DRAG_GHOST_OPACITY));
  });

  it("keeps the hidden-in-toolbar preview at 0.5 (distinct from the drag ghost)", () => {
    // gemini unpinned → not visible → hidden-preview opacity.
    mockAgentSettings = agentSettings({ gemini: { pinned: false } });

    const { container } = render(<ToolbarSettingsTab />);
    const row = rowFor("Gemini Agent", container);
    expect(row.style.opacity).toBe("0.5");
  });

  it("renders a visible, non-dragged row at full opacity", () => {
    mockAgentSettings = agentSettings({ claude: { pinned: true } });

    const { container } = render(<ToolbarSettingsTab />);
    const row = rowFor("Claude Agent", container);
    expect(row.style.opacity).toBe("1");
  });
});
