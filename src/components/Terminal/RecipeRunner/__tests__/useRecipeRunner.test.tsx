// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const runRecipeWithResultsMock = vi.fn();
const getRecipeByIdMock = vi.fn();

let mockRecipes: Array<{
  id: string;
  name: string;
  terminals: Array<{
    type: string;
    title?: string;
    command?: string;
    initialPrompt?: string;
    env?: Record<string, string>;
  }>;
  worktreeId?: string;
  createdAt: number;
}> = [];

let mockWorktreeData: Record<string, { issueNumber?: number; prNumber?: number; branch?: string }> =
  {};

vi.mock("@/store/recipeStore", () => ({
  useRecipeStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({
        recipes: mockRecipes,
        runRecipeWithResults: runRecipeWithResultsMock,
        updateRecipe: vi.fn(),
        deleteRecipe: vi.fn(),
        createRecipe: vi.fn(),
        getRecipeById: getRecipeByIdMock,
      }),
    { getState: () => ({ recipes: mockRecipes, runRecipeWithResults: runRecipeWithResultsMock }) }
  ),
}));

vi.mock("@/store/createWorktreeStore", () => ({
  getCurrentViewStore: () => ({
    getState: () => ({
      worktrees: new Map(Object.entries(mockWorktreeData)),
    }),
  }),
}));

vi.mock("@/store/projectSettingsStore", () => ({
  useProjectSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({ allDetectedRunners: [] }),
}));

vi.mock("@/services/ActionService", () => ({
  actionService: { dispatch: vi.fn() },
}));

vi.mock("@/config/agents", () => ({
  getAgentDisplayTitle: (id: string) =>
    id === "claude" ? "Claude Code" : id === "codex" ? "Codex" : id,
}));

import { useRecipeRunner } from "../useRecipeRunner";
import type { TerminalRecipe } from "@/types";

function makeRecipe(
  overrides: Partial<TerminalRecipe> & { id: string; name: string }
): TerminalRecipe {
  return {
    terminals: [{ type: "terminal", env: {} }],
    createdAt: Date.now(),
    ...overrides,
  } as TerminalRecipe;
}

