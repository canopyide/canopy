import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTerminalRegistrySlice, type TerminalInstance } from "../index";
import type { TerminalRegistrySlice } from "../types";

// Mock dependencies
vi.mock("@/clients", () => ({
  terminalClient: {
    spawn: vi.fn().mockResolvedValue("mock-id"),
    kill: vi.fn().mockResolvedValue(undefined),
    trash: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
  },
  agentSettingsClient: { get: vi.fn() },
  projectClient: { getCurrent: vi.fn(), getSettings: vi.fn() },
}));

vi.mock("@/services/TerminalInstanceService", () => ({
  terminalInstanceService: {
    prewarmTerminal: vi.fn(),
    destroy: vi.fn(),
    applyRendererPolicy: vi.fn(),
    setInputLocked: vi.fn(),
    get: vi.fn(),
    fit: vi.fn(),
    suppressNextExit: vi.fn(),
    wake: vi.fn(),
  },
}));

vi.mock("@/store/worktreeStore", () => ({
  useWorktreeSelectionStore: {
    getState: vi.fn(() => ({
      activeWorktreeId: "worktree-1",
    })),
  },
}));

vi.mock("@/store/layoutConfigStore", () => ({
  useLayoutConfigStore: {
    getState: vi.fn(() => ({
      getMaxGridCapacity: vi.fn().mockReturnValue(6),
    })),
  },
}));

vi.mock("@/store/scrollbackStore", () => ({
  useScrollbackStore: { getState: vi.fn(() => ({ scrollbackLines: 10000 })) },
}));

vi.mock("@/store/performanceModeStore", () => ({
  usePerformanceModeStore: { getState: vi.fn(() => ({ performanceMode: false })) },
}));

vi.mock("@/store/terminalFontStore", () => ({
  useTerminalFontStore: { getState: vi.fn(() => ({ fontSize: 14, fontFamily: "monospace" })) },
}));

vi.mock("@/utils/scrollbackConfig", () => ({
  getScrollbackForType: vi.fn().mockReturnValue(10000),
  PERFORMANCE_MODE_SCROLLBACK: 1000,
}));

vi.mock("@/utils/terminalTheme", () => ({
  getTerminalThemeFromCSS: vi.fn().mockReturnValue({}),
}));

vi.mock("@/config/terminalFont", () => ({
  DEFAULT_TERMINAL_FONT_FAMILY: "monospace",
}));

vi.mock("@/config/agents", () => ({
  isRegisteredAgent: vi.fn().mockReturnValue(false),
  getAgentConfig: vi.fn(),
}));

vi.mock("@shared/config/panelKindRegistry", () => ({
  panelKindHasPty: vi.fn((kind: string) => kind === "terminal" || kind === "agent"),
  panelKindUsesTerminalUi: vi.fn((kind: string) => kind === "terminal" || kind === "agent"),
}));

vi.mock("@/utils/terminalValidation", () => ({
  validateTerminalConfig: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
}));

vi.mock("@/store/restartExitSuppression", () => ({
  markTerminalRestarting: vi.fn(),
  unmarkTerminalRestarting: vi.fn(),
}));

vi.mock("@shared/types", () => ({
  generateAgentFlags: vi.fn().mockReturnValue([]),
}));

