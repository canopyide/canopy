import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { AgentId } from "../../../shared/types/agent.js";

const registryMock = vi.hoisted(() => ({
  getEffectiveAgentIds: vi.fn(),
  getEffectiveAgentConfig: vi.fn(),
}));

// Hoisted execFile mock — vi.spyOn can't redefine ESM-namespace exports of
// `child_process`, so we substitute the whole module at hoist time. Tests
// that need a custom impl mutate `execFileMock` via mockImplementationOnce.
const { execFileMock } = vi.hoisted(() => {
  const mock = vi.fn();
  (mock as any)[Symbol.for("nodejs.util.promisify.custom")] = function (
    cmd: string,
    args: readonly string[],
    opts: unknown
  ) {
    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      mock(cmd, args, opts, (err: unknown, stdout: string, stderr: string) => {
        if (err) return reject(err);
        resolve({ stdout, stderr });
      });
    });
  };
  return { execFileMock: mock };
});

vi.mock("child_process", () => ({
  execFile: execFileMock,
}));

vi.mock("../../../shared/config/agentRegistry.js", () => registryMock);

import { AgentVersionService } from "../AgentVersionService.js";
import type { CliAvailabilityService } from "../CliAvailabilityService.js";

describe("AgentVersionService resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createService(checkAvailabilityImpl: () => Promise<Record<string, unknown>>) {
    const cliAvailabilityService = {
      checkAvailability: vi.fn(checkAvailabilityImpl),
    } as unknown as CliAvailabilityService;

    return {
      service: new AgentVersionService(cliAvailabilityService),
      cliAvailabilityService,
    };
  }

  it("returns error info instead of throwing when availability check fails", async () => {
    (registryMock.getEffectiveAgentConfig as Mock).mockReturnValue({
      id: "claude",
      name: "Claude",
      command: "claude",
      version: {
        args: ["--version"],
      },
    });

    const { service } = createService(async () => {
      throw new Error("availability crash");
    });

    await expect(service.getVersion("claude" as AgentId)).resolves.toEqual(
      expect.objectContaining({
        agentId: "claude",
        installedVersion: null,
        latestVersion: null,
        updateAvailable: false,
        error: expect.stringContaining("availability crash"),
      })
    );
  });

  it("uses a 10s probe timeout to tolerate cold starts and AV-scanned binaries", () => {
    const cliAvailabilityService = {
      checkAvailability: vi.fn(),
    } as unknown as CliAvailabilityService;
    const service = new AgentVersionService(cliAvailabilityService);

    // The constant gates execFileAsync timeout AND the two AbortController-based
    // fetch paths in getLatestNpmVersion / getLatestGitHubVersion. 5s was too
    // tight on Windows AV-scanned PATH entries, slow npm CDN edges, and WSL2
    // boundaries (issue #6041).
    expect((service as unknown as { TIMEOUT_MS: number }).TIMEOUT_MS).toBe(10000);
  });

  it("returns per-agent results even when one config lookup throws", async () => {
    (registryMock.getEffectiveAgentIds as Mock).mockReturnValue(["claude", "gemini"]);
    (registryMock.getEffectiveAgentConfig as Mock).mockImplementation((agentId: string) => {
      if (agentId === "gemini") {
        throw new Error("bad config payload");
      }

      return {
        id: "claude",
        name: "Claude",
        command: "claude",
      };
    });

    const { service } = createService(async () => ({
      claude: false,
      gemini: false,
    }));

    const results = await service.getVersions();

    expect(results).toHaveLength(2);
    expect(results).toContainEqual(
      expect.objectContaining({
        agentId: "claude",
        updateAvailable: false,
      })
    );
    expect(results).toContainEqual(
      expect.objectContaining({
        agentId: "gemini",
        installedVersion: null,
        latestVersion: null,
        updateAvailable: false,
        error: expect.stringContaining("bad config payload"),
      })
    );
  });

  describe("env sandboxing and secret scrubbing (issue #6247)", () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    function setExecFileImpl(
      impl: (cmd: string, args: string[], opts: unknown, cb: (...cbArgs: unknown[]) => void) => void
    ): void {
      execFileMock.mockImplementation(impl as never);
    }

    it("passes a sandboxed env to execFile (excludes ANTHROPIC_API_KEY, GITHUB_TOKEN)", async () => {
      process.env = {
        ...originalEnv,
        ANTHROPIC_API_KEY: "sk-ant-x",
        GITHUB_TOKEN: "ghp_x",
        PATH: process.env.PATH ?? "/usr/bin",
      } as NodeJS.ProcessEnv;

      (registryMock.getEffectiveAgentConfig as Mock).mockReturnValue({
        id: "claude",
        name: "Claude",
        command: "claude",
        version: { args: ["--version"] },
      });

      setExecFileImpl(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: unknown, stdout: string, stderr: string) => void
        ) => {
          cb(null, "1.0.0\n", "");
        }
      );

      const { service } = createService(async () => ({ claude: "ready" }));
      await service.getVersion("claude" as AgentId);

      const opts = execFileMock.mock.calls[0][2] as { env?: Record<string, string> };
      expect(opts.env).toBeDefined();
      expect(opts.env!.ANTHROPIC_API_KEY).toBeUndefined();
      expect(opts.env!.GITHUB_TOKEN).toBeUndefined();
      expect(opts.env!.PATH).toBeTruthy();
    });

    it("scrubs secrets from error.message before they flow into AgentVersionInfo.error", async () => {
      const leakingMessage = `spawn failed for ANTHROPIC_API_KEY=sk-ant-${"A".repeat(95)}`;

      (registryMock.getEffectiveAgentConfig as Mock).mockReturnValue({
        id: "claude",
        name: "Claude",
        command: "claude",
        version: { args: ["--version"] },
      });

      setExecFileImpl(
        (_cmd: string, _args: string[], _opts: unknown, cb: (err: unknown) => void) => {
          const err = new Error(leakingMessage) as NodeJS.ErrnoException & {
            stdout?: string;
            stderr?: string;
          };
          err.code = "EUNKNOWN";
          err.stdout = "";
          err.stderr = "";
          cb(err);
        }
      );

      const { service } = createService(async () => ({ claude: "ready" }));
      const result = await service.getVersion("claude" as AgentId);

      expect(result.error ?? "").not.toContain("sk-ant-");
      expect(result.error ?? "").toContain("[REDACTED]");
    });
  });

  describe("PyPI version feed", () => {
    // execFile is used for the installed-version probe; default to a synthetic
    // success so getInstalledVersion returns a parseable value and the
    // assertion focuses on the latest-version branch.
    function setExecFileSuccess(): void {
      execFileMock.mockImplementation(((
        _cmd: string,
        _args: readonly string[],
        _opts: unknown,
        cb: (err: unknown, stdout: string, stderr: string) => void
      ) => {
        cb(null, "1.0.0\n", "");
      }) as never);
    }

    beforeEach(() => {
      execFileMock.mockReset();
    });

    it("fetches the latest version from pypi.org/pypi/<pkg>/json", async () => {
      (registryMock.getEffectiveAgentConfig as Mock).mockReturnValue({
        id: "py-agent",
        name: "Py Agent",
        command: "py-agent",
        version: { args: ["--version"], pypiPackage: "py-agent-pkg" },
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ info: { version: "1.2.3" } }),
        headers: new Headers(),
      } as Response);
      setExecFileSuccess();

      const { service } = createService(async () => ({ "py-agent": "ready" }));
      const result = await service.getVersion("py-agent" as AgentId);

      expect(result.latestVersion).toBe("1.2.3");
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://pypi.org/pypi/py-agent-pkg/json",
        expect.objectContaining({
          headers: expect.objectContaining({ "User-Agent": "Daintree-Electron" }),
        })
      );
      fetchSpy.mockRestore();
    });

    it("returns null without erroring when PyPI returns 200 with missing version", async () => {
      (registryMock.getEffectiveAgentConfig as Mock).mockReturnValue({
        id: "py-agent",
        name: "Py Agent",
        command: "py-agent",
        version: { args: ["--version"], pypiPackage: "py-agent-pkg" },
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ info: {} }),
        headers: new Headers(),
      } as Response);
      setExecFileSuccess();

      const { service } = createService(async () => ({ "py-agent": "ready" }));
      const result = await service.getVersion("py-agent" as AgentId);

      expect(result.latestVersion).toBeNull();
      expect(result.error).toBeUndefined();
      fetchSpy.mockRestore();
    });

    it("surfaces an error when PyPI returns 404", async () => {
      (registryMock.getEffectiveAgentConfig as Mock).mockReturnValue({
        id: "py-agent",
        name: "Py Agent",
        command: "py-agent",
        version: { args: ["--version"], pypiPackage: "missing-pkg" },
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
        headers: new Headers(),
      } as Response);
      setExecFileSuccess();

      const { service } = createService(async () => ({ "py-agent": "ready" }));
      const result = await service.getVersion("py-agent" as AgentId);

      expect(result.latestVersion).toBeNull();
      expect(result.error ?? "").toMatch(/PyPI/);
      fetchSpy.mockRestore();
    });
  });

  describe("npm version feed", () => {
    function setExecFileSuccess(): void {
      execFileMock.mockImplementation(((
        _cmd: string,
        _args: readonly string[],
        _opts: unknown,
        cb: (err: unknown, stdout: string, stderr: string) => void
      ) => {
        cb(null, "1.0.0\n", "");
      }) as never);
    }

    beforeEach(() => {
      execFileMock.mockReset();
    });

    it("uses the abbreviated packument Accept header and User-Agent", async () => {
      (registryMock.getEffectiveAgentConfig as Mock).mockReturnValue({
        id: "npm-agent",
        name: "NPM Agent",
        command: "npm-agent",
        version: { args: ["--version"], npmPackage: "npm-agent-pkg" },
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          "dist-tags": { latest: "2.0.0" },
          name: "npm-agent-pkg",
        }),
        headers: new Headers(),
      } as Response);
      setExecFileSuccess();

      const { service } = createService(async () => ({ "npm-agent": "ready" }));
      const result = await service.getVersion("npm-agent" as AgentId);

      expect(result.latestVersion).toBe("2.0.0");
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://registry.npmjs.org/npm-agent-pkg",
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "application/vnd.npm.install-v1+json",
            "User-Agent": "Daintree-Electron",
          }),
        })
      );
      fetchSpy.mockRestore();
    });

    it("omits the ?fields=dist-tags query parameter from the URL", async () => {
      (registryMock.getEffectiveAgentConfig as Mock).mockReturnValue({
        id: "npm-agent",
        name: "NPM Agent",
        command: "npm-agent",
        version: { args: ["--version"], npmPackage: "scoped-pkg" },
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          "dist-tags": { latest: "1.5.0" },
        }),
        headers: new Headers(),
      } as Response);
      setExecFileSuccess();

      const { service } = createService(async () => ({ "npm-agent": "ready" }));
      await service.getVersion("npm-agent" as AgentId);

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).not.toContain("?fields=");
      expect(url).toBe("https://registry.npmjs.org/scoped-pkg");
      fetchSpy.mockRestore();
    });
  });

  describe("parseVersion prerelease coercion", () => {
    it("preserves prerelease tags when coerce fallback is reached", () => {
      const { service } = createService(async () => ({}));

      // "2.0-beta" has no X.Y.Z pattern so it bypasses semver.clean() and
      // all three regex patterns, reaching the coerce fallback.
      expect(
        (service as unknown as { parseVersion(v: string): string | null }).parseVersion("2.0-beta")
      ).toBe("2.0.0-beta");
    });

    it("still returns null for unparseable strings", () => {
      const { service } = createService(async () => ({}));

      expect(
        (service as unknown as { parseVersion(v: string): string | null }).parseVersion(
          "not a version at all"
        )
      ).toBeNull();
    });
  });

  describe("isUpdateAvailable prerelease guard", () => {
    it("returns false when installed is stable and latest is a prerelease", () => {
      const { service } = createService(async () => ({}));

      expect(
        (
          service as unknown as { isUpdateAvailable(i: string | null, l: string | null): boolean }
        ).isUpdateAvailable("1.9.5", "2.0.0-beta.1")
      ).toBe(false);
    });

    it("returns true when both installed and latest are prereleases in the same channel", () => {
      const { service } = createService(async () => ({}));

      expect(
        (
          service as unknown as { isUpdateAvailable(i: string | null, l: string | null): boolean }
        ).isUpdateAvailable("2.0.0-beta.1", "2.0.0-beta.2")
      ).toBe(true);
    });

    it("returns true when installed is a prerelease and latest is stable", () => {
      const { service } = createService(async () => ({}));

      expect(
        (
          service as unknown as { isUpdateAvailable(i: string | null, l: string | null): boolean }
        ).isUpdateAvailable("2.0.0-beta.1", "2.0.0")
      ).toBe(true);
    });

    it("returns true for a normal stable-to-stable upgrade", () => {
      const { service } = createService(async () => ({}));

      expect(
        (
          service as unknown as { isUpdateAvailable(i: string | null, l: string | null): boolean }
        ).isUpdateAvailable("1.0.0", "2.0.0")
      ).toBe(true);
    });

    it("returns false for a normal stable-to-stable downgrade", () => {
      const { service } = createService(async () => ({}));

      expect(
        (
          service as unknown as { isUpdateAvailable(i: string | null, l: string | null): boolean }
        ).isUpdateAvailable("2.0.0", "1.0.0")
      ).toBe(false);
    });
  });

  describe("checkVersion parallelism", () => {
    function setExecFileSuccess(): void {
      execFileMock.mockImplementation(((
        _cmd: string,
        _args: readonly string[],
        _opts: unknown,
        cb: (err: unknown, stdout: string, stderr: string) => void
      ) => {
        cb(null, "1.9.5\n", "");
      }) as never);
    }

    beforeEach(() => {
      execFileMock.mockReset();
    });

    it("returns both installed and latest when both probes succeed", async () => {
      (registryMock.getEffectiveAgentConfig as Mock).mockReturnValue({
        id: "claude",
        name: "Claude",
        command: "claude",
        version: { args: ["--version"], npmPackage: "claude-pkg" },
      });

      setExecFileSuccess();

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ "dist-tags": { latest: "2.0.0" } }),
        headers: new Headers(),
      } as Response);

      const { service } = createService(async () => ({ claude: "ready" }));
      const result = await service.getVersion("claude" as AgentId);

      expect(result.installedVersion).toBe("1.9.5");
      expect(result.latestVersion).toBe("2.0.0");
      expect(result.error).toBeUndefined();
      fetchSpy.mockRestore();
    });

    it("returns installed version and error when latest probe fails", async () => {
      (registryMock.getEffectiveAgentConfig as Mock).mockReturnValue({
        id: "claude",
        name: "Claude",
        command: "claude",
        version: { args: ["--version"], npmPackage: "claude-pkg" },
      });

      setExecFileSuccess();

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValueOnce(new Error("network down"));

      const { service } = createService(async () => ({ claude: "ready" }));
      const result = await service.getVersion("claude" as AgentId);

      expect(result.installedVersion).toBe("1.9.5");
      expect(result.latestVersion).toBeNull();
      expect(result.error).toContain("Failed to get latest version");
      expect(result.error).toContain("network down");
      fetchSpy.mockRestore();
    });

    it("returns latest version and error when installed probe fails", async () => {
      (registryMock.getEffectiveAgentConfig as Mock).mockReturnValue({
        id: "claude",
        name: "Claude",
        command: "claude",
        version: { args: ["--version"], npmPackage: "claude-pkg" },
      });

      execFileMock.mockImplementation(((
        _cmd: string,
        _args: readonly string[],
        _opts: unknown,
        cb: (err: unknown) => void
      ) => {
        const error = new Error("EACCES") as NodeJS.ErrnoException;
        error.code = "EACCES";
        cb(error);
      }) as never);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ "dist-tags": { latest: "2.0.0" } }),
        headers: new Headers(),
      } as Response);

      const { service } = createService(async () => ({ claude: "ready" }));
      const result = await service.getVersion("claude" as AgentId);

      expect(result.installedVersion).toBeNull();
      expect(result.latestVersion).toBe("2.0.0");
      expect(result.error).toContain("Failed to get installed version");
      fetchSpy.mockRestore();
    });

    it("joins both error messages when both probes fail", async () => {
      (registryMock.getEffectiveAgentConfig as Mock).mockReturnValue({
        id: "claude",
        name: "Claude",
        command: "claude",
        version: { args: ["--version"], npmPackage: "claude-pkg" },
      });

      execFileMock.mockImplementation(((
        _cmd: string,
        _args: readonly string[],
        _opts: unknown,
        cb: (err: unknown) => void
      ) => {
        const error = new Error("ETIMEDOUT") as NodeJS.ErrnoException;
        error.code = "ETIMEDOUT";
        cb(error);
      }) as never);

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValueOnce(new Error("connect timeout"));

      const { service } = createService(async () => ({ claude: "ready" }));
      const result = await service.getVersion("claude" as AgentId);

      expect(result.installedVersion).toBeNull();
      expect(result.latestVersion).toBeNull();
      expect(result.error).toContain("Failed to get installed version");
      expect(result.error).toContain("Failed to get latest version");
      expect(result.error).toContain(";");
      fetchSpy.mockRestore();
    });
  });
});
