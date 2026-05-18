import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ForgeProviderEntry } from "../../../../shared/types/forge.js";

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

  it("registers three IPC handlers", () => {
    const cleanup = registerForgeSettingsHandlers();
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(3);
    expect(ipcMainMock.handle).toHaveBeenCalledWith("forge:get-settings", expect.any(Function));
    expect(ipcMainMock.handle).toHaveBeenCalledWith(
      "forge:set-default-provider",
      expect.any(Function)
    );
    expect(ipcMainMock.handle).toHaveBeenCalledWith("forge:get-providers", expect.any(Function));
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

  it("cleanup removes all three handlers", () => {
    const cleanup = registerForgeSettingsHandlers();
    cleanup();
    expect(ipcMainMock.removeHandler).toHaveBeenCalledTimes(3);
  });
});
