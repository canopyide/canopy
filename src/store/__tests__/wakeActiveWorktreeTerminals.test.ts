import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TerminalInstance } from "@shared/types";
import { TerminalRefreshTier } from "@/types";

const applyRendererPolicyMock = vi.fn();

vi.mock("@/services/TerminalInstanceService", () => ({
  terminalInstanceService: {
    applyRendererPolicy: applyRendererPolicyMock,
  },
}));

let mockActiveWorktreeId: string | null = null;
let mockPanelIds: string[] = [];
let mockPanelsById: Record<string, TerminalInstance> = {};

vi.mock("@/store/worktreeStore", () => ({
  useWorktreeSelectionStore: {
    getState: () => ({ activeWorktreeId: mockActiveWorktreeId }),
  },
}));

vi.mock("@/store/panelStore", () => ({
  usePanelStore: {
    getState: () => ({ panelIds: mockPanelIds, panelsById: mockPanelsById }),
  },
}));

const { wakeActiveWorktreeTerminals } = await import("@/store/wakeActiveWorktreeTerminals");

function panel(id: string, overrides: Partial<TerminalInstance> = {}): TerminalInstance {
  return {
    id,
    title: id,
    location: "grid",
    ...overrides,
  } as TerminalInstance;
}

beforeEach(() => {
  applyRendererPolicyMock.mockReset();
  mockActiveWorktreeId = null;
  mockPanelIds = [];
  mockPanelsById = {};
});

describe("wakeActiveWorktreeTerminals", () => {
  it("wakes grid terminals in the active worktree", () => {
    mockActiveWorktreeId = "wt-1";
    const a = panel("a", { worktreeId: "wt-1" });
    const b = panel("b", { worktreeId: "wt-1" });
    mockPanelIds = ["a", "b"];
    mockPanelsById = { a, b };

    wakeActiveWorktreeTerminals();

    expect(applyRendererPolicyMock).toHaveBeenCalledTimes(2);
    expect(applyRendererPolicyMock).toHaveBeenCalledWith("a", TerminalRefreshTier.VISIBLE);
    expect(applyRendererPolicyMock).toHaveBeenCalledWith("b", TerminalRefreshTier.VISIBLE);
  });

  it("excludes terminals from other worktrees", () => {
    mockActiveWorktreeId = "wt-1";
    const a = panel("a", { worktreeId: "wt-1" });
    const b = panel("b", { worktreeId: "wt-2" });
    mockPanelIds = ["a", "b"];
    mockPanelsById = { a, b };

    wakeActiveWorktreeTerminals();

    expect(applyRendererPolicyMock).toHaveBeenCalledTimes(1);
    expect(applyRendererPolicyMock).toHaveBeenCalledWith("a", TerminalRefreshTier.VISIBLE);
  });

  it("excludes dock-located terminals", () => {
    mockActiveWorktreeId = "wt-1";
    const a = panel("a", { worktreeId: "wt-1", location: "grid" });
    const dock = panel("dock", { worktreeId: "wt-1", location: "dock" });
    mockPanelIds = ["a", "dock"];
    mockPanelsById = { a, dock };

    wakeActiveWorktreeTerminals();

    expect(applyRendererPolicyMock).toHaveBeenCalledTimes(1);
    expect(applyRendererPolicyMock).toHaveBeenCalledWith("a", TerminalRefreshTier.VISIBLE);
  });

  it("excludes trash-located terminals", () => {
    mockActiveWorktreeId = "wt-1";
    const a = panel("a", { worktreeId: "wt-1" });
    const trash = panel("trash", { worktreeId: "wt-1", location: "trash" });
    mockPanelIds = ["a", "trash"];
    mockPanelsById = { a, trash };

    wakeActiveWorktreeTerminals();

    expect(applyRendererPolicyMock).toHaveBeenCalledTimes(1);
    expect(applyRendererPolicyMock).toHaveBeenCalledWith("a", TerminalRefreshTier.VISIBLE);
  });

  it("excludes non-terminal panel kinds", () => {
    mockActiveWorktreeId = "wt-1";
    const term = panel("term", { worktreeId: "wt-1", kind: "terminal" });
    const browser = panel("browser", { worktreeId: "wt-1", kind: "browser" });
    const devPreview = panel("dev", { worktreeId: "wt-1", kind: "dev-preview" });
    mockPanelIds = ["term", "browser", "dev"];
    mockPanelsById = { term, browser, dev: devPreview };

    wakeActiveWorktreeTerminals();

    expect(applyRendererPolicyMock).toHaveBeenCalledTimes(1);
    expect(applyRendererPolicyMock).toHaveBeenCalledWith("term", TerminalRefreshTier.VISIBLE);
  });

  it("treats undefined kind as terminal", () => {
    mockActiveWorktreeId = "wt-1";
    const a = panel("a", { worktreeId: "wt-1", kind: undefined });
    mockPanelIds = ["a"];
    mockPanelsById = { a };

    wakeActiveWorktreeTerminals();

    expect(applyRendererPolicyMock).toHaveBeenCalledTimes(1);
    expect(applyRendererPolicyMock).toHaveBeenCalledWith("a", TerminalRefreshTier.VISIBLE);
  });

  it("treats undefined location as grid", () => {
    mockActiveWorktreeId = "wt-1";
    const a = { id: "a", title: "a", worktreeId: "wt-1" } as unknown as TerminalInstance;
    mockPanelIds = ["a"];
    mockPanelsById = { a };

    wakeActiveWorktreeTerminals();

    expect(applyRendererPolicyMock).toHaveBeenCalledTimes(1);
    expect(applyRendererPolicyMock).toHaveBeenCalledWith("a", TerminalRefreshTier.VISIBLE);
  });

  it("when no active worktree, only wakes terminals with no worktree affiliation", () => {
    mockActiveWorktreeId = null;
    const a = panel("a", { worktreeId: undefined });
    const b = panel("b", { worktreeId: "wt-1" });
    mockPanelIds = ["a", "b"];
    mockPanelsById = { a, b };

    wakeActiveWorktreeTerminals();

    expect(applyRendererPolicyMock).toHaveBeenCalledTimes(1);
    expect(applyRendererPolicyMock).toHaveBeenCalledWith("a", TerminalRefreshTier.VISIBLE);
  });

  it("no-ops when there are no panels", () => {
    mockActiveWorktreeId = "wt-1";
    mockPanelIds = [];
    mockPanelsById = {};

    wakeActiveWorktreeTerminals();

    expect(applyRendererPolicyMock).not.toHaveBeenCalled();
  });

  it("skips panels missing from panelsById", () => {
    mockActiveWorktreeId = "wt-1";
    mockPanelIds = ["ghost"];
    mockPanelsById = {};

    expect(() => wakeActiveWorktreeTerminals()).not.toThrow();
    expect(applyRendererPolicyMock).not.toHaveBeenCalled();
  });
});
