import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getRuntimePlatform, isWindowsStoreBuild } from "../distribution.js";

type WithStoreFlag = NodeJS.Process & { windowsStore?: boolean };

describe("distribution config", () => {
  describe("isWindowsStoreBuild", () => {
    let originalStoreFlag: boolean | undefined;
    let originalHadFlag: boolean;

    beforeEach(() => {
      const proc = process as any;
      originalHadFlag = "windowsStore" in proc;
      originalStoreFlag = proc.windowsStore;
      delete proc.windowsStore;
    });

    afterEach(() => {
      const proc = process as any;
      if (originalHadFlag) {
        proc.windowsStore = originalStoreFlag;
      } else {
        delete proc.windowsStore;
      }
    });

    it("returns true when an explicit value of true is supplied (renderer bridge path)", () => {
      expect(isWindowsStoreBuild(true)).toBe(true);
    });

    it("returns false when an explicit value of false is supplied (NSIS renderer path)", () => {
      expect(isWindowsStoreBuild(false)).toBe(false);
    });

    it("returns false when process.windowsStore is undefined (NSIS install or non-Windows)", () => {
      expect(isWindowsStoreBuild()).toBe(false);
    });

    it("returns true when process.windowsStore is true (main-process MSIX detection)", () => {
      (process as WithStoreFlag).windowsStore = true;
      expect(isWindowsStoreBuild()).toBe(true);
    });

    it("returns false when process.windowsStore is false (main-process NSIS detection)", () => {
      (process as WithStoreFlag).windowsStore = false;
      expect(isWindowsStoreBuild()).toBe(false);
    });

    it("explicit argument wins over process.windowsStore", () => {
      (process as WithStoreFlag).windowsStore = true;
      expect(isWindowsStoreBuild(false)).toBe(false);
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