describe("Tab Grouping - getTabGroupPanels", () => {
  let state: TerminalRegistrySlice;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setState: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getState: any;

  const createMockTerminals = (): TerminalInstance[] =>
    [
      {
        id: "term-1",
        title: "Terminal 1",
        type: "terminal",
        kind: "terminal",
        cwd: "/test",
        location: "grid",
        cols: 80,
        rows: 24,
        worktreeId: "worktree-1",
        tabGroupId: "group-a",
        orderInGroup: 1,
      },
      {
        id: "term-2",
        title: "Terminal 2",
        type: "terminal",
        kind: "terminal",
        cwd: "/test",
        location: "grid",
        cols: 80,
        rows: 24,
        worktreeId: "worktree-1",
        tabGroupId: "group-a",
        orderInGroup: 0,
      },
      {
        id: "term-3",
        title: "Terminal 3",
        type: "terminal",
        kind: "terminal",
        cwd: "/test",
        location: "grid",
        cols: 80,
        rows: 24,
        worktreeId: "worktree-1",
        tabGroupId: "group-a",
        orderInGroup: 2,
      },
      {
        id: "term-4",
        title: "Terminal 4 (ungrouped)",
        type: "terminal",
        kind: "terminal",
        cwd: "/test",
        location: "grid",
        cols: 80,
        rows: 24,
        worktreeId: "worktree-1",
      },
      {
        id: "term-5",
        title: "Terminal 5 (trashed)",
        type: "terminal",
        kind: "terminal",
        cwd: "/test",
        location: "trash",
        cols: 80,
        rows: 24,
        worktreeId: "worktree-1",
        tabGroupId: "group-a",
        orderInGroup: 3,
      },
    ] as TerminalInstance[];

  beforeEach(() => {
    vi.clearAllMocks();
    setState = vi.fn((updater) => {
      const currentState = getState();
      const updates = typeof updater === "function" ? updater(currentState) : updater;
      state = { ...currentState, ...updates };
    });
    getState = vi.fn(() => state);
    state = createTerminalRegistrySlice()(setState, getState, {} as never);
    state.terminals = createMockTerminals();
    state.trashedTerminals = new Map();
  });

  it("should return panels sorted by orderInGroup", () => {
    const panels = state.getTabGroupPanels("group-a");

    expect(panels).toHaveLength(3);
    expect(panels[0].id).toBe("term-2"); // orderInGroup: 0
    expect(panels[1].id).toBe("term-1"); // orderInGroup: 1
    expect(panels[2].id).toBe("term-3"); // orderInGroup: 2
  });

  it("should exclude trashed panels from groups", () => {
    const panels = state.getTabGroupPanels("group-a");

    expect(panels.find((p) => p.id === "term-5")).toBeUndefined();
  });

  it("should treat ungrouped panels as single-panel groups", () => {
    const panels = state.getTabGroupPanels("term-4");

    expect(panels).toHaveLength(1);
    expect(panels[0].id).toBe("term-4");
  });

  it("should return empty array for non-existent group", () => {
    const panels = state.getTabGroupPanels("non-existent-group");

    expect(panels).toHaveLength(0);
  });

  it("should exclude panels marked in trashedTerminals map", () => {
    state.trashedTerminals.set("term-2", {
      id: "term-2",
      expiresAt: Date.now() + 120000,
      originalLocation: "grid",
    });

    const panels = state.getTabGroupPanels("group-a");

    expect(panels).toHaveLength(2);
    expect(panels.find((p) => p.id === "term-2")).toBeUndefined();
  });
});

describe("Tab Grouping - getTabGroups", () => {
  let state: TerminalRegistrySlice;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setState: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getState: any;

  const createMockTerminals = (): TerminalInstance[] =>
    [
      {
        id: "term-1",
        title: "Terminal 1",
        type: "terminal",
        kind: "terminal",
        cwd: "/test",
        location: "grid",
        cols: 80,
        rows: 24,
        worktreeId: "worktree-1",
        tabGroupId: "group-a",
        orderInGroup: 0,
      },
      {
        id: "term-2",
        title: "Terminal 2",
        type: "terminal",
        kind: "terminal",
        cwd: "/test",
        location: "grid",
        cols: 80,
        rows: 24,
        worktreeId: "worktree-1",
        tabGroupId: "group-a",
        orderInGroup: 1,
      },
      {
        id: "term-3",
        title: "Terminal 3",
        type: "terminal",
        kind: "terminal",
        cwd: "/test",
        location: "dock",
        cols: 80,
        rows: 24,
        worktreeId: "worktree-1",
        tabGroupId: "group-b",
        orderInGroup: 0,
      },
      {
        id: "term-4",
        title: "Terminal 4 (ungrouped)",
        type: "terminal",
        kind: "terminal",
        cwd: "/test",
        location: "grid",
        cols: 80,
        rows: 24,
        worktreeId: "worktree-1",
      },
      {
        id: "term-5",
        title: "Terminal 5 (different worktree)",
        type: "terminal",
        kind: "terminal",
        cwd: "/test",
        location: "grid",
        cols: 80,
        rows: 24,
        worktreeId: "worktree-2",
        tabGroupId: "group-c",
        orderInGroup: 0,
      },
      {
        id: "term-6",
        title: "Terminal 6 (trashed)",
        type: "terminal",
        kind: "terminal",
        cwd: "/test",
        location: "trash",
        cols: 80,
        rows: 24,
        worktreeId: "worktree-1",
        tabGroupId: "group-a",
        orderInGroup: 2,
      },
    ] as TerminalInstance[];

  beforeEach(() => {
    vi.clearAllMocks();
    setState = vi.fn((updater) => {
      const currentState = getState();
      const updates = typeof updater === "function" ? updater(currentState) : updater;
      state = { ...currentState, ...updates };
    });
    getState = vi.fn(() => state);
    state = createTerminalRegistrySlice()(setState, getState, {} as never);
    state.terminals = createMockTerminals();
    state.trashedTerminals = new Map();
  });

  it("should group panels correctly by location and worktree", () => {
    const gridGroups = state.getTabGroups("grid", "worktree-1");

    expect(gridGroups).toHaveLength(2);

    const groupA = gridGroups.find((g) => g.id === "group-a");
    expect(groupA).toBeDefined();
    expect(groupA?.panelIds).toEqual(["term-1", "term-2"]);
    expect(groupA?.activeTabId).toBe("term-1");

    const ungroupedPanel = gridGroups.find((g) => g.id === "term-4");
    expect(ungroupedPanel).toBeDefined();
    expect(ungroupedPanel?.panelIds).toEqual(["term-4"]);
  });

  it("should filter by location correctly", () => {
    const dockGroups = state.getTabGroups("dock", "worktree-1");

    expect(dockGroups).toHaveLength(1);
    expect(dockGroups[0].id).toBe("group-b");
    expect(dockGroups[0].location).toBe("dock");
  });

  it("should filter by worktree correctly", () => {
    const worktree2Groups = state.getTabGroups("grid", "worktree-2");

    expect(worktree2Groups).toHaveLength(1);
    expect(worktree2Groups[0].id).toBe("group-c");
    expect(worktree2Groups[0].worktreeId).toBe("worktree-2");
  });

  it("should exclude trashed panels from groups", () => {
    const gridGroups = state.getTabGroups("grid", "worktree-1");
    const groupA = gridGroups.find((g) => g.id === "group-a");

    expect(groupA?.panelIds).not.toContain("term-6");
    expect(groupA?.panelIds).toHaveLength(2);
  });

  it("should return panels sorted by orderInGroup within each group", () => {
    const gridGroups = state.getTabGroups("grid", "worktree-1");
    const groupA = gridGroups.find((g) => g.id === "group-a");

    expect(groupA?.panelIds[0]).toBe("term-1"); // orderInGroup: 0
    expect(groupA?.panelIds[1]).toBe("term-2"); // orderInGroup: 1
  });

  it("should handle undefined worktree filter", () => {
    // Add a global terminal (no worktreeId)
    state.terminals.push({
      id: "term-global",
      title: "Global Terminal",
      type: "terminal",
      kind: "terminal",
      cwd: "/test",
      location: "grid",
      cols: 80,
      rows: 24,
    } as TerminalInstance);

    const globalGroups = state.getTabGroups("grid", undefined);

    expect(globalGroups).toHaveLength(1);
    expect(globalGroups[0].id).toBe("term-global");
    expect(globalGroups[0].worktreeId).toBeUndefined();
  });

  it("should return empty array for location with no panels", () => {
    const groups = state.getTabGroups("grid", "non-existent-worktree");

    expect(groups).toHaveLength(0);
  });
});

