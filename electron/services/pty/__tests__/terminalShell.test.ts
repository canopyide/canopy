import { afterEach, describe, expect, it } from "vitest";
import { getDefaultShellArgs } from "../terminalShell.js";

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
}

describe("getDefaultShellArgs", () => {
  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });

  it("defers macOS interactive shell startup so PTY listeners can attach", () => {
    setPlatform("darwin");

    expect(getDefaultShellArgs("/tmp/o'hare/zsh")).toEqual([
      "-c",
      "sleep 0.05\nexec '/tmp/o'\\''hare/zsh' -l",
    ]);
  });

  it("keeps the direct login-shell path on non-macOS POSIX platforms", () => {
    setPlatform("linux");

    expect(getDefaultShellArgs("/bin/zsh")).toEqual(["-l"]);
  });

  describe("Windows fallback shells (UTF-8 bootstrap + -NoLogo)", () => {
    const PS_BOOTSTRAP_ARGS = [
      "-NoLogo",
      "-NoExit",
      "-Command",
      "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    ];

    it("forces UTF-8 code page for cmd.exe", () => {
      setPlatform("win32");

      expect(getDefaultShellArgs("cmd.exe")).toEqual(["/K", "chcp 65001 >NUL"]);
    });

    it("forces UTF-8 code page for cmd.exe resolved via COMSPEC path", () => {
      setPlatform("win32");

      expect(getDefaultShellArgs("C:\\Windows\\system32\\cmd.exe")).toEqual([
        "/K",
        "chcp 65001 >NUL",
      ]);
    });

    it("forces UTF-8 console encoding + suppresses banner for Windows PowerShell 5.1", () => {
      setPlatform("win32");

      expect(getDefaultShellArgs("powershell.exe")).toEqual(PS_BOOTSTRAP_ARGS);
    });

    it("forces UTF-8 console encoding for fully-qualified PowerShell path", () => {
      setPlatform("win32");

      expect(
        getDefaultShellArgs("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
      ).toEqual(PS_BOOTSTRAP_ARGS);
    });

    it("forces UTF-8 console encoding + suppresses banner for pwsh.exe (PowerShell 7+)", () => {
      // PowerShell 7+ defaults to UTF-8 internally, but [Console]::OutputEncoding
      // still drives decoding of native tools (git, docker, etc.) — bootstrap
      // is needed for end-to-end UTF-8 reliability.
      setPlatform("win32");

      expect(getDefaultShellArgs("pwsh.exe")).toEqual(PS_BOOTSTRAP_ARGS);
      expect(getDefaultShellArgs("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toEqual(
        PS_BOOTSTRAP_ARGS
      );
    });

    it("matches Windows shell basenames case-insensitively", () => {
      setPlatform("win32");

      expect(getDefaultShellArgs("CMD.EXE")).toEqual(["/K", "chcp 65001 >NUL"]);
      expect(getDefaultShellArgs("PowerShell.EXE")).toEqual(PS_BOOTSTRAP_ARGS);
    });

    it("returns no args for unrecognized Windows shells (e.g. git-bash, nushell)", () => {
      setPlatform("win32");

      expect(getDefaultShellArgs("C:\\tools\\nushell\\nu.exe")).toEqual([]);
      expect(getDefaultShellArgs("C:\\Program Files\\Git\\bin\\bash.exe")).toEqual([]);
    });
  });
});
