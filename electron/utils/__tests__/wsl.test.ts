import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectWslPath } from "../wsl.js";

describe("detectWslPath", () => {
  it("returns null for plain Windows drive paths", () => {
    expect(detectWslPath("C:\\repos\\project")).toBeNull();
  });

  it("returns null for POSIX paths", () => {
    expect(detectWslPath("/home/user/project")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(detectWslPath("")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(detectWslPath(undefined as unknown as string)).toBeNull();
    expect(detectWslPath(null as unknown as string)).toBeNull();
  });

  it("parses \\\\wsl$\\<distro>\\<path>", () => {
    const result = detectWslPath("\\\\wsl$\\Ubuntu\\home\\user\\project");
    expect(result).toEqual({ distro: "Ubuntu", posixPath: "/home/user/project" });
  });

  it("parses \\\\wsl.localhost\\<distro>\\<path>", () => {
    const result = detectWslPath("\\\\wsl.localhost\\Debian\\home\\dev\\app");
    expect(result).toEqual({ distro: "Debian", posixPath: "/home/dev/app" });
  });

  it("preserves distro name case", () => {
    const result = detectWslPath("\\\\wsl$\\Ubuntu-22.04\\repos\\app");
    expect(result?.distro).toBe("Ubuntu-22.04");
  });

  it("matches case-insensitively on the wsl prefix", () => {
    expect(detectWslPath("\\\\WSL$\\Ubuntu\\home")).toEqual({
      distro: "Ubuntu",
      posixPath: "/home",
    });
    expect(detectWslPath("\\\\Wsl.LocalHost\\Ubuntu\\home")).toEqual({
      distro: "Ubuntu",
      posixPath: "/home",
    });
  });

  it("returns / for the distro root", () => {
    expect(detectWslPath("\\\\wsl$\\Ubuntu")).toEqual({
      distro: "Ubuntu",
      posixPath: "/",
    });
    expect(detectWslPath("\\\\wsl$\\Ubuntu\\")).toEqual({
      distro: "Ubuntu",
      posixPath: "/",
    });
  });

  it("translates separators inside subpaths", () => {
    expect(detectWslPath("\\\\wsl$\\Ubuntu\\home\\user\\my repo\\src")).toEqual({
      distro: "Ubuntu",
      posixPath: "/home/user/my repo/src",
    });
  });
});

type ExecFileCallback = (
  err: Error | null,
  stdout: Buffer | string,
  stderr?: Buffer | string
) => void;
const execFileMock = vi.fn();
vi.mock("child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

/** Build a UTF-16LE buffer with BOM, mirroring real `wsl.exe` output. */
function utf16le(text: string): Buffer {
  const body = Buffer.from(text, "utf16le");
  const bom = Buffer.from([0xff, 0xfe]);
  return Buffer.concat([bom, body]);
}

/** Build a UTF-8 buffer, mirroring `WSL_UTF8=1` output. */
function utf8(text: string): Buffer {
  return Buffer.from(text, "utf8");
}

const originalPlatform = process.platform;

describe("getDefaultWslDistro", () => {
  beforeEach(() => {
    vi.resetModules();
    execFileMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
  });

  it("returns null on non-Windows platforms without spawning wsl.exe", async () => {
    Object.defineProperty(process, "platform", { value: "darwin", writable: true });
    const { getDefaultWslDistro } = await import("../wsl.js");
    const result = await getDefaultWslDistro();
    expect(result).toBeNull();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("returns the distro marked with * (UTF-16LE) when default is NOT first", async () => {
    Object.defineProperty(process, "platform", { value: "win32", writable: true });
    // Real `wsl --list --verbose` output: header + entries, with `*` on the
    // default. Here Ubuntu-22.04 is registered first but Debian is the default.
    const stdout =
      "  NAME            STATE           VERSION\r\n" +
      "  Ubuntu-22.04    Stopped         2\r\n" +
      "* Debian          Running         2\r\n" +
      "  Alpine          Stopped         2\r\n";
    execFileMock.mockImplementation((_file, _args, _opts, cb: ExecFileCallback) =>
      cb(null, utf16le(stdout))
    );

    const { getDefaultWslDistro } = await import("../wsl.js");
    expect(await getDefaultWslDistro()).toBe("Debian");
  });

  it("returns the distro marked with * (UTF-8) on single-distro hosts", async () => {
    Object.defineProperty(process, "platform", { value: "win32", writable: true });
    const stdout = "  NAME      STATE           VERSION\r\n" + "* Ubuntu    Running         2\r\n";
    execFileMock.mockImplementation((_file, _args, _opts, cb: ExecFileCallback) =>
      cb(null, utf8(stdout))
    );

    const { getDefaultWslDistro } = await import("../wsl.js");
    expect(await getDefaultWslDistro()).toBe("Ubuntu");
  });

  it("handles distro names containing spaces (e.g. 'Ubuntu 22.04 LTS')", async () => {
    Object.defineProperty(process, "platform", { value: "win32", writable: true });
    const stdout =
      "  NAME                STATE           VERSION\r\n" +
      "* Ubuntu 22.04 LTS    Running         2\r\n";
    execFileMock.mockImplementation((_file, _args, _opts, cb: ExecFileCallback) =>
      cb(null, utf8(stdout))
    );

    const { getDefaultWslDistro } = await import("../wsl.js");
    expect(await getDefaultWslDistro()).toBe("Ubuntu 22.04 LTS");
  });

  it("still finds the default on a localized Windows host (translated header/state)", async () => {
    // German Windows: header "NAME STATUS VERSION", state "Wird ausgeführt"
    // ("Running"). The `*` marker is the only locale-independent signal.
    Object.defineProperty(process, "platform", { value: "win32", writable: true });
    const stdout =
      "  NAME            STATUS               VERSION\r\n" +
      "* Ubuntu          Wird ausgeführt      2\r\n" +
      "  Debian          Beendet              2\r\n";
    execFileMock.mockImplementation((_file, _args, _opts, cb: ExecFileCallback) =>
      cb(null, utf16le(stdout))
    );

    const { getDefaultWslDistro } = await import("../wsl.js");
    expect(await getDefaultWslDistro()).toBe("Ubuntu");
  });

  it("returns null when no line is marked with *", async () => {
    Object.defineProperty(process, "platform", { value: "win32", writable: true });
    const stdout =
      "  NAME            STATE           VERSION\r\n" + "  Ubuntu          Stopped         2\r\n";
    execFileMock.mockImplementation((_file, _args, _opts, cb: ExecFileCallback) =>
      cb(null, utf8(stdout))
    );

    const { getDefaultWslDistro } = await import("../wsl.js");
    expect(await getDefaultWslDistro()).toBeNull();
  });

  it("returns null when stdout is empty (no distros installed)", async () => {
    Object.defineProperty(process, "platform", { value: "win32", writable: true });
    execFileMock.mockImplementation((_file, _args, _opts, cb: ExecFileCallback) =>
      cb(null, utf8(""))
    );

    const { getDefaultWslDistro } = await import("../wsl.js");
    expect(await getDefaultWslDistro()).toBeNull();
  });

  it("returns null when wsl.exe fails to spawn", async () => {
    Object.defineProperty(process, "platform", { value: "win32", writable: true });
    execFileMock.mockImplementation((_file, _args, _opts, cb: ExecFileCallback) =>
      cb(new Error("ENOENT: wsl.exe not found"), Buffer.alloc(0))
    );

    const { getDefaultWslDistro } = await import("../wsl.js");
    expect(await getDefaultWslDistro()).toBeNull();
  });

  it("invokes wsl.exe with --list --verbose (not --quiet)", async () => {
    Object.defineProperty(process, "platform", { value: "win32", writable: true });
    execFileMock.mockImplementation((_file, _args, _opts, cb: ExecFileCallback) =>
      cb(null, utf8("  NAME  STATE  VERSION\r\n* Ubuntu  Running  2\r\n"))
    );

    const { getDefaultWslDistro } = await import("../wsl.js");
    await getDefaultWslDistro();

    expect(execFileMock).toHaveBeenCalledOnce();
    const [file, args] = execFileMock.mock.calls[0];
    expect(file).toBe("wsl.exe");
    expect(args).toEqual(["--list", "--verbose"]);
  });
});
