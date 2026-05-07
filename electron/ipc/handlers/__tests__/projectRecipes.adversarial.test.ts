import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ipcHandlers = vi.hoisted(() => new Map<string, unknown>());
const ipcMainMock = vi.hoisted(() => ({
  handle: vi.fn((channel: string, fn: unknown) => ipcHandlers.set(channel, fn)),
  removeHandler: vi.fn((channel: string) => ipcHandlers.delete(channel)),
}));

const projectStoreMock = vi.hoisted(() => ({
  getProjectById: vi.fn(() => undefined),
  getRecipes: vi.fn(() => []),
  saveRecipes: vi.fn(),
  addRecipe: vi.fn(),
  updateRecipe: vi.fn(),
  deleteRecipe: vi.fn(),
  readInRepoRecipes: vi.fn(() => []),
  writeInRepoRecipe: vi.fn(),
  deleteInRepoRecipe: vi.fn(),
  reconcileProjectRecipes: vi.fn(),
}));

vi.mock("electron", () => ({ ipcMain: ipcMainMock, dialog: {} }));
vi.mock("../../../services/ProjectStore.js", () => ({ projectStore: projectStoreMock }));

import { registerProjectRecipesHandlers } from "../projectRecipes.js";
import { CHANNELS } from "../../channels.js";
import type { HandlerDependencies } from "../../types.js";

type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

function getHandler(channel: string): Handler {
  const fn = ipcHandlers.get(channel);
  if (!fn) throw new Error(`handler not registered: ${channel}`);
  return fn as Handler;
}

function fakeEvent(): Electron.IpcMainInvokeEvent {
  return { sender: {} as Electron.WebContents } as Electron.IpcMainInvokeEvent;
}

const validRecipe = () => ({
  id: "r1",
  name: "My Recipe",
  projectId: "p1",
  terminals: [],
  createdAt: 1000,
});

