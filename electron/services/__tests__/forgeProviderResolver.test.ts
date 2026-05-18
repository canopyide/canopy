import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  ForgeProviderContribution,
  RegisteredForgeProvider,
} from "../../../shared/types/forge.js";

const projectStoreMock = vi.hoisted(() => ({
  getProjectById: vi.fn(),
  getProjectSettings: vi.fn(),
}));

vi.mock("../ProjectStore.js", () => ({ projectStore: projectStoreMock }));

const gitServiceMock = vi.hoisted(() => ({
  getRemoteUrl: vi.fn(),
}));
const gitServiceCacheMock = vi.hoisted(() => ({
  getGitService: vi.fn(() => gitServiceMock),
}));

vi.mock("../GitServiceCache.js", () => ({ gitServiceCache: gitServiceCacheMock }));

const storeMock = vi.hoisted(() => {
  const data: Record<string, unknown> = {};
  return {
    get: vi.fn((key: string) => data[key]),
    _data: data,
  };
});

vi.mock("../../store.js", () => ({ store: storeMock }));

const registryMock = vi.hoisted(() => ({
  getRegisteredForgeProviders: vi.fn<() => RegisteredForgeProvider[]>(() => []),
  listMatchingProviders: vi.fn<(remoteUrl: string) => RegisteredForgeProvider[]>(() => []),
}));

vi.mock("../forgeProviderRegistry.js", () => registryMock);

import { resolveForgeProvider } from "../forgeProviderResolver.js";

function makeProvider(
  pluginId: string,
  id: string,
  matches: string[] = []
): RegisteredForgeProvider {
  const contribution: ForgeProviderContribution = {
    id,
    name: id,
    matches,
  };
  return { pluginId, contribution };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(storeMock._data)) {
    delete storeMock._data[key];
  }
  projectStoreMock.getProjectById.mockReturnValue({
    id: "project-1",
    path: "/repo",
    name: "repo",
  });
  projectStoreMock.getProjectSettings.mockResolvedValue({ runCommands: [] });
  gitServiceMock.getRemoteUrl.mockResolvedValue("https://github.com/owner/repo.git");
  registryMock.getRegisteredForgeProviders.mockReturnValue([]);
  registryMock.listMatchingProviders.mockReturnValue([]);
});

