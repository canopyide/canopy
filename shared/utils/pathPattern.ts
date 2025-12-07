import * as _path from "path";

// Browser-compatible path implementation
const browserPath = {
  isAbsolute: (p: string) => {
    return /^([a-zA-Z]:|[\\/])/.test(p);
  },
  basename: (p: string) => {
    return p.split(/[\\/]/).pop() || "";
  },
  dirname: (p: string) => {
    const parts = p.split(/[\\/]/);
    parts.pop();
    return parts.join("/") || ".";
  },
  resolve: (...paths: string[]) => {
    let resolved = "";
    for (const p of paths) {
      if (!p) continue;
      if (/^([a-zA-Z]:|[\\/])/.test(p)) {
        resolved = p;
      } else {
        resolved = resolved ? `${resolved}/${p}` : p;
      }
    }
    return browserPath.normalize(resolved);
  },
  normalize: (p: string) => {
    // Basic normalization for preview purposes
    return p.replace(/\\/g, "/").replace(/\/+/g, "/");
  },
};

// Use native path if available (Node.js), otherwise fallback to browser implementation
const path = _path && typeof _path.isAbsolute === "function" ? _path : browserPath;

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
