import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ForgeProviderEntry, ResolvedForgeProvider } from "../../../../shared/types/forge.js";

const ipcMainMock = vi.hoisted(() => ({
  handle: vi.fn(),
  removeHandler: vi.fn(),
}));

vi.mock("electron", () => ({ ipcMain: ipcMainMock }));

const storeMock = vi.hoisted(() => {
  const data: Record<string, unknown> = {};
  return {
    get: vi.fn((key: string) => data[key]),
    set: vi.fn((key: string, value: unknown) => {
      data[key] = value;
    }),
    _data: data,
  };
});

vi.mock("../../../store.js", () => ({ store: storeMock }));

const registryMock = vi.hoisted(() => ({
  getRegisteredForgeProviders: vi.fn<() => ForgeProviderEntry[]>(() => []),
}));

vi.mock("../../../services/forgeProviderRegistry.js", () => registryMock);

const resolverMock = vi.hoisted(() => ({
  resolveForgeProvider: vi.fn<
    (projectId: string, remoteUrl?: string) => Promise<ResolvedForgeProvider>
  >(async () => ({ entry: null, resolvedVia: null })),
}));

vi.mock("../../../services/forgeProviderResolver.js", () => resolverMock);

import { registerForgeSettingsHandlers } from "../forgeSettings.js";

function findHandler(channel: string): (...args: unknown[]) => unknown {
  const entry = ipcMainMock.handle.mock.calls.find((c: unknown[]) => c[0] === channel);
  if (!entry) throw new Error(`handler not registered for ${channel}`);
  return entry[1] as (...args: unknown[]) => unknown;
}