describe("projectRecipes IPC adversarial", () => {
  let cleanup: () => void;

  beforeEach(() => {
    ipcHandlers.clear();
    vi.clearAllMocks();
    cleanup = registerProjectRecipesHandlers({} as HandlerDependencies);
  });

  afterEach(() => {
    cleanup();
  });

  it("addRecipe rejects non-finite createdAt (NaN)", async () => {
    await expect(
      getHandler(CHANNELS.PROJECT_ADD_RECIPE)(fakeEvent(), {
        projectId: "p1",
        recipe: { ...validRecipe(), createdAt: Number.NaN },
      })
    ).rejects.toThrow(/createdAt/);
    expect(projectStoreMock.addRecipe).not.toHaveBeenCalled();
  });

  it("addRecipe rejects non-finite createdAt (Infinity)", async () => {
    await expect(
      getHandler(CHANNELS.PROJECT_ADD_RECIPE)(fakeEvent(), {
        projectId: "p1",
        recipe: { ...validRecipe(), createdAt: Number.POSITIVE_INFINITY },
      })
    ).rejects.toThrow(/createdAt/);
    expect(projectStoreMock.addRecipe).not.toHaveBeenCalled();
  });

  it("addRecipe rejects whitespace-only name", async () => {
    await expect(
      getHandler(CHANNELS.PROJECT_ADD_RECIPE)(fakeEvent(), {
        projectId: "p1",
        recipe: { ...validRecipe(), name: "   " },
      })
    ).rejects.toThrow(/required fields|name/i);
    expect(projectStoreMock.addRecipe).not.toHaveBeenCalled();
  });

  it("addRecipe rejects whitespace-only id", async () => {
    await expect(
      getHandler(CHANNELS.PROJECT_ADD_RECIPE)(fakeEvent(), {
        projectId: "p1",
        recipe: { ...validRecipe(), id: "  \t " },
      })
    ).rejects.toThrow(/required fields|id/i);
    expect(projectStoreMock.addRecipe).not.toHaveBeenCalled();
  });

  it("addRecipe rejects projectId mismatch", async () => {
    await expect(
      getHandler(CHANNELS.PROJECT_ADD_RECIPE)(fakeEvent(), {
        projectId: "p1",
        recipe: { ...validRecipe(), projectId: "p2" },
      })
    ).rejects.toThrow(/projectId/);
    expect(projectStoreMock.addRecipe).not.toHaveBeenCalled();
  });

  it("addRecipe accepts a well-formed recipe and forwards it to the project store", async () => {
    const recipe = validRecipe();
    await getHandler(CHANNELS.PROJECT_ADD_RECIPE)(fakeEvent(), { projectId: "p1", recipe });
    expect(projectStoreMock.addRecipe).toHaveBeenCalledWith("p1", recipe);
  });

  it("updateRecipe rejects patches that attempt to rewrite immutable id", async () => {
    await expect(
      getHandler(CHANNELS.PROJECT_UPDATE_RECIPE)(fakeEvent(), {
        projectId: "p1",
        recipeId: "r1",
        updates: { id: "new-id" } as unknown as Record<string, unknown>,
      })
    ).rejects.toThrow(/immutable|id/i);
    expect(projectStoreMock.updateRecipe).not.toHaveBeenCalled();
  });

  it("updateRecipe rejects patches with projectId", async () => {
    await expect(
      getHandler(CHANNELS.PROJECT_UPDATE_RECIPE)(fakeEvent(), {
        projectId: "p1",
        recipeId: "r1",
        updates: { projectId: "p2" } as unknown as Record<string, unknown>,
      })
    ).rejects.toThrow(/immutable|projectId/i);
    expect(projectStoreMock.updateRecipe).not.toHaveBeenCalled();
  });

  it("updateRecipe rejects patches with createdAt", async () => {
    await expect(
      getHandler(CHANNELS.PROJECT_UPDATE_RECIPE)(fakeEvent(), {
        projectId: "p1",
        recipeId: "r1",
        updates: { createdAt: 999 } as unknown as Record<string, unknown>,
      })
    ).rejects.toThrow(/immutable|createdAt/i);
    expect(projectStoreMock.updateRecipe).not.toHaveBeenCalled();
  });

  it("updateRecipe rejects non-array terminals", async () => {
    await expect(
      getHandler(CHANNELS.PROJECT_UPDATE_RECIPE)(fakeEvent(), {
        projectId: "p1",
        recipeId: "r1",
        updates: { terminals: "oops" } as unknown as Record<string, unknown>,
      })
    ).rejects.toThrow(/terminals/i);
    expect(projectStoreMock.updateRecipe).not.toHaveBeenCalled();
  });

  it("updateRecipe rejects array updates payload", async () => {
    await expect(
      getHandler(CHANNELS.PROJECT_UPDATE_RECIPE)(fakeEvent(), {
        projectId: "p1",
        recipeId: "r1",
        updates: [] as unknown as Record<string, unknown>,
      })
    ).rejects.toThrow(/Invalid updates/);
    expect(projectStoreMock.updateRecipe).not.toHaveBeenCalled();
  });

  it("updateRecipe forwards a clean rename patch", async () => {
    await getHandler(CHANNELS.PROJECT_UPDATE_RECIPE)(fakeEvent(), {
      projectId: "p1",
      recipeId: "r1",
      updates: { name: "New Name" },
    });
    expect(projectStoreMock.updateRecipe).toHaveBeenCalledWith("p1", "r1", { name: "New Name" });
  });

  it("deleteRecipe rejects empty recipeId", async () => {
    await expect(
      getHandler(CHANNELS.PROJECT_DELETE_RECIPE)(fakeEvent(), { projectId: "p1", recipeId: "" })
    ).rejects.toThrow(/Invalid recipe ID/);
    expect(projectStoreMock.deleteRecipe).not.toHaveBeenCalled();
  });

  it("deleteRecipe rejects empty projectId", async () => {
    await expect(
      getHandler(CHANNELS.PROJECT_DELETE_RECIPE)(fakeEvent(), { projectId: "", recipeId: "r1" })
    ).rejects.toThrow(/Invalid project ID/);
    expect(projectStoreMock.deleteRecipe).not.toHaveBeenCalled();
  });

  it("cleanup removes all eleven handlers", () => {
    expect(ipcHandlers.size).toBe(11);
    cleanup();
    expect(ipcHandlers.size).toBe(0);
  });
});
