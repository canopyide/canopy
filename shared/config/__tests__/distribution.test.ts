import { describe, expect, it } from "vitest";
import { getRuntimePlatform, isWindowsStoreBuild } from "../distribution.js";

describe("distribution config", () => {
  it("treats win32 as the Store-managed update channel", () => {
    expect(isWindowsStoreBuild("win32")).toBe(true);
  });

  it("keeps macOS and Linux on the in-app updater path", () => {
    expect(isWindowsStoreBuild("darwin")).toBe(false);
    expect(isWindowsStoreBuild("linux")).toBe(false);
  });

  it("falls back to navigator detection when process.platform is not an OS platform", () => {
    const originalProcess = globalThis.process;
    const originalNavigator = globalThis.navigator;

    Object.defineProperty(globalThis, "process", {
      value: { platform: "browser" },
      configurable: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      value: { platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      configurable: true,
    });

    try {
      expect(getRuntimePlatform()).toBe("win32");
    } finally {
      Object.defineProperty(globalThis, "process", {
        value: originalProcess,
        configurable: true,
      });
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
      });
    }
  });
});