describe("resolveForgeProvider", () => {
  it("returns no-match when the project does not exist", async () => {
    projectStoreMock.getProjectById.mockReturnValue(null);
    expect(await resolveForgeProvider("missing")).toEqual({ entry: null, resolvedVia: null });
  });

  it("returns no-match for empty or non-string projectId", async () => {
    expect(await resolveForgeProvider("")).toEqual({ entry: null, resolvedVia: null });
    expect(await resolveForgeProvider(undefined as unknown as string)).toEqual({
      entry: null,
      resolvedVia: null,
    });
  });

  it("returns the override match when forgeProviderOverride names a registered provider", async () => {
    const gitea = makeProvider("acme.gitea", "gitea", ["gitea.example.com"]);
    const github = makeProvider("builtin", "github", ["github.com"]);
    registryMock.getRegisteredForgeProviders.mockReturnValue([github, gitea]);
    projectStoreMock.getProjectSettings.mockResolvedValue({
      runCommands: [],
      forgeProviderOverride: "gitea",
    });

    const result = await resolveForgeProvider("project-1");
    expect(result).toEqual({ entry: gitea, resolvedVia: "override" });
    // Override path bypasses hostname matching entirely.
    expect(registryMock.listMatchingProviders).not.toHaveBeenCalled();
  });

  it("accepts namespaced ids ({pluginId}.{contributionId}) for the override", async () => {
    const gitea = makeProvider("acme.gitea", "gitea", ["gitea.example.com"]);
    registryMock.getRegisteredForgeProviders.mockReturnValue([gitea]);
    projectStoreMock.getProjectSettings.mockResolvedValue({
      runCommands: [],
      forgeProviderOverride: "acme.gitea.gitea",
    });

    expect(await resolveForgeProvider("project-1")).toEqual({
      entry: gitea,
      resolvedVia: "override",
    });
  });

  it("returns no-match when forgeProviderOverride names an unregistered provider (no fallthrough)", async () => {
    const github = makeProvider("builtin", "github", ["github.com"]);
    registryMock.getRegisteredForgeProviders.mockReturnValue([github]);
    registryMock.listMatchingProviders.mockReturnValue([github]);
    // Both lower tiers would otherwise resolve to `github` — proving they are
    // not consulted when an override names an unregistered provider.
    storeMock._data["forgeDefaultProviderId"] = "github";
    projectStoreMock.getProjectSettings.mockResolvedValue({
      runCommands: [],
      forgeProviderOverride: "gone.away",
    });

    expect(await resolveForgeProvider("project-1")).toEqual({ entry: null, resolvedVia: null });
    expect(registryMock.listMatchingProviders).not.toHaveBeenCalled();
  });

  it("treats forgeProviderOverride === null as auto-detect (falls through)", async () => {
    const github = makeProvider("builtin", "github", ["github.com"]);
    registryMock.listMatchingProviders.mockReturnValue([github]);
    projectStoreMock.getProjectSettings.mockResolvedValue({
      runCommands: [],
      forgeProviderOverride: null,
    });

    expect(await resolveForgeProvider("project-1")).toEqual({
      entry: github,
      resolvedVia: "hostname",
    });
  });

  it("treats forgeProviderOverride absent as auto-detect (falls through)", async () => {
    const github = makeProvider("builtin", "github", ["github.com"]);
    registryMock.listMatchingProviders.mockReturnValue([github]);
    projectStoreMock.getProjectSettings.mockResolvedValue({ runCommands: [] });

    expect(await resolveForgeProvider("project-1")).toEqual({
      entry: github,
      resolvedVia: "hostname",
    });
  });

  it("returns the global default when it matches one of the remote candidates", async () => {
    const enterprise = makeProvider("acme.gh-enterprise", "gh-enterprise", ["github.com"]);
    const github = makeProvider("builtin", "github", ["github.com"]);
    registryMock.listMatchingProviders.mockReturnValue([github, enterprise]);
    storeMock._data["forgeDefaultProviderId"] = "gh-enterprise";

    expect(await resolveForgeProvider("project-1")).toEqual({
      entry: enterprise,
      resolvedVia: "default",
    });
  });

  it("returns no-match when the global default is not a hostname match for the remote", async () => {
    const github = makeProvider("builtin", "github", ["github.com"]);
    const gitea = makeProvider("acme.gitea", "gitea", ["gitea.example.com"]);
    // The default IS registered globally — but not for this remote's hostname.
    // Rule 2 must filter through listMatchingProviders, not the full registry.
    registryMock.getRegisteredForgeProviders.mockReturnValue([github, gitea]);
    registryMock.listMatchingProviders.mockReturnValue([github]);
    storeMock._data["forgeDefaultProviderId"] = "gitea";

    expect(await resolveForgeProvider("project-1")).toEqual({ entry: null, resolvedVia: null });
  });

  it("accepts namespaced ids for the global default", async () => {
    const github = makeProvider("builtin", "github", ["github.com"]);
    registryMock.listMatchingProviders.mockReturnValue([github]);
    storeMock._data["forgeDefaultProviderId"] = "builtin.github";

    expect(await resolveForgeProvider("project-1")).toEqual({
      entry: github,
      resolvedVia: "default",
    });
  });

  it("returns the first hostname match when no override or default is set", async () => {
    const github = makeProvider("builtin", "github", ["github.com"]);
    const other = makeProvider("acme.other", "other", ["github.com"]);
    registryMock.listMatchingProviders.mockReturnValue([github, other]);

    expect(await resolveForgeProvider("project-1")).toEqual({
      entry: github,
      resolvedVia: "hostname",
    });
  });

  it("returns no-match when there are no hostname matches", async () => {
    registryMock.listMatchingProviders.mockReturnValue([]);
    expect(await resolveForgeProvider("project-1")).toEqual({ entry: null, resolvedVia: null });
  });

  it("returns no-match when the remote URL cannot be read", async () => {
    gitServiceMock.getRemoteUrl.mockResolvedValue(null);
    const github = makeProvider("builtin", "github", ["github.com"]);
    registryMock.listMatchingProviders.mockReturnValue([github]);

    expect(await resolveForgeProvider("project-1")).toEqual({ entry: null, resolvedVia: null });
    expect(registryMock.listMatchingProviders).not.toHaveBeenCalled();
  });

  it("still resolves the override when the remote URL cannot be read", async () => {
    gitServiceMock.getRemoteUrl.mockResolvedValue(null);
    const gitea = makeProvider("acme.gitea", "gitea", ["gitea.example.com"]);
    registryMock.getRegisteredForgeProviders.mockReturnValue([gitea]);
    projectStoreMock.getProjectSettings.mockResolvedValue({
      runCommands: [],
      forgeProviderOverride: "gitea",
    });

    expect(await resolveForgeProvider("project-1")).toEqual({
      entry: gitea,
      resolvedVia: "override",
    });
  });

  it("returns no-match when getRemoteUrl rejects", async () => {
    gitServiceMock.getRemoteUrl.mockRejectedValue(new Error("not a git repo"));
    expect(await resolveForgeProvider("project-1")).toEqual({ entry: null, resolvedVia: null });
  });

  it("falls through to hostname match when getProjectSettings rejects", async () => {
    // Documented contract: settings read failure is treated as "no override",
    // not "no resolution". The conservative degradation path keeps PR linkage
    // working when machine-local settings are momentarily unreadable.
    projectStoreMock.getProjectSettings.mockRejectedValue(new Error("read failed"));
    const github = makeProvider("builtin", "github", ["github.com"]);
    registryMock.listMatchingProviders.mockReturnValue([github]);

    expect(await resolveForgeProvider("project-1")).toEqual({
      entry: github,
      resolvedVia: "hostname",
    });
  });

  it("does not throw when a synchronous registry call throws", async () => {
    registryMock.listMatchingProviders.mockImplementation(() => {
      throw new Error("boom");
    });

    expect(await resolveForgeProvider("project-1")).toEqual({ entry: null, resolvedVia: null });
  });

  it("does no caching — settings, store, remote, and registry are re-read on each call", async () => {
    const github = makeProvider("builtin", "github", ["github.com"]);
    registryMock.listMatchingProviders.mockReturnValue([github]);

    await resolveForgeProvider("project-1");
    await resolveForgeProvider("project-1");

    expect(projectStoreMock.getProjectSettings).toHaveBeenCalledTimes(2);
    expect(gitServiceMock.getRemoteUrl).toHaveBeenCalledTimes(2);
    expect(registryMock.listMatchingProviders).toHaveBeenCalledTimes(2);
    expect(storeMock.get).toHaveBeenCalledWith("forgeDefaultProviderId");
  });

  it("uses the supplied remoteUrl for hostname matching instead of origin", async () => {
    const gitea = makeProvider("acme.gitea", "gitea", ["gitea.example.com"]);
    registryMock.listMatchingProviders.mockReturnValue([gitea]);

    const result = await resolveForgeProvider(
      "project-1",
      "git@gitea.example.com:owner/repo.git"
    );

    expect(result).toEqual({ entry: gitea, resolvedVia: "hostname" });
    expect(gitServiceMock.getRemoteUrl).not.toHaveBeenCalled();
    expect(registryMock.listMatchingProviders).toHaveBeenCalledWith(
      "git@gitea.example.com:owner/repo.git"
    );
  });

  it("ignores an empty supplied remoteUrl and falls back to origin", async () => {
    const github = makeProvider("builtin", "github", ["github.com"]);
    registryMock.listMatchingProviders.mockReturnValue([github]);

    const result = await resolveForgeProvider("project-1", "");

    expect(result).toEqual({ entry: github, resolvedVia: "hostname" });
    expect(gitServiceMock.getRemoteUrl).toHaveBeenCalledTimes(1);
  });

  it("override path ignores the supplied remoteUrl entirely", async () => {
    const gitea = makeProvider("acme.gitea", "gitea", ["gitea.example.com"]);
    const github = makeProvider("builtin", "github", ["github.com"]);
    registryMock.getRegisteredForgeProviders.mockReturnValue([github, gitea]);
    projectStoreMock.getProjectSettings.mockResolvedValue({
      runCommands: [],
      forgeProviderOverride: "gitea",
    });

    const result = await resolveForgeProvider("project-1", "https://github.com/owner/repo.git");

    expect(result).toEqual({ entry: gitea, resolvedVia: "override" });
    expect(registryMock.listMatchingProviders).not.toHaveBeenCalled();
    expect(gitServiceMock.getRemoteUrl).not.toHaveBeenCalled();
  });
});
