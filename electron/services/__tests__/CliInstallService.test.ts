import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn<(path: string) => boolean>(),
  lstatSync: vi.fn<(path: string) => { isSymbolicLink: () => boolean }>(),
  realpathSync: vi.fn<(path: string) => string>(),
  readFileSync: vi.fn<(path: string, encoding: string) => string>(),
  symlinkSync: vi.fn(),
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
  chmodSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const appMock = vi.hoisted(() => ({
  app: {
    isPackaged: false,
    getVersion: vi.fn(() => "1.2.3"),
    getAppPath: vi.fn(() => "/repo"),
  },
}));

vi.mock("fs", () => ({
  default: fsMock,
  ...fsMock,
}));

vi.mock("electron", () => ({
  ...appMock,
}));

vi.mock("os", () => ({
  default: {
    homedir: () => "/home/test",
  },
  homedir: () => "/home/test",
}));

const originalPlatform = process.platform;

describe("CliInstallService", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    appMock.app.isPackaged = false;
    appMock.app.getAppPath.mockReturnValue("/repo");
    fsMock.lstatSync.mockImplementation(() => ({ isSymbolicLink: () => false }));
    fsMock.realpathSync.mockImplementation((target) => target);
    Object.defineProperty(process, "platform", {
      value: "darwin",
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it("installs by creating a symlink from app.getAppPath() in development mode", async () => {
    fsMock.existsSync.mockImplementation(
      (target) => target === "/repo/scripts/canopy-cli.sh" || target === "/usr/local/bin"
    );

    const { install } = await import("../CliInstallService.js");
    const result = await install();

    expect(appMock.app.getAppPath).toHaveBeenCalled();
    expect(fsMock.existsSync).toHaveBeenCalledWith("/repo/scripts/canopy-cli.sh");
    expect(fsMock.symlinkSync).toHaveBeenCalledWith(
      "/repo/scripts/canopy-cli.sh",
      "/usr/local/bin/canopy"
    );
    expect(result).toEqual({
      installed: true,
      upToDate: true,
      path: "/usr/local/bin/canopy",
    });
  });

  it("falls back to ~/.local/bin when /usr/local/bin is not writable", async () => {
    fsMock.existsSync.mockImplementation(
      (target) => target === "/repo/scripts/canopy-cli.sh" || target === "/usr/local/bin"
    );
    fsMock.symlinkSync.mockImplementation((_sourcePath, targetPath) => {
      if (targetPath === "/usr/local/bin/canopy") {
        throw new Error("EACCES");
      }
    });

    const { install } = await import("../CliInstallService.js");
    const result = await install();

    expect(fsMock.mkdirSync).toHaveBeenCalledWith("/home/test/.local/bin", { recursive: true });
    expect(fsMock.symlinkSync).toHaveBeenCalledWith(
      "/repo/scripts/canopy-cli.sh",
      "/home/test/.local/bin/canopy"
    );
    expect(result.path).toBe("/home/test/.local/bin/canopy");
  });

  it("reports up-to-date status when installed symlink matches source", async () => {
    fsMock.existsSync.mockImplementation((target) => target === "/usr/local/bin/canopy");
    fsMock.lstatSync.mockImplementation((targetPath) => ({
      isSymbolicLink: () => targetPath === "/usr/local/bin/canopy",
    }));
    fsMock.realpathSync.mockImplementation((targetPath) => {
      if (targetPath === "/usr/local/bin/canopy") return "/repo/scripts/canopy-cli.sh";
      return targetPath;
    });

    const { getStatus } = await import("../CliInstallService.js");
    const status = getStatus();

    expect(status).toEqual({
      installed: true,
      upToDate: true,
      path: "/usr/local/bin/canopy",
    });
  });

  it("reports outdated status for legacy copied installs that differ from source", async () => {
    fsMock.existsSync.mockImplementation((target) => target === "/usr/local/bin/canopy");
    fsMock.readFileSync.mockImplementation((targetPath) => {
      if (targetPath === "/repo/scripts/canopy-cli.sh") return "new script";
      if (targetPath === "/usr/local/bin/canopy") return "old script";
      throw new Error("ENOENT");
    });

    const { getStatus } = await import("../CliInstallService.js");
    const status = getStatus();

    expect(status).toEqual({
      installed: true,
      upToDate: false,
      path: "/usr/local/bin/canopy",
    });
  });
});
