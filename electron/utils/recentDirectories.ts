import { promises as fs } from "fs";
import { basename } from "path";
import { execSync } from "child_process";
import type { RecentDirectory } from "../types/index.js";

/**
 * Detect git root directory for a given path
 * Returns undefined if not a git repository
 */
async function detectGitRoot(dirPath: string): Promise<string | undefined> {
  try {
    const result = execSync("git rev-parse --show-toplevel", {
      cwd: dirPath,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return result.trim();
  } catch {
    return undefined;
  }
}

/**
 * Update recent directories list with a new directory
 *
 * Deduplicates by resolved real path, adds new entry to front,
 * and limits to MAX_RECENT_DIRECTORIES entries.
 *
 * @param currentRecents - Current list of recent directories
 * @param newPath - New directory path to add
 * @returns Updated list of recent directories
 */
export async function updateRecentDirectories(
  currentRecents: RecentDirectory[],
  newPath: string
): Promise<RecentDirectory[]> {
  const MAX_RECENT_DIRECTORIES = 10;

  try {
    // Resolve symlinks to real path for deduplication
    const realPath = await fs.realpath(newPath);

    // Remove existing entry if present (dedupe)
    const filtered = currentRecents.filter((r) => r.path !== realPath);

    // Try to detect git root
    let gitRoot: string | undefined;
    try {
      gitRoot = await detectGitRoot(realPath);
    } catch (error) {
      // Not a git repo or can't detect - that's OK
      gitRoot = undefined;
    }

    // Create new entry
    const newEntry: RecentDirectory = {
      path: realPath,
      lastOpened: Date.now(),
      displayName: basename(realPath),
      gitRoot,
    };

    // Add to front
    filtered.unshift(newEntry);

    // Limit to MAX_RECENT_DIRECTORIES
    return filtered.slice(0, MAX_RECENT_DIRECTORIES);
  } catch (error) {
    // If path doesn't exist or can't be resolved, don't add it
    console.warn("[recentDirectories] Failed to add directory:", newPath, error);
    return currentRecents;
  }
}

/**
 * Truncate path for display in menus
 * Shortens very long paths by truncating from the middle
 *
 * @param path - Full path
 * @param maxLength - Maximum length (default 60)
 * @returns Truncated path
 */
export function truncatePathForMenu(path: string, maxLength = 60): string {
  if (path.length <= maxLength) {
    return path;
  }

  const ellipsis = "...";
  const charsToShow = maxLength - ellipsis.length;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);

  return path.slice(0, frontChars) + ellipsis + path.slice(path.length - backChars);
}
