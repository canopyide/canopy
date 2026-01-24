// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TerminalInstance } from "../types";
import type { TabGroup, TabGroupLocation } from "@/types";

vi.mock("@/clients", () => ({
  terminalClient: {
    spawn: vi.fn().mockResolvedValue("terminal-1"),
    kill: vi.fn().mockResolvedValue(undefined),
    trash: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    resize: vi.fn().mockResolvedValue(undefined),
  },
  agentSettingsClient: {
    get: vi.fn().mockResolvedValue(null),
  },
  projectClient: {
    getCurrent: vi.fn().mockResolvedValue(null),
    getSettings: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@/services/TerminalInstanceService", () => ({
  terminalInstanceService: {
    prewarmTerminal: vi.fn(),
    destroy: vi.fn(),
    applyRendererPolicy: vi.fn(),
    wake: vi.fn(),
    fit: vi.fn(),
    setInputLocked: vi.fn(),
    get: vi.fn(),
    suppressNextExit: vi.fn(),
    waitForInstance: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/store/scrollbackStore", () => ({
  useScrollbackStore: {
    getState: vi.fn(() => ({ scrollbackLines: 10000 })),
  },
}));

vi.mock("@/store/performanceModeStore", () => ({
  usePerformanceModeStore: {
    getState: vi.fn(() => ({ performanceMode: false })),
  },
}));

vi.mock("@/store/terminalFontStore", () => ({
  useTerminalFontStore: {
    getState: vi.fn(() => ({ fontSize: 14, fontFamily: "monospace" })),
  },
}));

vi.mock("@/store/worktreeStore", () => ({
  useWorktreeSelectionStore: {
    getState: vi.fn(() => ({ activeWorktreeId: "worktree-1" })),
  },
}));

vi.mock("@/store/layoutConfigStore", () => ({
  useLayoutConfigStore: {
    getState: vi.fn(() => ({
      getMaxGridCapacity: vi.fn(() => 8),
    })),
  },
}));

vi.mock("@/store/restartExitSuppression", () => ({
  markTerminalRestarting: vi.fn(),
  unmarkTerminalRestarting: vi.fn(),
}));

vi.mock("@/utils/terminalTheme", () => ({
  getTerminalThemeFromCSS: vi.fn(() => ({})),
}));

vi.mock("@/config/agents", () => ({
  isRegisteredAgent: vi.fn(() => false),
  getAgentConfig: vi.fn(() => null),
}));

vi.mock("@shared/config/panelKindRegistry", () => ({
  panelKindHasPty: vi.fn(() => true),
  panelKindUsesTerminalUi: vi.fn((kind: string) => kind === "terminal" || kind === "agent"),
}));

vi.mock("@/utils/terminalValidation", () => ({
  validateTerminalConfig: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
}));

vi.mock("@/config/terminalFont", () => ({
  DEFAULT_TERMINAL_FONT_FAMILY: "monospace",
}));

vi.mock("@/utils/scrollbackConfig", () => ({
  getScrollbackForType: vi.fn(() => 10000),
  PERFORMANCE_MODE_SCROLLBACK: 1000,
}));

vi.mock("../persistence", () => ({
  saveTerminals: vi.fn(),
}));

vi.mock("../layout", () => ({
  optimizeForDock: vi.fn(),
}));

const createMockTerminal = (
  id: string,
  overrides: Partial<TerminalInstance> = {}
): TerminalInstance => ({
  id,
  title: `Terminal ${id}`,
  cwd: "/tmp",
  cols: 80,
  rows: 24,
  location: "grid",
  kind: "terminal",
  type: "terminal",
  ...overrides,
});

const getTabGroupPanels = (terminals: TerminalInstance[], groupId: string): TerminalInstance[] => {
  return terminals
    .filter(
      (t) =>
        t.location !== "trash" && (t.tabGroupId === groupId || (!t.tabGroupId && t.id === groupId))
    )
    .sort((a, b) => (a.orderInGroup ?? 0) - (b.orderInGroup ?? 0));
};

const getTabGroups = (
  terminals: TerminalInstance[],
  location: TabGroupLocation,
  worktreeId?: string | null
): TabGroup[] => {
  const hasWorktreeFilter = worktreeId !== undefined;
  const targetWorktreeId = worktreeId ?? null;
  const panels = terminals.filter((t) => {
    if (t.location !== location) return false;
    return !hasWorktreeFilter || (t.worktreeId ?? null) === targetWorktreeId;
  });

  const grouped = new Map<string, TerminalInstance[]>();
  for (const panel of panels) {
    const groupId = panel.tabGroupId ?? panel.id;
    if (!grouped.has(groupId)) grouped.set(groupId, []);
    grouped.get(groupId)!.push(panel);
  }

  return Array.from(grouped.entries()).map(([id, groupPanels]) => {
    const sortedPanels = groupPanels.sort((a, b) => (a.orderInGroup ?? 0) - (b.orderInGroup ?? 0));
    return {
      id,
      location,
      worktreeId: worktreeId === null ? undefined : worktreeId,
      activeTabId: sortedPanels[0].id,
      panelIds: sortedPanels.map((p) => p.id),
    };
  });
};

describe("Tab Grouping Helpers", () => {
  let terminals: TerminalInstance[];

  beforeEach(() => {
    vi.clearAllMocks();
    terminals = [];
  });

  describe("getTabGroupPanels", () => {
    it("returns empty array for non-existent group", () => {
      terminals = [createMockTerminal("t1")];
      const result = getTabGroupPanels(terminals, "non-existent-group");
      expect(result).toEqual([]);
    });

    it("returns panels matching the group ID sorted by orderInGroup", () => {
      terminals = [
        createMockTerminal("t1", { tabGroupId: "group-1", orderInGroup: 2 }),
        createMockTerminal("t2", { tabGroupId: "group-1", orderInGroup: 0 }),
        createMockTerminal("t3", { tabGroupId: "group-1", orderInGroup: 1 }),
        createMockTerminal("t4", { tabGroupId: "group-2", orderInGroup: 0 }),
      ];

      const result = getTabGroupPanels(terminals, "group-1");

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe("t2");
      expect(result[1].id).toBe("t3");
      expect(result[2].id).toBe("t1");
    });

    it("handles undefined orderInGroup by treating as 0", () => {
      terminals = [
        createMockTerminal("t1", { tabGroupId: "group-1", orderInGroup: 1 }),
        createMockTerminal("t2", { tabGroupId: "group-1" }),
        createMockTerminal("t3", { tabGroupId: "group-1", orderInGroup: 0 }),
      ];

      const result = getTabGroupPanels(terminals, "group-1");

      expect(result).toHaveLength(3);
      expect(result[0].orderInGroup ?? 0).toBe(0);
      expect(result[1].orderInGroup ?? 0).toBe(0);
      expect(result[2].orderInGroup).toBe(1);
    });
  });

  describe("getTabGroups", () => {
    it("returns empty array when no terminals exist", () => {
      const result = getTabGroups([], "grid");
      expect(result).toEqual([]);
    });

    it("returns tab groups for specified location", () => {
      terminals = [
        createMockTerminal("t1", { location: "grid", tabGroupId: "group-1" }),
        createMockTerminal("t2", { location: "grid", tabGroupId: "group-1" }),
        createMockTerminal("t3", { location: "dock", tabGroupId: "group-2" }),
      ];

      const gridGroups = getTabGroups(terminals, "grid");
      expect(gridGroups).toHaveLength(1);
      expect(gridGroups[0].id).toBe("group-1");
      expect(gridGroups[0].panelIds).toEqual(["t1", "t2"]);

      const dockGroups = getTabGroups(terminals, "dock");
      expect(dockGroups).toHaveLength(1);
      expect(dockGroups[0].id).toBe("group-2");
    });

    it("filters by worktreeId when provided", () => {
      terminals = [
        createMockTerminal("t1", { location: "grid", worktreeId: "wt-1", tabGroupId: "group-1" }),
        createMockTerminal("t2", { location: "grid", worktreeId: "wt-2", tabGroupId: "group-2" }),
        createMockTerminal("t3", { location: "grid", worktreeId: "wt-1", tabGroupId: "group-1" }),
      ];

      const groups = getTabGroups(terminals, "grid", "wt-1");
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe("group-1");
      expect(groups[0].panelIds).toEqual(["t1", "t3"]);
    });

    it("treats ungrouped panels as single-tab groups using panel id as group id", () => {
      terminals = [
        createMockTerminal("t1", { location: "grid" }),
        createMockTerminal("t2", { location: "grid" }),
        createMockTerminal("t3", { location: "grid", tabGroupId: "group-1" }),
      ];

      const groups = getTabGroups(terminals, "grid");
      expect(groups).toHaveLength(3);

      const ungroupedT1 = groups.find((g) => g.id === "t1");
      expect(ungroupedT1).toBeDefined();
      expect(ungroupedT1!.panelIds).toEqual(["t1"]);
      expect(ungroupedT1!.activeTabId).toBe("t1");

      const ungroupedT2 = groups.find((g) => g.id === "t2");
      expect(ungroupedT2).toBeDefined();
      expect(ungroupedT2!.panelIds).toEqual(["t2"]);

      const groupedGroup = groups.find((g) => g.id === "group-1");
      expect(groupedGroup).toBeDefined();
      expect(groupedGroup!.panelIds).toEqual(["t3"]);
    });

    it("excludes trashed panels from getTabGroupPanels", () => {
      terminals = [
        createMockTerminal("t1", { location: "grid", tabGroupId: "group-1" }),
        createMockTerminal("t2", { location: "trash", tabGroupId: "group-1" }),
        createMockTerminal("t3", { location: "grid", tabGroupId: "group-1" }),
      ];

      const result = getTabGroupPanels(terminals, "group-1");
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.id)).toEqual(["t1", "t3"]);
    });

    it("sets activeTabId to first panel in sorted order", () => {
      terminals = [
        createMockTerminal("t1", { location: "grid", tabGroupId: "group-1", orderInGroup: 2 }),
        createMockTerminal("t2", { location: "grid", tabGroupId: "group-1", orderInGroup: 0 }),
        createMockTerminal("t3", { location: "grid", tabGroupId: "group-1", orderInGroup: 1 }),
      ];

      const groups = getTabGroups(terminals, "grid");
      expect(groups[0].activeTabId).toBe("t2");
      expect(groups[0].panelIds).toEqual(["t2", "t3", "t1"]);
    });

    it("handles panels without worktreeId", () => {
      terminals = [
        createMockTerminal("t1", { location: "grid", tabGroupId: "group-1" }),
        createMockTerminal("t2", { location: "grid", tabGroupId: "group-1" }),
      ];

      const groups = getTabGroups(terminals, "grid", undefined);
      expect(groups).toHaveLength(1);
      expect(groups[0].panelIds).toEqual(["t1", "t2"]);
    });
  });

  describe("backward compatibility", () => {
    it("existing panels without tabGroupId work correctly", () => {
      terminals = [
        createMockTerminal("t1", { location: "grid" }),
        createMockTerminal("t2", { location: "grid" }),
        createMockTerminal("t3", { location: "dock" }),
      ];

      const gridGroups = getTabGroups(terminals, "grid");
      expect(gridGroups).toHaveLength(2);
      expect(gridGroups.every((g) => g.panelIds.length === 1)).toBe(true);

      const dockGroups = getTabGroups(terminals, "dock");
      expect(dockGroups).toHaveLength(1);
    });

    it("mixed grouped and ungrouped panels coexist", () => {
      terminals = [
        createMockTerminal("t1", { location: "grid" }),
        createMockTerminal("t2", { location: "grid", tabGroupId: "group-1" }),
        createMockTerminal("t3", { location: "grid", tabGroupId: "group-1" }),
        createMockTerminal("t4", { location: "grid" }),
      ];

      const groups = getTabGroups(terminals, "grid");
      expect(groups).toHaveLength(3);

      const groupedGroup = groups.find((g) => g.id === "group-1");
      expect(groupedGroup!.panelIds).toEqual(["t2", "t3"]);
    });
  });
});
