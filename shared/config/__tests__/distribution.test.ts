import { afterEach, describe, expect, it } from "vitest";
import { getRuntimePlatform, isWindowsStoreBuild } from "../distribution.js";

type WindowsStoreProcess = Partial<NodeJS.Process & { windowsStore?: boolean }>;

describe("distribution config", () => {
  describe("isWindowsStoreBuild", () => {
    const originalWindowsStore = (process as WindowsStoreProcess).windowsStore;

    afterEach(() => {
      Object.defineProperty(process, "windowsStore", {
        value: originalWindowsStore,
        configurable: true,
      });
    });

    it("returns the explicit override when provided", () => {
      expect(isWindowsStoreBuild(true)).toBe(true);
      expect(isWindowsStoreBuild(false)).toBe(false);
    });

    it("returns true when process.windowsStore is true (MSIX build)", () => {
      Object.defineProperty(process, "windowsStore", { value: true, configurable: true });
      expect(isWindowsStoreBuild()).toBe(true);
    });

    it("returns false when process.windowsStore is undefined (NSIS/Squirrel build)", () => {
      Object.defineProperty(process, "windowsStore", {
        value: undefined,
        configurable: true,
      });
      expect(isWindowsStoreBuild()).toBe(false);
    });

    it("returns false when process.windowsStore is false", () => {
      Object.defineProperty(process, "windowsStore", { value: false, configurable: true });
      expect(isWindowsStoreBuild()).toBe(false);
    });
  });

  describe("isWindowsStoreBuild in renderer context", () => {
    const originalWindow = (globalThis as { window?: unknown }).window;

    afterEach(() => {
      (globalThis as { window?: unknown }).window = originalWindow;
    });

    it("reads window.electron.isWindowsStoreBuild when window is defined", () => {
      (globalThis as { window?: unknown }).window = { electron: { isWindowsStoreBuild: true } };
      expect(isWindowsStoreBuild()).toBe(true);
    });

    it("returns false when window.electron is missing", () => {
      (globalThis as { window?: unknown }).window = {};
      expect(isWindowsStoreBuild()).toBe(false);
    });

    it("returns false when window.electron.isWindowsStoreBuild is false", () => {
      (globalThis as { window?: unknown }).window = { electron: { isWindowsStoreBuild: false } };
      expect(isWindowsStoreBuild()).toBe(false);
    });

    it("prefers the renderer bridge over process.windowsStore when window is defined", () => {
      // Renderer bridge says false, but process.windowsStore is true — the
      // renderer must trust the bridge (which was stamped from the preload's
      // authoritative read) and not the renderer-side process global.
      Object.defineProperty(process, "windowsStore", { value: true, configurable: true });
      (globalThis as { window?: unknown }).window = { electron: { isWindowsStoreBuild: false } };
      try {
        expect(isWindowsStoreBuild()).toBe(false);
      } finally {
        Object.defineProperty(process, "windowsStore", {
          value: undefined,
          configurable: true,
        });
      }
    });
  });

  describe("getRuntimePlatform", () => {
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
});
