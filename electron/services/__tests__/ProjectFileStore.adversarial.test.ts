import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";

const fsMock = vi.hoisted(() => ({
  readFile: vi.fn(),
  mkdir: vi.fn(),
}));

const fsSyncMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
}));

const utilsMock = vi.hoisted(() => ({
  resilientRename: vi.fn(),
  resilientAtomicWriteFile: vi.fn(),
}));

vi.mock("fs/promises", () => ({ default: fsMock, ...fsMock }));
vi.mock("fs", () => ({ ...fsSyncMock }));
vi.mock("../../utils/fs.js", () => utilsMock);

import { ProjectFileStore, RECIPES_SCHEMA_VERSION } from "../ProjectFileStore.js";

const VALID_ID = "a".repeat(64);
const INVALID_ID_TRAVERSAL = "../../../etc/passwd";
const CONFIG_DIR = path.normalize("/tmp/daintree-projects");
const EXPECTED_STATE_DIR = path.join(CONFIG_DIR, VALID_ID);
const EXPECTED_RECIPES_FILE = path.join(EXPECTED_STATE_DIR, "recipes.json");

function quarantineRegex(basePath: string, suffix: string): RegExp {
  const escaped = basePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}${suffix}$`);
}

function quarantineSuffixRegex(basePath: string, suffix: string): RegExp {
  const escaped = basePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}${suffix}\\d+$`);
}

