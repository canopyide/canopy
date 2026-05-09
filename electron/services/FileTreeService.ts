import * as fs from "fs/promises";
import * as path from "path";
import { createHardenedGit } from "../utils/hardenedGit.js";
import type { FileTreeNode } from "../../shared/types/ipc.js";

const _baseRealpathCache = new Map<string, Promise<string>>();

export function _resetBaseRealpathCacheForTests(): void {
  _baseRealpathCache.clear();
}

function _getBaseRealpath(resolvedBasePath: string): Promise<string> {
  const cached = _baseRealpathCache.get(resolvedBasePath);
  if (cached) return cached;
  const promise = fs.realpath(resolvedBasePath).catch((_err) => {
    _baseRealpathCache.delete(resolvedBasePath);
    return resolvedBasePath;
  });
  _baseRealpathCache.set(resolvedBasePath, promise);
  return promise;
}

export class FileTreeService {
  async getFileTree(basePath: string, dirPath: string = ""): Promise<FileTreeNode[]> {
    const resolvedBasePath = path.resolve(basePath);

    if (path.isAbsolute(dirPath)) {
      throw new Error("Invalid directory path: absolute paths not allowed");
    }

    const normalizedDirPath = path.normalize(dirPath);
    const normalizedForCheck = normalizedDirPath.replace(/\\/g, "/");
    if (
      normalizedForCheck === ".." ||
      normalizedForCheck.startsWith("../") ||
      normalizedForCheck.includes("/../")
    ) {
      throw new Error("Invalid directory path: path traversal not allowed");
    }

    const relativeDirPath =
      normalizedForCheck === "." ? "" : normalizedForCheck.replace(/^\.\/+/, "");
    const targetPath = path.resolve(resolvedBasePath, relativeDirPath);
    const relativeTarget = path.relative(resolvedBasePath, targetPath);

    if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
      throw new Error("Invalid directory path: path traversal not allowed");
    }

    try {
      const resolvedBaseRealPath = await _getBaseRealpath(resolvedBasePath);
      const targetRealPath = await fs.realpath(targetPath).catch(() => targetPath);
      const relativeRealTarget = path.relative(resolvedBaseRealPath, targetRealPath);
      if (relativeRealTarget.startsWith("..") || path.isAbsolute(relativeRealTarget)) {
        throw new Error("Invalid directory path: path traversal not allowed");
      }

      const stats = await fs.stat(targetPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${targetPath}`);
      }

      const entries = await fs.readdir(targetPath, { withFileTypes: true });

      const toGitPath = (p: string) => p.split(path.sep).join("/");
      const pathsToCheck = entries
        .filter((e) => e.name !== ".git")
        .map((e) => toGitPath(path.join(relativeDirPath, e.name)));
      const ignoredPaths = new Set<string>();

      try {
        const git = createHardenedGit(resolvedBasePath);
        if (pathsToCheck.length > 0) {
          const ignored = await git.checkIgnore(pathsToCheck);
          ignored.forEach((p) => ignoredPaths.add(toGitPath(p)));
        }
      } catch (_e) {
        // ignore
      }

      const statResults = await Promise.all(
        entries.map(async (entry) => {
          if (entry.name === ".git") return null;
          if (entry.isSymbolicLink()) return null;

          const relativePath = path.join(relativeDirPath, entry.name);
          const gitRelativePath = toGitPath(relativePath);

          if (ignoredPaths.has(gitRelativePath)) return null;

          const absolutePath = path.join(resolvedBasePath, relativePath);
          try {
            const fileStat = await fs.lstat(absolutePath);
            return { fileStat, name: entry.name, gitRelativePath };
          } catch {
            return null;
          }
        })
      );

      const nodes: FileTreeNode[] = [];
      for (const result of statResults) {
        if (!result) continue;
        const { fileStat, name, gitRelativePath } = result;

        const isDirectory = fileStat.isDirectory();
        if (isDirectory) {
          nodes.push({ name, path: gitRelativePath, isDirectory });
          continue;
        }

        try {
          nodes.push({ name, path: gitRelativePath, isDirectory, size: fileStat.size });
        } catch {
          // skip entries where size read fails
        }
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
}

export const fileTreeService = new FileTreeService();