describe("Tab Grouping - activeTabByGroup (Focus Slice)", () => {
  // These tests verify the focus slice tab tracking
  // Import and test the focus slice separately
  let focusSlice: import("../../terminalFocusSlice").TerminalFocusSlice;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setState: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getState: any;
  let createTerminalFocusSlice: typeof import("../../terminalFocusSlice").createTerminalFocusSlice;

  beforeEach(async () => {
    vi.clearAllMocks();
    const focusModule = await import("../../terminalFocusSlice");
    createTerminalFocusSlice = focusModule.createTerminalFocusSlice;

    setState = vi.fn((updater) => {
      const currentState = getState();
      const updates = typeof updater === "function" ? updater(currentState) : updater;
      focusSlice = { ...currentState, ...updates };
    });
    getState = vi.fn(() => focusSlice);
    focusSlice = createTerminalFocusSlice(() => [])(setState, getState, {} as never);
  });

  it("should set active tab for a group", () => {
    focusSlice.setActiveTab("group-a", "term-1");

    expect(focusSlice.activeTabByGroup.get("group-a")).toBe("term-1");
  });

  it("should update active tab for existing group", () => {
    focusSlice.setActiveTab("group-a", "term-1");
    focusSlice.setActiveTab("group-a", "term-2");

    expect(focusSlice.activeTabByGroup.get("group-a")).toBe("term-2");
  });

  it("should get active tab ID for a group", () => {
    focusSlice.activeTabByGroup = new Map([["group-a", "term-1"]]);

    const activeTabId = focusSlice.getActiveTabId("group-a");

    expect(activeTabId).toBe("term-1");
  });

  it("should return null for untracked group", () => {
    const activeTabId = focusSlice.getActiveTabId("non-existent-group");

    expect(activeTabId).toBeNull();
  });

  it("should cleanup stale tabs when panels are removed", () => {
    focusSlice.activeTabByGroup = new Map([
      ["group-a", "term-1"],
      ["group-b", "term-2"],
      ["group-c", "term-3"],
    ]);

    const validPanelIds = new Set(["term-1", "term-3"]);
    focusSlice.cleanupStaleTabs(validPanelIds);

    expect(focusSlice.activeTabByGroup.has("group-a")).toBe(true);
    expect(focusSlice.activeTabByGroup.has("group-b")).toBe(false);
    expect(focusSlice.activeTabByGroup.has("group-c")).toBe(true);
  });

  it("should not modify state if no stale entries", () => {
    const originalMap = new Map([["group-a", "term-1"]]);
    focusSlice.activeTabByGroup = originalMap;

    const validPanelIds = new Set(["term-1"]);
    focusSlice.cleanupStaleTabs(validPanelIds);

    // State should be unchanged (same reference)
    expect(focusSlice.activeTabByGroup).toBe(originalMap);
  });
});
