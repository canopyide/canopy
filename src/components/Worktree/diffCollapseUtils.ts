import type { File } from "gitdiff-parser";

export const DIFF_SOFT_COLLAPSE_BYTES = 256 * 1024;
export const DIFF_HARD_REFUSAL_BYTES = 1024 * 1024;

// Basename exact matches for lockfiles.
const LOCKFILE_BASENAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "pnpm-lock.yml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "go.sum",
  "Gemfile.lock",
  "Pipfile.lock",
  "poetry.lock",
  "composer.lock",
  "mix.lock",
  "flake.lock",
  "deno.lock",
]);

// Extension / suffix patterns for minified bundles, generated code, and binary lockfiles.
const COLLAPSED_SUFFIXES = [
  ".min.js",
  ".min.css",
  ".min.js.map",
  ".min.css.map",
  ".lockb",
  ".bundle.js",
  ".bundle.css",
  ".bundle.js.map",
  ".bundle.css.map",
  ".chunk.js",
  ".chunk.css",
  ".chunk.js.map",
  ".chunk.css.map",
  ".generated.js",
  ".generated.ts",
  ".generated.css",
  ".pb.go",
  ".pb.cc",
  ".pb.h",
  ".designer.cs",
  ".Designer.cs",
  ".wasm",
];

export function getFilePath(file: File): string {
  if (file.newPath && file.newPath !== "/dev/null") return file.newPath;
  if (file.oldPath && file.oldPath !== "/dev/null") return file.oldPath;
  return "";
}

export function isGeneratedDiffPath(filePath: string): boolean {
  if (!filePath) return false;
  const segments = filePath.replace(/\\/g, "/").split("/");
  const basename = segments[segments.length - 1];
  if (!basename) return false;

  if (LOCKFILE_BASENAMES.has(basename)) return true;

  for (const suffix of COLLAPSED_SUFFIXES) {
    if (basename.endsWith(suffix)) return true;
  }
  return false;
}

export function estimateFileDiffBytes(file: File): number {
  let bytes = 0;
  for (const hunk of file.hunks ?? []) {
    bytes += hunk.content.length;
    for (const change of hunk.changes) {
      bytes += change.content.length;
    }
  }
  return bytes;
}

export function shouldCollapseByDefault(file: File): {
  collapse: boolean;
  reason: "generated" | "large" | null;
} {
  const path = getFilePath(file);
  if (isGeneratedDiffPath(path)) {
    return { collapse: true, reason: "generated" };
  }
  if (estimateFileDiffBytes(file) > DIFF_SOFT_COLLAPSE_BYTES) {
    return { collapse: true, reason: "large" };
  }
  return { collapse: false, reason: null };
}
