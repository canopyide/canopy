import * as fs from "fs/promises";
import * as path from "path";
import { simpleGit } from "simple-git";
import type { FileTreeNode } from "../types/index.js";

export async function getFileTree(basePath: string, dirPath: string = ""): Promise<FileTreeNode[]> {
  const normalizedDirPath = path.normalize(dirPath).replace(/^(\.\.[/\\])+/, "");
  const targetPath = path.resolve(basePath, normalizedDirPath);

  if (!targetPath.startsWith(basePath)) {
    throw new Error("Invalid directory path: path traversal not allowed");
  }

  try {
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${targetPath}`);
    }

    const entries = await fs.readdir(targetPath, { withFileTypes: true });

    const pathsToCheck = entries.map((e) => path.join(normalizedDirPath, e.name));
    const ignoredPaths = new Set<string>();

    try {
      const git = simpleGit(basePath);
      if (pathsToCheck.length > 0) {
        const ignored = await git.checkIgnore(pathsToCheck);
        ignored.forEach((p) => ignoredPaths.add(p));
      }
    } catch (e) {
      // ignore
    }
    const nodes: FileTreeNode[] = [];

    for (const entry of entries) {
      const relativePath = path.join(normalizedDirPath, entry.name);
      const absolutePath = path.join(basePath, relativePath);

      if (entry.name === ".git") {
        continue;
      }

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
          continue;
        }
      }

      nodes.push({
        name: entry.name,
        path: relativePath,
        isDirectory,
        size,
        children: undefined,
      });
    }

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
