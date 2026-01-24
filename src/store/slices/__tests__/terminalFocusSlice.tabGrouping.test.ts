// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { create } from "zustand";
import type { TerminalInstance } from "../terminalRegistry/types";
import { createTerminalFocusSlice, type TerminalFocusSlice } from "../terminalFocusSlice";

vi.mock("@/services/TerminalInstanceService", () => ({
  terminalInstanceService: {
    wake: vi.fn(),
  },
}));

vi.mock("@/store/worktreeStore", () => ({
  useWorktreeSelectionStore: {
    getState: vi.fn(() => ({
      activeWorktreeId: "worktree-1",
      trackTerminalFocus: vi.fn(),
      selectWorktree: vi.fn(),
    })),
  },
}));

vi.mock("@shared/config/panelKindRegistry", () => ({
  panelKindHasPty: vi.fn(() => true),
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

describe("TerminalFocusSlice Tab Grouping", () => {
  let store: ReturnType<typeof createTestStore>;
  const mockTerminals: TerminalInstance[] = [];

  const createTestStore = () => {
    return create<TerminalFocusSlice>(createTerminalFocusSlice(() => mockTerminals));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTerminals.length = 0;
    store = createTestStore();
  });

  describe("activeTabByGroup Map", () => {
    it("initializes as empty Map", () => {
      expect(store.getState().activeTabByGroup).toBeInstanceOf(Map);
      expect(store.getState().activeTabByGroup.size).toBe(0);
    });
  });

  describe("getActiveTabId", () => {
    it("returns null for non-existent group", () => {
      const result = store.getState().getActiveTabId("non-existent-group");
      expect(result).toBeNull();
    });

    it("returns panel id when group has active tab set", () => {
      store.getState().setActiveTab("group-1", "panel-a");
      const result = store.getState().getActiveTabId("group-1");
      expect(result).toBe("panel-a");
    });
  });

  describe("setActiveTab", () => {
    it("sets active tab for a group", () => {
      store.getState().setActiveTab("group-1", "panel-a");

      const state = store.getState();
      expect(state.activeTabByGroup.get("group-1")).toBe("panel-a");
    });

    it("updates active tab for existing group", () => {
      store.getState().setActiveTab("group-1", "panel-a");
      store.getState().setActiveTab("group-1", "panel-b");

      const state = store.getState();
      expect(state.activeTabByGroup.get("group-1")).toBe("panel-b");
    });

    it("maintains separate active tabs for different groups", () => {
      store.getState().setActiveTab("group-1", "panel-a");
      store.getState().setActiveTab("group-2", "panel-x");
      store.getState().setActiveTab("group-3", "panel-m");

      const state = store.getState();
      expect(state.activeTabByGroup.get("group-1")).toBe("panel-a");
      expect(state.activeTabByGroup.get("group-2")).toBe("panel-x");
      expect(state.activeTabByGroup.get("group-3")).toBe("panel-m");
    });

    it("creates immutable Map updates", () => {
      const initialMap = store.getState().activeTabByGroup;
      store.getState().setActiveTab("group-1", "panel-a");
      const updatedMap = store.getState().activeTabByGroup;

      expect(initialMap).not.toBe(updatedMap);
    });
  });

  describe("integration with focus state", () => {
    it("activeTabByGroup persists independently of focusedId", () => {
      store.getState().setActiveTab("group-1", "panel-a");
      store.getState().setFocused("panel-b");

      const state = store.getState();
      expect(state.focusedId).toBe("panel-b");
      expect(state.activeTabByGroup.get("group-1")).toBe("panel-a");
    });

    it("multiple operations don't interfere with activeTabByGroup", () => {
      store.getState().setActiveTab("group-1", "panel-a");

      mockTerminals.push(createMockTerminal("t1"));
      mockTerminals.push(createMockTerminal("t2"));

      store.getState().setFocused("t1");
      store.getState().focusNext();
      store.getState().setFocused(null);

      const state = store.getState();
      expect(state.activeTabByGroup.get("group-1")).toBe("panel-a");
    });
  });
});
