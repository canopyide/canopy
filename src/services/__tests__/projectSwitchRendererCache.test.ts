import { beforeEach, describe, expect, it } from "vitest";
import {
  prepareProjectSwitchRendererCache,
  finalizeProjectSwitchRendererCache,
  cancelPreparedProjectSwitchRendererCache,
  isTerminalWarmInProjectSwitchCache,
  resetProjectSwitchRendererCacheForTests,
} from "../projectSwitchRendererCache";

describe("projectSwitchRendererCache", () => {
  beforeEach(() => {
    resetProjectSwitchRendererCacheForTests();
  });

  it("caches only active-worktree and project-scoped terminals for switch-back", () => {
    const prepared = prepareProjectSwitchRendererCache({
      outgoingProjectId: "project-a",
      targetProjectId: "project-b",
      outgoingActiveWorktreeId: "wt-main",
      outgoingTerminals: [
        { id: "a-main-1", worktreeId: "wt-main" },
        { id: "a-feature-1", worktreeId: "wt-feature" },
        { id: "a-global-1" },
      ],
    });

    expect(prepared.evictTerminalIds).toEqual([]);
    expect(prepared.preserveTerminalIds).toEqual(new Set(["a-main-1", "a-global-1"]));

    finalizeProjectSwitchRendererCache("project-b");

    expect(isTerminalWarmInProjectSwitchCache("project-a", "a-main-1")).toBe(true);
    expect(isTerminalWarmInProjectSwitchCache("project-a", "a-global-1")).toBe(true);
    expect(isTerminalWarmInProjectSwitchCache("project-a", "a-feature-1")).toBe(false);
    expect(isTerminalWarmInProjectSwitchCache("project-b", "a-main-1")).toBe(false);
  });

  it("retains target cache during restore and then rotates cache to outgoing project", () => {
    prepareProjectSwitchRendererCache({
      outgoingProjectId: "project-a",
      targetProjectId: "project-b",
      outgoingActiveWorktreeId: "wt-a",
      outgoingTerminals: [
        { id: "a-1", worktreeId: "wt-a" },
        { id: "a-2", worktreeId: "wt-other" },
        { id: "a-global" },
      ],
    });
    finalizeProjectSwitchRendererCache("project-b");

    const prepared = prepareProjectSwitchRendererCache({
      outgoingProjectId: "project-b",
      targetProjectId: "project-a",
      outgoingActiveWorktreeId: "wt-b",
      outgoingTerminals: [
        { id: "b-1", worktreeId: "wt-b" },
        { id: "b-2", worktreeId: "wt-other" },
        { id: "b-global" },
      ],
    });

    expect(prepared.evictTerminalIds).toEqual([]);
    expect(prepared.preserveTerminalIds).toEqual(new Set(["a-1", "a-global", "b-1", "b-global"]));
    expect(isTerminalWarmInProjectSwitchCache("project-a", "a-1")).toBe(true);
    expect(isTerminalWarmInProjectSwitchCache("project-a", "a-2")).toBe(false);

    finalizeProjectSwitchRendererCache("project-a");

    expect(isTerminalWarmInProjectSwitchCache("project-b", "b-1")).toBe(true);
    expect(isTerminalWarmInProjectSwitchCache("project-b", "b-global")).toBe(true);
    expect(isTerminalWarmInProjectSwitchCache("project-b", "b-2")).toBe(false);
    expect(isTerminalWarmInProjectSwitchCache("project-a", "a-1")).toBe(false);
  });

  it("evicts unrelated cached project terminals when switching elsewhere", () => {
    prepareProjectSwitchRendererCache({
      outgoingProjectId: "project-a",
      targetProjectId: "project-b",
      outgoingActiveWorktreeId: "wt-a",
      outgoingTerminals: [
        { id: "a-1", worktreeId: "wt-a" },
        { id: "a-2", worktreeId: "wt-other" },
      ],
    });
    finalizeProjectSwitchRendererCache("project-b");

    const prepared = prepareProjectSwitchRendererCache({
      outgoingProjectId: "project-c",
      targetProjectId: "project-d",
      outgoingActiveWorktreeId: "wt-c",
      outgoingTerminals: [{ id: "c-1", worktreeId: "wt-c" }],
    });

    expect(prepared.evictTerminalIds).toEqual(["a-1"]);
    expect(prepared.preserveTerminalIds).toEqual(new Set(["c-1"]));
  });

  it("drops active-project cache markers on cancelled switch", () => {
    prepareProjectSwitchRendererCache({
      outgoingProjectId: "project-a",
      targetProjectId: "project-b",
      outgoingActiveWorktreeId: "wt-a",
      outgoingTerminals: [{ id: "a-1", worktreeId: "wt-a" }],
    });

    cancelPreparedProjectSwitchRendererCache("project-a");

    expect(isTerminalWarmInProjectSwitchCache("project-a", "a-1")).toBe(false);
  });
});
