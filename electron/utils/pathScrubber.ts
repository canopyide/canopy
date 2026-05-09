import os from "os";

/**
 * Pure path-sanitizing utility for telemetry, diagnostics, and audit
 * surfaces. Replaces the current user's home directory and common
 * macOS / Linux / Windows user paths with `~` or `USER` placeholders so
 * shareable strings don't reveal account names.
 *
 * Extracted from `TelemetryService.ts` so consumers (e.g. the MCP audit
 * log) can apply the same scrub without dragging Sentry initialization
 * into their import graph.
 */

const HOME_DIR = os.homedir();
const HOME_DIR_ESCAPED = HOME_DIR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const HOME_DIR_REGEX = new RegExp(HOME_DIR_ESCAPED, "g");

export function sanitizePath(str: string): string {
  return str
    .replace(HOME_DIR_REGEX, "~")
    .replace(/\/Users\/[^/]+\//g, "/Users/USER/")
    .replace(/\/home\/[^/]+\//g, "/home/USER/")
    .replace(/C:\\Users\\[^\\]+\\/gi, "C:\\Users\\USER\\")
    .replace(/C:\/Users\/[^/]+\//gi, "C:/Users/USER/");
}