describe("registerForgeSettingsHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(storeMock._data)) {
      delete storeMock._data[key];
    }
    registryMock.getRegisteredForgeProviders.mockReturnValue([]);
  });

  it("registers four IPC handlers", () => {
    const cleanup = registerForgeSettingsHandlers();
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(4);
    expect(ipcMainMock.handle).toHaveBeenCalledWith("forge:get-settings", expect.any(Function));
    expect(ipcMainMock.handle).toHaveBeenCalledWith(
      "forge:set-default-provider",
      expect.any(Function)
    );
    expect(ipcMainMock.handle).toHaveBeenCalledWith("forge:get-providers", expect.any(Function));
    expect(ipcMainMock.handle).toHaveBeenCalledWith("forge:resolve-provider", expect.any(Function));
    cleanup();
  });

  it("getSettings returns null defaultProviderId when key is absent", () => {
    registerForgeSettingsHandlers();
    const getSettings = findHandler("forge:get-settings");
    expect(getSettings(null)).toEqual({ defaultProviderId: null });
  });

  it("getSettings returns the stored providerId when present", () => {
    storeMock._data["forgeDefaultProviderId"] = "acme.gitea";
    registerForgeSettingsHandlers();
    const getSettings = findHandler("forge:get-settings");
    expect(getSettings(null)).toEqual({ defaultProviderId: "acme.gitea" });
  });

  it("getSettings coerces non-string stored values to null", () => {
    storeMock._data["forgeDefaultProviderId"] = 42;
    registerForgeSettingsHandlers();
    const getSettings = findHandler("forge:get-settings");
    expect(getSettings(null)).toEqual({ defaultProviderId: null });
  });

  it("setDefaultProvider persists a string id and echoes it back", () => {
    registerForgeSettingsHandlers();
    const setDefault = findHandler("forge:set-default-provider");
    expect(setDefault(null, "acme.gitea")).toEqual({ defaultProviderId: "acme.gitea" });
    expect(storeMock.set).toHaveBeenCalledWith("forgeDefaultProviderId", "acme.gitea");
  });

  it("setDefaultProvider clears the value when called with null", () => {
    storeMock._data["forgeDefaultProviderId"] = "acme.gitea";
    registerForgeSettingsHandlers();
    const setDefault = findHandler("forge:set-default-provider");
    expect(setDefault(null, null)).toEqual({ defaultProviderId: null });
    expect(storeMock.set).toHaveBeenCalledWith("forgeDefaultProviderId", null);
  });

  it("setDefaultProvider treats empty string as null", () => {
    registerForgeSettingsHandlers();
    const setDefault = findHandler("forge:set-default-provider");
    expect(setDefault(null, "")).toEqual({ defaultProviderId: null });
    expect(storeMock.set).toHaveBeenCalledWith("forgeDefaultProviderId", null);
  });

  it("setDefaultProvider treats non-string payloads as null", () => {
    registerForgeSettingsHandlers();
    const setDefault = findHandler("forge:set-default-provider");
    expect(setDefault(null, 42)).toEqual({ defaultProviderId: null });
    expect(storeMock.set).toHaveBeenCalledWith("forgeDefaultProviderId", null);
  });

  it("getProviders returns the live registry contents", () => {
    const entries: ForgeProviderEntry[] = [
      {
        pluginId: "acme.gitea",
        contribution: {
          id: "gitea",
          name: "Gitea",
          matches: ["gitea.example.com"],
        },
      },
    ];
    registryMock.getRegisteredForgeProviders.mockReturnValue(entries);
    registerForgeSettingsHandlers();
    const getProviders = findHandler("forge:get-providers");
    expect(getProviders(null)).toEqual(entries);
  });

  it("cleanup removes all four handlers", () => {
    const cleanup = registerForgeSettingsHandlers();
    cleanup();
    expect(ipcMainMock.removeHandler).toHaveBeenCalledTimes(4);
  });

  it("resolveProvider delegates to the resolver and forwards its return value", async () => {
    const entry: ForgeProviderEntry = {
      pluginId: "builtin",
      contribution: { id: "github", name: "GitHub", matches: ["github.com"] },
    };
    const resolved: ResolvedForgeProvider = { entry, resolvedVia: "hostname" };
    resolverMock.resolveForgeProvider.mockResolvedValueOnce(resolved);
    registerForgeSettingsHandlers();
    const resolveProvider = findHandler("forge:resolve-provider");
    await expect(resolveProvider(null, "project-1")).resolves.toEqual(resolved);
    expect(resolverMock.resolveForgeProvider).toHaveBeenCalledWith("project-1", undefined);
  });

  it("resolveProvider forwards the optional remoteUrl when provided", async () => {
    const entry: ForgeProviderEntry = {
      pluginId: "acme.gitea",
      contribution: { id: "gitea", name: "Gitea", matches: ["gitea.example.com"] },
    };
    const resolved: ResolvedForgeProvider = { entry, resolvedVia: "hostname" };
    resolverMock.resolveForgeProvider.mockResolvedValueOnce(resolved);
    registerForgeSettingsHandlers();
    const resolveProvider = findHandler("forge:resolve-provider");
    await expect(
      resolveProvider(null, "project-1", "git@gitea.example.com:owner/repo.git")
    ).resolves.toEqual(resolved);
    expect(resolverMock.resolveForgeProvider).toHaveBeenCalledWith(
      "project-1",
      "git@gitea.example.com:owner/repo.git"
    );
  });

  it("resolveProvider treats a non-string remoteUrl as undefined", async () => {
    const resolved: ResolvedForgeProvider = { entry: null, resolvedVia: null };
    resolverMock.resolveForgeProvider.mockResolvedValueOnce(resolved);
    registerForgeSettingsHandlers();
    const resolveProvider = findHandler("forge:resolve-provider");
    await expect(resolveProvider(null, "project-1", 42)).resolves.toEqual(resolved);
    expect(resolverMock.resolveForgeProvider).toHaveBeenCalledWith("project-1", undefined);
  });

  it("resolveProvider returns no-match for invalid projectId payloads without calling the resolver", async () => {
    registerForgeSettingsHandlers();
    const resolveProvider = findHandler("forge:resolve-provider");
    const noMatch = { entry: null, resolvedVia: null };
    await expect(resolveProvider(null, "")).resolves.toEqual(noMatch);
    await expect(resolveProvider(null, 42)).resolves.toEqual(noMatch);
    await expect(resolveProvider(null, undefined)).resolves.toEqual(noMatch);
    expect(resolverMock.resolveForgeProvider).not.toHaveBeenCalled();
  });
});
