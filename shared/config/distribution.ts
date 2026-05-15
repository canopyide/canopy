export function getRuntimePlatform(): string {
  if (typeof process !== "undefined" && typeof process.platform === "string") {
    if (["win32", "darwin", "linux"].includes(process.platform)) {
      return process.platform;
    }
  }

  if (typeof navigator !== "undefined") {
    const platform = navigator.platform?.toUpperCase() ?? "";
    const userAgent = navigator.userAgent ?? "";
    if (platform.includes("WIN") || /\bWindows\b|\bWin(32|64)\b/.test(userAgent)) {
      return "win32";
    }
    if (platform.includes("MAC")) {
      return "darwin";
    }
    if (userAgent.includes("Linux")) {
      return "linux";
    }
  }

  return "unknown";
}

/**
 * Detects MSIX/AppX (Microsoft Store) builds where update delivery is owned by
 * the OS — auto-update IPC and the in-app update UI must be disabled.
 *
 * Reads `process.windowsStore` (set to `true` by Electron only inside an
 * MSIX/AppX container — including sideloaded MSIX). NSIS installer builds
 * leave the property `undefined`, so the function returns `false` there.
 *
 * The renderer sandbox does not expose `process.windowsStore`. Renderer
 * callers must pass the value through (via `HydrateResult.isWindowsStore`)
 * instead of relying on the static default.
 */
export function isWindowsStoreBuild(windowsStore?: boolean): boolean {
  if (typeof windowsStore === "boolean") return windowsStore;
  if (
    typeof process !== "undefined" &&
    typeof (process as NodeJS.Process & { windowsStore?: boolean }).windowsStore === "boolean"
  ) {
    return (process as NodeJS.Process & { windowsStore?: boolean }).windowsStore === true;
  }
  return false;
}
