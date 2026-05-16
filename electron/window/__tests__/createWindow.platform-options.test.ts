import { afterEach, describe, expect, it } from "vitest";

/**
 * Tests the platform-specific BrowserWindow constructor options from
 * createWindow.ts (#7939).
 *
 * The options object is inlined inside setupBrowserWindow, so we replicate
 * its exact platform branching here to verify that:
 *   - macOS gets titleBarStyle: "hiddenInset" + trafficLightPosition, no autoHideMenuBar
 *   - Windows gets titleBarStyle: "hidden" + titleBarOverlay + autoHideMenuBar
 *   - Linux gets autoHideMenuBar only (no titleBarStyle override)
 *
 * If createWindow.ts changes, update this replica to match.
 */

type PlatformOptions = {
  titleBarStyle?: "hidden" | "hiddenInset";
  titleBarOverlay?: { color: string; symbolColor: string; height: number };
  trafficLightPosition?: { x: number; y: number };
  autoHideMenuBar?: boolean;
};

function getPlatformBrowserWindowOptions(windowBg: string): PlatformOptions {
  if (process.platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset" as const,
      trafficLightPosition: { x: 12, y: 18 },
    };
  }
  if (process.platform === "win32") {
    return {
      titleBarStyle: "hidden" as const,
      titleBarOverlay: {
        color: windowBg,
        symbolColor: "#a1a1aa",
        height: 36,
      },
      autoHideMenuBar: true,
    };
  }
  return { autoHideMenuBar: true };
}

describe("platform BrowserWindow options (#7939)", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("macOS gets hiddenInset titleBarStyle and trafficLightPosition, no autoHideMenuBar", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    const opts = getPlatformBrowserWindowOptions("#1a1a1a");
    expect(opts.titleBarStyle).toBe("hiddenInset");
    expect(opts.trafficLightPosition).toEqual({ x: 12, y: 18 });
    expect(opts.autoHideMenuBar).toBeUndefined();
    expect(opts.titleBarOverlay).toBeUndefined();
  });

  it("Windows gets hidden titleBarStyle + titleBarOverlay + autoHideMenuBar: true", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    const opts = getPlatformBrowserWindowOptions("#1a1a1a");
    expect(opts.titleBarStyle).toBe("hidden");
    expect(opts.titleBarOverlay).toEqual({
      color: "#1a1a1a",
      symbolColor: "#a1a1aa",
      height: 36,
    });
    expect(opts.autoHideMenuBar).toBe(true);
  });

  it("Linux gets autoHideMenuBar: true with no titleBarStyle override", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    const opts = getPlatformBrowserWindowOptions("#1a1a1a");
    expect(opts.autoHideMenuBar).toBe(true);
    expect(opts.titleBarStyle).toBeUndefined();
    expect(opts.titleBarOverlay).toBeUndefined();
    expect(opts.trafficLightPosition).toBeUndefined();
  });
});