describe("ProjectFileStore adversarial", () => {
  let store: ProjectFileStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new ProjectFileStore(CONFIG_DIR);
    utilsMock.resilientAtomicWriteFile.mockResolvedValue(undefined);
    utilsMock.resilientRename.mockResolvedValue(undefined);
    fsMock.mkdir.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("saveRecipes with an invalid projectId blocks all filesystem I/O", async () => {
    await expect(store.saveRecipes(INVALID_ID_TRAVERSAL, [])).rejects.toThrow(/Invalid project ID/);

    expect(fsMock.mkdir).not.toHaveBeenCalled();
    expect(utilsMock.resilientAtomicWriteFile).not.toHaveBeenCalled();
  });

  it("getRecipes with an invalid projectId returns [] without reading", async () => {
    const result = await store.getRecipes(INVALID_ID_TRAVERSAL);
    expect(result).toEqual([]);
    expect(fsMock.readFile).not.toHaveBeenCalled();
    expect(utilsMock.resilientRename).not.toHaveBeenCalled();
  });

  it("corrupted JSON is quarantined by renaming to .corrupted and returns []", async () => {
    fsMock.readFile.mockResolvedValue("{ not valid json");

    const result = await store.getRecipes(VALID_ID);

    expect(result).toEqual([]);
    expect(utilsMock.resilientRename).toHaveBeenCalledWith(
      EXPECTED_RECIPES_FILE,
      expect.stringMatching(quarantineSuffixRegex(EXPECTED_RECIPES_FILE, "\\.corrupted\\."))
    );
  });

  it("non-array, non-envelope JSON is quarantined and returns []", async () => {
    fsMock.readFile.mockResolvedValue(JSON.stringify({ notAnArray: true }));

    const result = await store.getRecipes(VALID_ID);

    expect(result).toEqual([]);
    expect(utilsMock.resilientRename).toHaveBeenCalledWith(
      EXPECTED_RECIPES_FILE,
      expect.stringMatching(quarantineSuffixRegex(EXPECTED_RECIPES_FILE, "\\.corrupted\\."))
    );
  });

  it("malformed recipe entries are filtered out — only structurally valid entries survive", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify([
        { id: "r1", name: "valid", terminals: [], createdAt: 1000 },
        null,
        "string",
        { id: "r2" }, // missing name/terminals/createdAt
        { id: "r3", name: "no terminals array" },
        { id: "r4", name: "valid again", terminals: [{ type: "terminal" }], createdAt: 1000 },
      ])
    );

    const result = await store.getRecipes(VALID_ID);

    expect(result.map((r) => r.id)).toEqual(["r1", "r4"]);
  });

  it("filters out recipes with deeply malformed terminal entries", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify([
        { id: "r1", name: "valid", terminals: [{ type: "terminal" }], createdAt: 1 },
        {
          id: "r2",
          name: "command is number",
          terminals: [{ type: "terminal", command: 123 }],
          createdAt: 2,
        },
        {
          id: "r3",
          name: "env is not a record",
          terminals: [{ type: "terminal", env: ["array", "not", "record"] }],
          createdAt: 3,
        },
        {
          id: "r4",
          name: "invalid exitBehavior",
          terminals: [{ type: "terminal", exitBehavior: "destroy" }],
          createdAt: 4,
        },
        { id: "r5", name: "also valid", terminals: [], createdAt: 5 },
      ])
    );

    const result = await store.getRecipes(VALID_ID);

    expect(result.map((r) => r.id)).toEqual(["r1", "r5"]);
  });

  it("filters out recipes with missing terminal type", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify([
        { id: "r1", name: "valid", terminals: [{ type: "terminal" }], createdAt: 1 },
        { id: "r2", name: "no terminal type", terminals: [{ title: "T" }], createdAt: 2 },
      ])
    );

    const result = await store.getRecipes(VALID_ID);

    expect(result.map((r) => r.id)).toEqual(["r1"]);
  });

  it("ENOENT on first write triggers mkdir + retry and eventually succeeds", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    utilsMock.resilientAtomicWriteFile
      .mockRejectedValueOnce(enoent)
      .mockResolvedValueOnce(undefined);

    await store.saveRecipes(VALID_ID, []);

    expect(fsMock.mkdir).toHaveBeenCalledWith(EXPECTED_STATE_DIR, { recursive: true });
    expect(utilsMock.resilientAtomicWriteFile).toHaveBeenCalledTimes(2);
  });

  it("non-ENOENT write errors are re-thrown without a mkdir retry", async () => {
    const eacces = Object.assign(new Error("EACCES"), { code: "EACCES" });
    utilsMock.resilientAtomicWriteFile.mockRejectedValue(eacces);

    await expect(store.saveRecipes(VALID_ID, [])).rejects.toThrow("EACCES");

    expect(fsMock.mkdir).not.toHaveBeenCalled();
    expect(utilsMock.resilientAtomicWriteFile).toHaveBeenCalledTimes(1);
  });

  it("updateRecipe on a missing recipe id throws and does not write", async () => {
    fsMock.readFile.mockResolvedValue(JSON.stringify([]));

    await expect(store.updateRecipe(VALID_ID, "missing", { name: "x" })).rejects.toThrow(
      /not found/
    );
    expect(utilsMock.resilientAtomicWriteFile).not.toHaveBeenCalled();
  });

  it("getRecipes returns [] when the recipes file doesn't exist (ENOENT handled gracefully)", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    fsMock.readFile.mockRejectedValue(enoent);

    const result = await store.getRecipes(VALID_ID);

    expect(result).toEqual([]);
    expect(utilsMock.resilientRename).not.toHaveBeenCalled();
  });

  it("quarantine rename failure does not throw — getRecipes still returns []", async () => {
    fsMock.readFile.mockResolvedValue("{ not valid json");
    utilsMock.resilientRename.mockRejectedValueOnce(new Error("EBUSY"));

    const result = await store.getRecipes(VALID_ID);
    expect(result).toEqual([]);
  });

  it("deleteRecipe filters the target out and writes the remaining recipes in envelope format", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify([
        { id: "keep", name: "k", terminals: [], createdAt: 1000 },
        { id: "drop", name: "d", terminals: [], createdAt: 1000 },
      ])
    );

    await store.deleteRecipe(VALID_ID, "drop");

    const write = utilsMock.resilientAtomicWriteFile.mock.calls[0];
    expect(write[0]).toBe(EXPECTED_RECIPES_FILE);
    const payload = JSON.parse(write[1] as string);
    expect(payload._schemaVersion).toBe(RECIPES_SCHEMA_VERSION);
    expect(payload.recipes.map((r: { id: string }) => r.id)).toEqual(["keep"]);
  });

  it("legacy bare-array recipes.json is read correctly", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify([{ id: "r1", name: "legacy recipe", terminals: [], createdAt: 1000 }])
    );

    const result = await store.getRecipes(VALID_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("r1");
    expect(utilsMock.resilientRename).not.toHaveBeenCalled();
  });

  it("envelope format recipes.json is read correctly", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        _schemaVersion: 1,
        recipes: [{ id: "r1", name: "envelope recipe", terminals: [], createdAt: 1000 }],
      })
    );

    const result = await store.getRecipes(VALID_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("r1");
    expect(utilsMock.resilientRename).not.toHaveBeenCalled();
  });

  it("saveRecipes always writes envelope format", async () => {
    await store.saveRecipes(VALID_ID, [{ id: "r1", name: "test", terminals: [], createdAt: 1000 }]);

    const write = utilsMock.resilientAtomicWriteFile.mock.calls[0];
    const payload = JSON.parse(write[1] as string);
    expect(payload._schemaVersion).toBe(RECIPES_SCHEMA_VERSION);
    expect(payload.recipes).toHaveLength(1);
    expect(payload.recipes[0].id).toBe("r1");
  });

  it("malformed envelope (missing recipes array) is quarantined", async () => {
    fsMock.readFile.mockResolvedValue(JSON.stringify({ _schemaVersion: 1, notRecipes: "bad" }));

    const result = await store.getRecipes(VALID_ID);

    expect(result).toEqual([]);
    expect(utilsMock.resilientRename).toHaveBeenCalledWith(
      EXPECTED_RECIPES_FILE,
      expect.stringMatching(quarantineSuffixRegex(EXPECTED_RECIPES_FILE, "\\.corrupted\\."))
    );
  });

  it("malformed envelope (recipes is not an array) is quarantined", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({ _schemaVersion: 1, recipes: "not-an-array" })
    );

    const result = await store.getRecipes(VALID_ID);

    expect(result).toEqual([]);
    expect(utilsMock.resilientRename).toHaveBeenCalledWith(
      EXPECTED_RECIPES_FILE,
      expect.stringMatching(quarantineSuffixRegex(EXPECTED_RECIPES_FILE, "\\.corrupted\\."))
    );
  });

  it("future-version envelope is quarantined to .future-v{N}", async () => {
    fsMock.readFile.mockResolvedValue(JSON.stringify({ _schemaVersion: 999, recipes: [] }));

    const result = await store.getRecipes(VALID_ID);

    expect(result).toEqual([]);
    expect(utilsMock.resilientRename).toHaveBeenCalledWith(
      EXPECTED_RECIPES_FILE,
      expect.stringMatching(quarantineRegex(EXPECTED_RECIPES_FILE, "\\.future-v999"))
    );
  });

  it("future-version quarantine uses timestamp suffix when destination exists", async () => {
    fsMock.readFile.mockResolvedValue(JSON.stringify({ _schemaVersion: 999, recipes: [] }));
    fsSyncMock.existsSync.mockImplementation((p: string) => (p as string).endsWith(".future-v999"));

    const result = await store.getRecipes(VALID_ID);

    expect(result).toEqual([]);
    expect(utilsMock.resilientRename).toHaveBeenCalledWith(
      EXPECTED_RECIPES_FILE,
      expect.stringMatching(quarantineSuffixRegex(EXPECTED_RECIPES_FILE, "\\.future-v999\\."))
    );
  });

  it("envelope with non-integer _schemaVersion is coerced to 0 and read normally", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        _schemaVersion: "not-a-number",
        recipes: [{ id: "r1", name: "still valid", terminals: [], createdAt: 1000 }],
      })
    );

    const result = await store.getRecipes(VALID_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("r1");
  });

  it("envelope with negative _schemaVersion is read normally", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        _schemaVersion: -1,
        recipes: [{ id: "r1", name: "valid", terminals: [], createdAt: 1000 }],
      })
    );

    const result = await store.getRecipes(VALID_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("r1");
  });

  it("round-trip: legacy bare array → read → save → read envelope", async () => {
    // First read: legacy bare array
    fsMock.readFile.mockResolvedValueOnce(
      JSON.stringify([{ id: "r1", name: "legacy", terminals: [], createdAt: 1000 }])
    );
    const recipes = await store.getRecipes(VALID_ID);
    expect(recipes).toHaveLength(1);
    expect(recipes[0]!.id).toBe("r1");

    // Save: should write envelope
    await store.saveRecipes(VALID_ID, recipes);
    const write = utilsMock.resilientAtomicWriteFile.mock.calls[0];
    const writtenPayload = JSON.parse(write[1] as string);
    expect(writtenPayload._schemaVersion).toBe(RECIPES_SCHEMA_VERSION);
    expect(writtenPayload.recipes).toHaveLength(1);

    // Second read: envelope comes back for the read
    fsMock.readFile.mockResolvedValueOnce(JSON.stringify(writtenPayload));
    const recipes2 = await store.getRecipes(VALID_ID);
    expect(recipes2).toHaveLength(1);
    expect(recipes2[0]!.id).toBe("r1");
  });

  it("ENOENT on readFile does not quarantine (file genuinely absent)", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    fsMock.readFile.mockRejectedValue(enoent);
    fsSyncMock.existsSync.mockReturnValue(false);

    const result = await store.getRecipes(VALID_ID);

    expect(result).toEqual([]);
    expect(utilsMock.resilientRename).not.toHaveBeenCalled();
  });

  it("non-ENOENT read errors throw (so mutators don't destroy data)", async () => {
    const eacces = Object.assign(new Error("EACCES"), { code: "EACCES" });
    fsMock.readFile.mockRejectedValue(eacces);

    await expect(store.getRecipes(VALID_ID)).rejects.toThrow("EACCES");
    expect(utilsMock.resilientRename).not.toHaveBeenCalled();
  });

  it("deleteRecipe does not write when getRecipes fails with non-ENOENT", async () => {
    const eacces = Object.assign(new Error("EACCES"), { code: "EACCES" });
    fsMock.readFile.mockRejectedValue(eacces);

    await expect(store.deleteRecipe(VALID_ID, "any")).rejects.toThrow("EACCES");
    expect(utilsMock.resilientAtomicWriteFile).not.toHaveBeenCalled();
  });

  it("addRecipe does not write when getRecipes fails with non-ENOENT", async () => {
    const eio = Object.assign(new Error("EIO"), { code: "EIO" });
    fsMock.readFile.mockRejectedValue(eio);

    await expect(
      store.addRecipe(VALID_ID, { id: "r1", name: "test", terminals: [], createdAt: 1000 })
    ).rejects.toThrow("EIO");
    expect(utilsMock.resilientAtomicWriteFile).not.toHaveBeenCalled();
  });
});
