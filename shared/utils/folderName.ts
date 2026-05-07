import { WINDOWS_RESERVED_NAMES } from "./pathPattern.js";

const CONTROL_CHARS = /[\x00-\x1F]/;
const WIN32_ILLEGAL_CHARS = /[<>:"|?*]/;
const PATH_SEPARATORS = /[/\\]/;
const TRAILING_DOT_OR_SPACE = /[. ]$/;

/**
 * Validate a single folder-name segment for project creation. Returns a
 * user-facing error string if invalid, or `null` if the name is acceptable.
 *
 * Used by both renderer dialogs and main-process IPC handlers so all three
 * project-add paths apply the same rules. Pure string logic — no Node APIs —
 * so it imports cleanly from either side of the contextBridge.
 */
export function validateFolderName(name: string): string | null {
  if (typeof name !== "string") return "Folder name is required";
  const trimmed = name.trim();
  if (!trimmed) return "Folder name is required";
  if (trimmed === "." || trimmed === "..") return "Invalid folder name";

  if (trimmed.length > 255) return "Folder name is too long";

  if (PATH_SEPARATORS.test(trimmed)) {
    return "Folder name must not contain path separators";
  }
  if (CONTROL_CHARS.test(trimmed)) {
    return "Folder name must not contain control characters";
  }
  if (WIN32_ILLEGAL_CHARS.test(trimmed)) {
    return 'Folder name must not contain < > : " | ? or *';
  }

  // Win32 silently strips trailing dot/space at creation, which can collapse
  // distinct names or produce reserved-name collisions; reject on the raw
  // input so a user-typed `foo ` isn't quietly normalized to `foo`.
  if (TRAILING_DOT_OR_SPACE.test(name) || TRAILING_DOT_OR_SPACE.test(trimmed)) {
    return "Folder name must not end with a space or period";
  }

  // Leading dash is a tooling hazard — argv parsers (git, shells) treat it as
  // a flag.
  if (trimmed.startsWith("-")) {
    return "Folder name must not start with '-'";
  }

  // Win32 reserved-name check: strip extension and compare the stem
  // case-insensitively. CON, NUL.txt, COM1.log, etc. are all blocked.
  const dotIndex = trimmed.indexOf(".");
  const stem = dotIndex === -1 ? trimmed : trimmed.slice(0, dotIndex);
  if (WINDOWS_RESERVED_NAMES.has(stem.toUpperCase())) {
    return `Folder name uses Windows-reserved name '${stem}'`;
  }

  return null;
}
