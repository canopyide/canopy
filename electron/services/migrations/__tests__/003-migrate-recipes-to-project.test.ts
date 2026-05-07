import { beforeEach, describe, expect, it, vi } from "vitest";

const projectStoreMock = vi.hoisted(() => ({
  getCurrentProjectId: vi.fn<[], string | null>(() => "proj-1"),
  getProjectById: vi.fn<[string], unknown>(() => ({ id: "proj-1" })),
  getRecipes: vi.fn<[string], Promise<unknown[]>>(async () => []),
  saveRecipes: vi.fn<[string, unknown[]], Promise<void>>(async () => {}),
}));

vi.mock("../../ProjectStore.js", () => ({ projectStore: projectStoreMock }));

import { migration003 } from "../003-migrate-recipes-to-project.js";

function makeStoreMock(data: Record<string, unknown>) {
  return {
    get: vi.fn((key: string) => data[key]),
    set: vi.fn((key: string, value: unknown) => {
      data[key] = value;
    }),
  } as unknown as Parameters<typeof migration003.up>[0];
}

const legacyRecipe = {
  id: "r1",
  name: "Recipe One",
  worktreeId: "wt-1",
  terminals: [{ launchAgentId: "claude", title: "Agent", command: "go", env: {} }],
  createdAt: 1000,
};

describe("migration003 — migrate global recipes to project", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectStoreMock.getCurrentProjectId.mockReturnValue("proj-1");
    projectStoreMock.getProjectById.mockReturnValue({ id: "proj-1" });
    projectStoreMock.getRecipes.mockResolvedValue([]);
    projectStoreMock.saveRecipes.mockResolvedValue(undefined);
  });

  it("has version 3", () => {
    expect(migration003.version).toBe(3);
  });

  it("rethrows when saveRecipes fails and preserves legacy recipes", async () => {
    const data: Record<string, unknown> = {
      appState: { recipes: [legacyRecipe] },
    };
    const store = makeStoreMock(data);
    const saveError = new Error("disk full");
    projectStoreMock.saveRecipes.mockRejectedValueOnce(saveError);

    await expect(migration003.up(store)).rejects.toThrow("disk full");

    // Legacy recipes must NOT be cleared so the next migration retry sees them
    const after = data.appState as { recipes: unknown[] };
    expect(after.recipes).toEqual([legacyRecipe]);
    expect(store.set).not.toHaveBeenCalledWith(
      "appState",
      expect.objectContaining({ recipes: [] })
    );
  });

  it("rethrows when getRecipes fails and preserves legacy recipes", async () => {
    const data: Record<string, unknown> = {
      appState: { recipes: [legacyRecipe] },
    };
    const store = makeStoreMock(data);
    projectStoreMock.getRecipes.mockRejectedValueOnce(new Error("read failure"));

    await expect(migration003.up(store)).rejects.toThrow("read failure");

    const after = data.appState as { recipes: unknown[] };
    expect(after.recipes).toEqual([legacyRecipe]);
    expect(store.set).not.toHaveBeenCalledWith(
      "appState",
      expect.objectContaining({ recipes: [] })
    );
    expect(projectStoreMock.saveRecipes).not.toHaveBeenCalled();
  });

  it("clears legacy recipes after a successful save", async () => {
    const data: Record<string, unknown> = {
      appState: { recipes: [legacyRecipe], otherField: "keep" },
    };
    const store = makeStoreMock(data);

    await migration003.up(store);

    expect(projectStoreMock.saveRecipes).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledWith("appState", { recipes: [], otherField: "keep" });
  });

  it("no-op when there are no global recipes", async () => {
    const data: Record<string, unknown> = { appState: { recipes: [] } };
    const store = makeStoreMock(data);

    await migration003.up(store);

    expect(projectStoreMock.getRecipes).not.toHaveBeenCalled();
    expect(projectStoreMock.saveRecipes).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });

  it("no-op when no current project is set (preserves recipes for later)", async () => {
    projectStoreMock.getCurrentProjectId.mockReturnValueOnce(null);
    const data: Record<string, unknown> = { appState: { recipes: [legacyRecipe] } };
    const store = makeStoreMock(data);

    await migration003.up(store);

    expect(projectStoreMock.getRecipes).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
    const after = data.appState as { recipes: unknown[] };
    expect(after.recipes).toEqual([legacyRecipe]);
  });

  it("no-op when current project ID is not in project list", async () => {
    projectStoreMock.getProjectById.mockReturnValueOnce(null);
    const data: Record<string, unknown> = { appState: { recipes: [legacyRecipe] } };
    const store = makeStoreMock(data);

    await migration003.up(store);

    expect(projectStoreMock.getRecipes).not.toHaveBeenCalled();
    expect(projectStoreMock.saveRecipes).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });

  it("dedupes recipes already present in the project", async () => {
    projectStoreMock.getRecipes.mockResolvedValueOnce([
      {
        id: "r1",
        name: "Already Present",
        projectId: "proj-1",
        terminals: [],
        createdAt: 500,
      },
    ]);
    const data: Record<string, unknown> = { appState: { recipes: [legacyRecipe] } };
    const store = makeStoreMock(data);

    await migration003.up(store);

    // No new recipes to save (the only legacy recipe was a duplicate),
    // but legacy storage is still cleared since the source-of-truth is the project.
    expect(projectStoreMock.saveRecipes).not.toHaveBeenCalled();
    expect(store.set).toHaveBeenCalledWith("appState", expect.objectContaining({ recipes: [] }));
  });
});