describe("useRecipeRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecipes = [];
    mockWorktreeData = {};
    runRecipeWithResultsMock.mockResolvedValue({ spawned: [], failed: [] });
    getRecipeByIdMock.mockImplementation((id: string) => mockRecipes.find((r) => r.id === id));
  });

  it("calls runRecipeWithResults with recipe context on handleRun", async () => {
    const recipe = makeRecipe({
      id: "r1",
      name: "Test",
      terminals: [{ type: "terminal", command: "echo hi", env: {} }],
    });
    mockRecipes = [recipe];
    mockWorktreeData = { "wt-1": { issueNumber: 42, branch: "feature/x" } };
    runRecipeWithResultsMock.mockResolvedValue({
      spawned: [{ index: 0, terminalId: "t1" }],
      failed: [],
    });

    const { result } = renderHook(() =>
      useRecipeRunner({ activeWorktreeId: "wt-1", defaultCwd: "/tmp" })
    );

    await act(async () => {
      result.current.handleRun("r1");
    });

    expect(runRecipeWithResultsMock).toHaveBeenCalledWith(
      "r1",
      "/tmp",
      "wt-1",
      { issueNumber: 42, prNumber: undefined, worktreePath: "/tmp", branchName: "feature/x" },
      { spawnedBy: "recipe" }
    );
  });

  it("sets spawnBanner on partial failure", async () => {
    const recipe = makeRecipe({
      id: "r1",
      name: "Multi Terminal",
      terminals: [
        { type: "terminal", title: "Shell", command: "npm test", env: {} },
        { type: "terminal", title: "Watch", command: "npm watch", env: {} },
      ],
    });
    mockRecipes = [recipe];
    runRecipeWithResultsMock.mockResolvedValue({
      spawned: [{ index: 0, terminalId: "t1" }],
      failed: [{ index: 1, error: "Panel limit reached" }],
    });

    const { result } = renderHook(() =>
      useRecipeRunner({ activeWorktreeId: "wt-1", defaultCwd: "/tmp" })
    );

    await act(async () => {
      result.current.handleRun("r1");
    });

    expect(result.current.spawnBanner).not.toBeNull();
    expect(result.current.spawnBanner!.spawned).toBe(1);
    expect(result.current.spawnBanner!.total).toBe(2);
    expect(result.current.spawnBanner!.failed).toHaveLength(1);
    expect(result.current.spawnBanner!.failed[0]!.name).toBe("Watch");
  });

  it("does not set spawnBanner when all terminals succeed", async () => {
    const recipe = makeRecipe({
      id: "r1",
      name: "All Good",
      terminals: [
        { type: "terminal", title: "A", command: "echo a", env: {} },
        { type: "terminal", title: "B", command: "echo b", env: {} },
      ],
    });
    mockRecipes = [recipe];
    runRecipeWithResultsMock.mockResolvedValue({
      spawned: [
        { index: 0, terminalId: "t1" },
        { index: 1, terminalId: "t2" },
      ],
      failed: [],
    });

    const { result } = renderHook(() =>
      useRecipeRunner({ activeWorktreeId: "wt-1", defaultCwd: "/tmp" })
    );

    await act(async () => {
      result.current.handleRun("r1");
    });

    expect(result.current.spawnBanner).toBeNull();
  });

  it("sets spawnBanner when unresolved variables exist", async () => {
    const recipe = makeRecipe({
      id: "r1",
      name: "Missing Vars",
      terminals: [
        { type: "terminal", title: "A", command: "gh issue view {{issue_number}}", env: {} },
      ],
    });
    mockRecipes = [recipe];
    runRecipeWithResultsMock.mockResolvedValue({
      spawned: [{ index: 0, terminalId: "t1" }],
      failed: [],
    });

    const { result } = renderHook(() =>
      useRecipeRunner({ activeWorktreeId: "wt-1", defaultCwd: "/tmp" })
    );

    await act(async () => {
      result.current.handleRun("r1");
    });

    expect(result.current.spawnBanner).not.toBeNull();
    expect(result.current.spawnBanner!.unresolvedVars).toContain("issue_number");
  });

  it("dismissSpawnBanner clears the banner", async () => {
    const recipe = makeRecipe({
      id: "r1",
      name: "Test",
      terminals: [
        { type: "terminal", title: "A", command: "gh issue view {{issue_number}}", env: {} },
      ],
    });
    mockRecipes = [recipe];
    runRecipeWithResultsMock.mockResolvedValue({
      spawned: [{ index: 0, terminalId: "t1" }],
      failed: [],
    });

    const { result } = renderHook(() =>
      useRecipeRunner({ activeWorktreeId: "wt-1", defaultCwd: "/tmp" })
    );

    await act(async () => {
      result.current.handleRun("r1");
    });
    expect(result.current.spawnBanner).not.toBeNull();

    act(() => {
      result.current.dismissSpawnBanner();
    });
    expect(result.current.spawnBanner).toBeNull();
  });

  it("retryFailed calls runRecipeWithResults with failed terminal indices", async () => {
    const recipe = makeRecipe({
      id: "r1",
      name: "Multi",
      terminals: [
        { type: "terminal", title: "A", command: "echo a", env: {} },
        { type: "terminal", title: "B", command: "echo b", env: {} },
        { type: "terminal", title: "C", command: "echo c", env: {} },
      ],
    });
    mockRecipes = [recipe];
    mockWorktreeData = { "wt-1": { branch: "main" } };

    runRecipeWithResultsMock
      .mockResolvedValueOnce({
        spawned: [
          { index: 0, terminalId: "t1" },
          { index: 2, terminalId: "t3" },
        ],
        failed: [{ index: 1, error: "Panel limit reached" }],
      })
      .mockResolvedValueOnce({
        spawned: [{ index: 1, terminalId: "t2" }],
        failed: [],
      });

    const { result } = renderHook(() =>
      useRecipeRunner({ activeWorktreeId: "wt-1", defaultCwd: "/tmp" })
    );

    await act(async () => {
      result.current.handleRun("r1");
    });

    await act(async () => {
      result.current.retryFailed();
    });

    expect(runRecipeWithResultsMock).toHaveBeenCalledTimes(2);
    const retryCall = runRecipeWithResultsMock.mock.calls[1]!;
    expect(retryCall[0]).toBe("r1");
    expect(retryCall[4]).toEqual(expect.objectContaining({ terminalIndices: [1] }));
  });

  it("uses getAgentDisplayTitle for agent terminal names", async () => {
    const recipe = makeRecipe({
      id: "r1",
      name: "Agent Recipe",
      terminals: [{ type: "claude", title: "", command: undefined, env: {} }],
    });
    mockRecipes = [recipe];
    runRecipeWithResultsMock.mockResolvedValue({
      spawned: [],
      failed: [{ index: 0, error: "Failed" }],
    });

    const { result } = renderHook(() =>
      useRecipeRunner({ activeWorktreeId: "wt-1", defaultCwd: "/tmp" })
    );

    await act(async () => {
      result.current.handleRun("r1");
    });

    expect(result.current.spawnBanner!.failed[0]!.name).toBe("Claude Code");
  });
});
