/**
 * File Tree Utility
 *
 * Provides utilities for reading directory structure with gitignore support.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { simpleGit } from "simple-git";
import type { FileTreeNode } from "../types/index.js";

/**
 * Get file tree for a directory, respecting .gitignore patterns
 *
 * @param basePath - Absolute path to the worktree root
 * @param dirPath - Optional relative path to a subdirectory (defaults to root)
 * @returns Array of FileTreeNode objects
 */
export async function getFileTree(basePath: string, dirPath: string = ""): Promise<FileTreeNode[]> {
  // Normalize and validate dirPath to prevent path traversal
  const normalizedDirPath = path.normalize(dirPath).replace(/^(\.\.[/\\])+/, "");
  const targetPath = path.resolve(basePath, normalizedDirPath);

  // Security check: ensure target path is within basePath
  if (!targetPath.startsWith(basePath)) {
    throw new Error("Invalid directory path: path traversal not allowed");
  }

  try {
    // Verify the target path exists and is a directory
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${targetPath}`);
    }

    // Read directory contents
    const entries = await fs.readdir(targetPath, { withFileTypes: true });

    // Check ignored files using simple-git
    const pathsToCheck = entries.map((e) => path.join(normalizedDirPath, e.name));
    const ignoredPaths = new Set<string>();

    try {
      const git = simpleGit(basePath);
      // Only check if there are paths to check
      if (pathsToCheck.length > 0) {
        // checkIgnore returns array of ignored paths
        // We use checkIgnore to respect .gitignore
        const ignored = await git.checkIgnore(pathsToCheck);
        ignored.forEach((p) => ignoredPaths.add(p));
      }
    } catch (e) {
      // Ignore errors (e.g. not a git repo), act as if nothing is ignored
      // We proceed without filtering if git check fails
    }

    // Build file tree nodes
    const nodes: FileTreeNode[] = [];

    for (const entry of entries) {
      const relativePath = path.join(normalizedDirPath, entry.name);
      const absolutePath = path.join(basePath, relativePath);

      // Always skip .git directory
      if (entry.name === ".git") {
        continue;
      }

      // Skip ignored files
      if (ignoredPaths.has(relativePath)) {
        continue;
      }

      const isDirectory = entry.isDirectory();
      let size = 0;

      if (!isDirectory) {
        try {
          const fileStat = await fs.stat(absolutePath);
          size = fileStat.size;
        } catch {
          // Skip files that can't be read
          continue;
        }
      }

      nodes.push({
        name: entry.name,
        path: relativePath,
        isDirectory,
        size,
        // Children are lazy-loaded, so we don't populate them here
        children: undefined,
      });
    }

    // Sort: directories first, then files, both alphabetically
    nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return nodes;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Failed to read directory tree: ${error.message}`);
    }
    throw new Error(`Failed to read directory tree: ${String(error)}`);
  }
}
