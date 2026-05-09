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

export function isWindowsStoreBuild(platform = getRuntimePlatform()): boolean {
  return platform === "win32";
}
