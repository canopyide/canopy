import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ProjectSettingsManager } from "../ProjectSettingsManager.js";
import { generateProjectId } from "../projectStorePaths.js";

vi.mock("../CommandService.js", () => ({
  commandService: {
    invalidateOverridesCache: vi.fn(),
  },
}));

vi.mock("../ProjectEnvSecureStorage.js", () => ({
  projectEnvSecureStorage: {
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
    listKeys: vi.fn(() => []),
    deleteAllForProject: vi.fn(),
    migrateAllForProject: vi.fn(),
  },
}));

function createMockStore() {
  return {
    get: vi.fn(() => ({
      enabled: true,
      completedEnabled: true,
      waitingEnabled: true,
      soundEnabled: false,
      completedSoundFile: null,
      waitingSoundFile: null,
      escalationSoundFile: null,
      waitingEscalationEnabled: false,
      waitingEscalationDelayMs: 30_000,
    })),
    set: vi.fn(),
  } as unknown as ConstructorParameters<typeof ProjectSettingsManager>[1];
}

describe("ProjectSettingsManager caching", () => {
  let tempDir: string;
  let manager: ProjectSettingsManager;
  let projectId: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "daintree-settings-"));
    manager = new ProjectSettingsManager(tempDir, createMockStore());

    projectId = generateProjectId("/test/project");
    const projectDir = path.join(tempDir, projectId);
    await fs.mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns cached settings on second call without re-reading disk", async () => {
    const settingsPath = path.join(tempDir, projectId, "settings.json");
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ runCommands: [{ id: "npm-dev", name: "dev", command: "npm run dev" }] }),
      "utf-8"
    );

    const first = await manager.getProjectSettings(projectId);
    expect(first.runCommands).toHaveLength(1);

    const readSpy = vi.spyOn(fs, "readFile");
    const second = await manager.getProjectSettings(projectId);
    expect(second).toEqual(first);
    expect(readSpy).not.toHaveBeenCalled();
    readSpy.mockRestore();
  });

  it("invalidates cache on save so next read refreshes from disk", async () => {
    const settingsPath = path.join(tempDir, projectId, "settings.json");
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ runCommands: [{ id: "npm-dev", name: "dev", command: "npm run dev" }] }),
      "utf-8"
    );

    const first = await manager.getProjectSettings(projectId);
    expect(first.runCommands).toHaveLength(1);

    await manager.saveProjectSettings(projectId, {
      runCommands: [
        { id: "npm-dev", name: "dev", command: "npm run dev" },
        { id: "npm-build", name: "build", command: "npm run build" },
      ],
    });

    const readSpy = vi.spyOn(fs, "readFile");
    const afterSave = await manager.getProjectSettings(projectId);
    expect(readSpy).toHaveBeenCalled();
    expect(afterSave.runCommands).toHaveLength(2);
    readSpy.mockRestore();
  });

  it("does not cache when settings file does not exist", async () => {
    const nonexistentId = generateProjectId("/nonexistent/project");

    const first = await manager.getProjectSettings(nonexistentId);
    expect(first).toEqual({ runCommands: [] });

    const projectDir = path.join(tempDir, nonexistentId);
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, "settings.json"),
      JSON.stringify({ runCommands: [{ id: "npm-dev", name: "dev", command: "npm run dev" }] }),
      "utf-8"
    );

    const second = await manager.getProjectSettings(nonexistentId);
    expect(second.runCommands).toHaveLength(1);
  });

  it("does not cache when settings file contains invalid JSON", async () => {
    const settingsPath = path.join(tempDir, projectId, "settings.json");
    await fs.writeFile(settingsPath, "{{invalid json", "utf-8");

    const first = await manager.getProjectSettings(projectId);
    expect(first).toEqual({ runCommands: [] });

    await fs.writeFile(
      settingsPath,
      JSON.stringify({ runCommands: [{ id: "npm-dev", name: "dev", command: "npm run dev" }] }),
      "utf-8"
    );

    const second = await manager.getProjectSettings(projectId);
    expect(second.runCommands).toHaveLength(1);
  });

  it("re-reads after TTL expires", async () => {
    vi.useFakeTimers();
    try {
      const settingsPath = path.join(tempDir, projectId, "settings.json");
      await fs.writeFile(
        settingsPath,
        JSON.stringify({ runCommands: [{ id: "npm-dev", name: "dev", command: "npm run dev" }] }),
        "utf-8"
      );

      await manager.getProjectSettings(projectId);

      vi.advanceTimersByTime(31_000);

      const readSpy = vi.spyOn(fs, "readFile");
      await manager.getProjectSettings(projectId);
      expect(readSpy).toHaveBeenCalled();
      readSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("round-trips turbopackEnabled=false through save/load", async () => {
    await manager.saveProjectSettings(projectId, {
      runCommands: [],
      turbopackEnabled: false,
    });

    // Advance past cache TTL so we actually hit disk on read.
    const freshManager = new ProjectSettingsManager(tempDir, createMockStore());
    const loaded = await freshManager.getProjectSettings(projectId);
    expect(loaded.turbopackEnabled).toBe(false);
  });

  it("treats missing turbopackEnabled as undefined (default-on at read sites)", async () => {
    const settingsPath = path.join(tempDir, projectId, "settings.json");
    await fs.writeFile(settingsPath, JSON.stringify({ runCommands: [] }), "utf-8");

    const loaded = await manager.getProjectSettings(projectId);
    expect(loaded.turbopackEnabled).toBeUndefined();
  });

  it("rejects non-boolean turbopackEnabled in the settings file", async () => {
    const settingsPath = path.join(tempDir, projectId, "settings.json");
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ runCommands: [], turbopackEnabled: "yes" }),
      "utf-8"
    );

    const loaded = await manager.getProjectSettings(projectId);
    expect(loaded.turbopackEnabled).toBeUndefined();
  });

  it.each(["off", "workbench", "action", "system"] as const)(
    "round-trips daintreeMcpTier=%s through save/load",
    async (tier) => {
      await manager.saveProjectSettings(projectId, {
        runCommands: [],
        daintreeMcpTier: tier,
      });

      const freshManager = new ProjectSettingsManager(tempDir, createMockStore());
      const loaded = await freshManager.getProjectSettings(projectId);
      expect(loaded.daintreeMcpTier).toBe(tier);
    }
  );

  it("round-trips forgeProviderOverride through save/load", async () => {
    await manager.saveProjectSettings(projectId, {
      runCommands: [],
      forgeProviderOverride: "github",
    });

    const freshManager = new ProjectSettingsManager(tempDir, createMockStore());
    const loaded = await freshManager.getProjectSettings(projectId);
    expect(loaded.forgeProviderOverride).toBe("github");
  });

  it("treats missing forgeProviderOverride as undefined", async () => {
    const settingsPath = path.join(tempDir, projectId, "settings.json");
    await fs.writeFile(settingsPath, JSON.stringify({ runCommands: [] }), "utf-8");

    const loaded = await manager.getProjectSettings(projectId);
    expect(loaded.forgeProviderOverride).toBeUndefined();
  });

  it("preserves null forgeProviderOverride from disk as null", async () => {
    const settingsPath = path.join(tempDir, projectId, "settings.json");
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ runCommands: [], forgeProviderOverride: null }),
      "utf-8"
    );

    const loaded = await manager.getProjectSettings(projectId);
    expect(loaded.forgeProviderOverride).toBeNull();
  });

  it("rejects non-string forgeProviderOverride values from disk", async () => {
    const settingsPath = path.join(tempDir, projectId, "settings.json");
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ runCommands: [], forgeProviderOverride: 42 }),
      "utf-8"
    );

    const loaded = await manager.getProjectSettings(projectId);
    expect(loaded.forgeProviderOverride).toBeUndefined();
  });

  it("rejects unknown daintreeMcpTier values from disk", async () => {
    const settingsPath = path.join(tempDir, projectId, "settings.json");
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ runCommands: [], daintreeMcpTier: "godmode" }),
      "utf-8"
    );

    const loaded = await manager.getProjectSettings(projectId);
    expect(loaded.daintreeMcpTier).toBeUndefined();
  });

  it("preserves the deprecated exposeDaintreeMcpToAgents flag for migration", async () => {
    const settingsPath = path.join(tempDir, projectId, "settings.json");
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ runCommands: [], exposeDaintreeMcpToAgents: true }),
      "utf-8"
    );

    const loaded = await manager.getProjectSettings(projectId);
    expect(loaded.exposeDaintreeMcpToAgents).toBe(true);
    expect(loaded.daintreeMcpTier).toBeUndefined();
  });

  it("loads settings whose JSON is prefixed with a UTF-8 BOM", async () => {
    const settingsPath = path.join(tempDir, projectId, "settings.json");
    const json = JSON.stringify({
      runCommands: [{ id: "npm-dev", name: "dev", command: "npm run dev" }],
    });
    await fs.writeFile(settingsPath, "﻿" + json, "utf-8");

    const loaded = await manager.getProjectSettings(projectId);
    expect(loaded.runCommands).toHaveLength(1);
    expect(loaded.runCommands?.[0]?.command).toBe("npm run dev");

    // Verify the BOM-prefixed file was not quarantined as corrupted.
    const dirEntries = await fs.readdir(path.join(tempDir, projectId));
    expect(dirEntries.some((name) => name.includes(".corrupted."))).toBe(false);
  });

  it("does not quarantine the settings file on transient (non-SyntaxError) read failures", async () => {
    const settingsPath = path.join(tempDir, projectId, "settings.json");
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ runCommands: [{ id: "npm-dev", name: "dev", command: "npm run dev" }] }),
      "utf-8"
    );

    const enoent = Object.assign(new Error("ENOENT: file disappeared"), { code: "ENOENT" });
    const readSpy = vi.spyOn(fs, "readFile").mockRejectedValueOnce(enoent);

    const result = await manager.getProjectSettings(projectId);
    expect(result).toEqual({ runCommands: [] });

    readSpy.mockRestore();

    // Original file untouched, no quarantine entry created.
    const dirEntries = await fs.readdir(path.join(tempDir, projectId));
    expect(dirEntries).toContain("settings.json");
    expect(dirEntries.some((name) => name.includes(".corrupted."))).toBe(false);

    // After the transient failure, a normal subsequent read should still work.
    const recovered = await manager.getProjectSettings(projectId);
    expect(recovered.runCommands).toHaveLength(1);
  });

  it("still quarantines settings files that contain truly invalid JSON", async () => {
    const settingsPath = path.join(tempDir, projectId, "settings.json");
    await fs.writeFile(settingsPath, "{{invalid json", "utf-8");

    const result = await manager.getProjectSettings(projectId);
    expect(result).toEqual({ runCommands: [] });

    const dirEntries = await fs.readdir(path.join(tempDir, projectId));
    expect(dirEntries.some((name) => name.includes(".corrupted."))).toBe(true);
    expect(dirEntries).not.toContain("settings.json");
  });

  it.runIf(process.platform !== "win32")(
    "writes the settings file with mode 0o600 on POSIX",
    async () => {
      await manager.saveProjectSettings(projectId, { runCommands: [] });

      const settingsPath = path.join(tempDir, projectId, "settings.json");
      const stat = await fs.stat(settingsPath);
      expect(stat.mode & 0o777).toBe(0o600);
    }
  );

  it("does not quarantine on permission errors and surfaces them via console.error", async () => {
    const settingsPath = path.join(tempDir, projectId, "settings.json");
    await fs.writeFile(settingsPath, JSON.stringify({ runCommands: [] }), "utf-8");

    const eacces = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    const readSpy = vi.spyOn(fs, "readFile").mockRejectedValueOnce(eacces);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await manager.getProjectSettings(projectId);
    expect(result).toEqual({ runCommands: [] });
    expect(errorSpy).toHaveBeenCalledTimes(1);

    readSpy.mockRestore();
    errorSpy.mockRestore();

    const dirEntries = await fs.readdir(path.join(tempDir, projectId));
    expect(dirEntries).toContain("settings.json");
    expect(dirEntries.some((name) => name.includes(".corrupted."))).toBe(false);
  });

  it("preserves a blank secure env value through resolution rather than treating it as unresolved", async () => {
    const { projectEnvSecureStorage } = await import("../ProjectEnvSecureStorage.js");
    const getMock = projectEnvSecureStorage.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockImplementation((_pid: string, key: string) =>
      key === "OPTIONAL_TOKEN" ? "" : undefined
    );

    const settingsPath = path.join(tempDir, projectId, "settings.json");
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ runCommands: [], secureEnvironmentVariables: ["OPTIONAL_TOKEN"] }),
      "utf-8"
    );

    const loaded = await manager.getProjectSettings(projectId);
    expect(loaded.environmentVariables?.OPTIONAL_TOKEN).toBe("");
    expect(loaded.unresolvedSecureEnvironmentVariables).toBeUndefined();

    getMock.mockReset();
    getMock.mockReturnValue(undefined);
  });
});
