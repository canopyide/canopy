import { isAbsolute, normalize, basename, dirname, resolve } from "./path.js";

const path = { isAbsolute, normalize, basename, dirname, resolve };

export interface PathPatternVariables {
  "base-folder": string;
  "branch-slug": string;
  "repo-name": string;
  "parent-dir": string;
}

export const DEFAULT_WORKTREE_PATH_PATTERN = "{parent-dir}/{base-folder}-worktrees/{branch-slug}";

export function sanitizeBranchName(branchName: string): string {
  return branchName
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function resolvePathPattern(
  pattern: string,
  variables: PathPatternVariables,
  rootPath: string
): string {
  let resolved = pattern;

  for (const [key, value] of Object.entries(variables)) {
    resolved = resolved.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }

  if (!path.isAbsolute(resolved)) {
    resolved = path.resolve(rootPath, resolved);
  }

  return path.normalize(resolved);
}

export function buildPathPatternVariables(
  rootPath: string,
  branchName: string
): PathPatternVariables {
  const baseFolder = path.basename(rootPath);
  const parentDir = path.dirname(rootPath);
  const branchSlug = sanitizeBranchName(branchName);

  return {
    "base-folder": baseFolder,
    "branch-slug": branchSlug,
    "repo-name": baseFolder,
    "parent-dir": parentDir,
  };
}

export function generateWorktreePath(
  rootPath: string,
  branchName: string,
  pattern: string = DEFAULT_WORKTREE_PATH_PATTERN
): string {
  const variables = buildPathPatternVariables(rootPath, branchName);
  return resolvePathPattern(pattern, variables, rootPath);
}

// Windows reserved device names (case-insensitive). Microsoft added COM0/LPT0
// in Windows 10 1803, so the set covers 0–9 for both COM and LPT. Match
// against each path component after stripping any extension (e.g. NUL.txt).
export const WINDOWS_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM0",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT0",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

export function validateBranchName(name: string): { valid: boolean; error?: string } {
  if (typeof name !== "string" || name.length === 0) {
    return { valid: false, error: "Branch name cannot be empty" };
  }
  if (name.trim().length === 0) {
    return { valid: false, error: "Branch name cannot be blank" };
  }

  if (name === "HEAD") {
    return { valid: false, error: "Branch name cannot be 'HEAD'" };
  }
  if (name === "@") {
    return { valid: false, error: "Branch name cannot be '@'" };
  }
  if (name.startsWith("-")) {
    return { valid: false, error: "Branch name cannot start with '-'" };
  }

  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code < 32 || code === 127) {
      return { valid: false, error: "Branch name cannot contain control characters" };
    }
  }

  // git check-ref-format: space, ~, ^, :, ?, *, [, \ are forbidden anywhere.
  const forbidden = /[ ~^:?*[\\]/;
  const match = name.match(forbidden);
  if (match) {
    return { valid: false, error: `Branch name cannot contain '${match[0]}'` };
  }

  if (name.includes("..")) {
    return { valid: false, error: "Branch name cannot contain '..'" };
  }
  if (name.includes("@{")) {
    return { valid: false, error: "Branch name cannot contain '@{'" };
  }
  if (name.includes("//")) {
    return { valid: false, error: "Branch name cannot contain consecutive slashes" };
  }
  if (name.startsWith("/") || name.endsWith("/")) {
    return { valid: false, error: "Branch name cannot start or end with '/'" };
  }
  if (name.endsWith(".")) {
    return { valid: false, error: "Branch name cannot end with '.'" };
  }
  if (name.endsWith(".lock")) {
    return { valid: false, error: "Branch name cannot end with '.lock'" };
  }

  const components = name.split("/");
  for (const component of components) {
    if (component.length === 0) {
      return { valid: false, error: "Branch name cannot have empty path components" };
    }
    if (component.startsWith(".")) {
      return { valid: false, error: "Branch name components cannot start with '.'" };
    }
    if (component.endsWith(".lock")) {
      return { valid: false, error: "Branch name components cannot end with '.lock'" };
    }

    // Windows reserved-name check: strip any extension (NUL.txt is reserved
    // because the base name resolves to NUL on Windows) and compare the base
    // name case-insensitively against the device-name set.
    const dotIndex = component.indexOf(".");
    const base = dotIndex === -1 ? component : component.slice(0, dotIndex);
    if (WINDOWS_RESERVED_NAMES.has(base.toUpperCase())) {
      return {
        valid: false,
        error: `Branch name uses Windows-reserved name '${base}'`,
      };
    }
  }

  return { valid: true };
}

export function validatePathPattern(pattern: string): { valid: boolean; error?: string } {
  if (!pattern || pattern.trim().length === 0) {
    return { valid: false, error: "Pattern cannot be empty" };
  }

  if (path.isAbsolute(pattern) && !pattern.startsWith("{parent-dir}")) {
    return {
      valid: false,
      error: "Absolute paths are not allowed (use {parent-dir} for parent directory)",
    };
  }

  if (pattern.includes("..")) {
    return {
      valid: false,
      error: "Path traversal (..) is not allowed for security reasons",
    };
  }

  const validVariables = ["{base-folder}", "{branch-slug}", "{repo-name}", "{parent-dir}"];
  const variablePattern = /\{[^}]+\}/g;
  const matches = pattern.match(variablePattern) || [];

  for (const match of matches) {
    if (!validVariables.includes(match)) {
      return {
        valid: false,
        error: `Unknown variable: ${match}. Valid variables: ${validVariables.join(", ")}`,
      };
    }
  }

  if (!pattern.includes("{branch-slug}")) {
    return {
      valid: false,
      error: "Pattern must include {branch-slug} to create unique paths",
    };
  }

  return { valid: true };
}

export function previewPathPattern(
  pattern: string,
  rootPath: string,
  sampleBranch: string = "feature/example-branch"
): string {
  try {
    return generateWorktreePath(rootPath, sampleBranch, pattern);
  } catch {
    return "Invalid pattern";
  }
}
