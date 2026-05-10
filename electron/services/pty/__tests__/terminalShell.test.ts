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
});
