import { dirname, resolve } from 'path';
import { realpathSync, promises as fs } from 'fs';
import { simpleGit, SimpleGit, StatusResult } from 'simple-git';
import type { FileChangeDetail, GitStatus, WorktreeChanges } from '../types/index.js';
import { GitError, WorktreeRemovedError } from './errorTypes.js';
import { logWarn, logError } from './logger.js';
import { Cache } from './cache.js';

// Worktree changes cache configuration
const GIT_WORKTREE_CHANGES_CACHE = new Cache<string, WorktreeChanges>({
  maxSize: 100,
  defaultTTL: 5000,
});

let cleanupInterval: NodeJS.Timeout | null = null;

function runCacheCleanup(): void {
  GIT_WORKTREE_CHANGES_CACHE.cleanup();
}

// Start periodic cache cleanup (no-op if already running)
export function startWorktreeCacheCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(runCacheCleanup, 10000);
  // Unref the interval so it doesn't keep the process alive
  cleanupInterval.unref();
}

// Allow cleanup to be stopped (for testing)
export function stopWorktreeCacheCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// Legacy aliases for backward compatibility
export { startWorktreeCacheCleanup as startGitStatusCacheCleanup };
export { stopWorktreeCacheCleanup as stopGitStatusCacheCleanup };

if (process.env.NODE_ENV !== 'test') {
  startWorktreeCacheCleanup();
}

/**
 * Invalidate worktree changes cache for a directory.
 * Call this when you know git status has changed.
 *
 * @param cwd - Directory to invalidate
 */
export function invalidateWorktreeCache(cwd: string): void {
  GIT_WORKTREE_CHANGES_CACHE.invalidate(cwd);
}

// Legacy alias for backward compatibility
export { invalidateWorktreeCache as invalidateGitStatusCache };

/**
 * Clear all worktree changes caches.
 * Useful when switching worktrees.
 */
export function clearWorktreeCache(): void {
  GIT_WORKTREE_CHANGES_CACHE.clear();
}

// Legacy alias for backward compatibility
export { clearWorktreeCache as clearGitStatusCache };

interface DiffStat {
  insertions: number | null;
  deletions: number | null;
}

const NUMSTAT_PATH_SPLITTERS = ['=>', '->'];

function normalizeNumstatPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  for (const splitter of NUMSTAT_PATH_SPLITTERS) {
    const idx = trimmed.lastIndexOf(splitter);
    if (idx !== -1) {
      return trimmed
        .slice(idx + splitter.length)
        .replace(/[{}]/g, '')
        .trim();
    }
  }
  return trimmed.replace(/[{}]/g, '');
}

function parseNumstat(diffOutput: string, gitRoot: string): Map<string, DiffStat> {
  const stats = new Map<string, DiffStat>();
  const lines = diffOutput.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;

    const [insertionsRaw, deletionsRaw, ...pathParts] = parts;
    const rawPath = pathParts.join('\t');
    const normalizedPath = normalizeNumstatPath(rawPath);
    const absolutePath = resolve(gitRoot, normalizedPath);

    const insertions =
      insertionsRaw === '-' ? null : Number.parseInt(insertionsRaw, 10);
    const deletions =
      deletionsRaw === '-' ? null : Number.parseInt(deletionsRaw, 10);

    stats.set(absolutePath, {
      insertions: Number.isNaN(insertions) ? null : insertions,
      deletions: Number.isNaN(deletions) ? null : deletions,
    });
  }

  return stats;
}

/**
 * Get total commit count for the current branch.
 * @param cwd - Working directory
 * @returns Number of commits in the current branch history
 */
export async function getCommitCount(cwd: string): Promise<number> {
  try {
    const git = simpleGit(cwd);
    // 'HEAD' counts all commits in history of current branch
    const count = await git.raw(['rev-list', '--count', 'HEAD']);
    return parseInt(count.trim(), 10);
  } catch (error) {
    logWarn('Failed to get commit count', { cwd, error: (error as Error).message });
    return 0;
  }
}

/**
 * Fetch worktree changes enriched with insertion/deletion counts.
 * Includes caching with the same TTL as basic status.
 */
export async function getWorktreeChangesWithStats(
  cwd: string,
  forceRefresh = false,
): Promise<WorktreeChanges> {
  if (!forceRefresh) {
    const cached = GIT_WORKTREE_CHANGES_CACHE.get(cwd);
    if (cached) {
      return {
        ...cached,
        changes: cached.changes.map(change => ({ ...change })),
      };
    }
  }

  // PERF: Limit the number of files we calculate stats for to prevent CPU hang
  // on massive changesets (e.g., accidental package-lock.json deletion in monorepo)
  const MAX_FILES_FOR_NUMSTAT = 100;

  // Check if directory exists before calling simpleGit.
  // simple-git throws immediately if cwd doesn't exist, which can flood stderr
  // when a worktree is deleted externally while being monitored.
  try {
    await fs.access(cwd);
  } catch (accessError) {
    const nodeError = accessError as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      throw new WorktreeRemovedError(cwd, nodeError);
    }
    // Re-throw other access errors (e.g., permissions)
    throw accessError;
  }

  try {
    const git: SimpleGit = simpleGit(cwd);
    const status: StatusResult = await git.status();
    const gitRoot = realpathSync((await git.revparse(['--show-toplevel'])).trim());

    // Collect all tracked changed files for numstat (excludes untracked)
    const trackedChangedFiles = [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.renamed.map(r => r.to),
    ];

    let diffOutput = '';

    try {
      if (trackedChangedFiles.length === 0) {
        // No tracked changes - skip numstat entirely
        diffOutput = '';
      } else if (trackedChangedFiles.length <= MAX_FILES_FOR_NUMSTAT) {
        // Small changeset - run numstat on all files
        diffOutput = await git.diff(['--numstat', 'HEAD']);
      } else {
        // PERF: Large changeset - only run numstat on first N files to prevent CPU hang
        // The remaining files will show stats as 0/0 but will still appear in the list
        const limitedFiles = trackedChangedFiles.slice(0, MAX_FILES_FOR_NUMSTAT);
        diffOutput = await git.diff(['--numstat', 'HEAD', '--', ...limitedFiles]);
        logWarn('Large changeset detected; limiting numstat to first 100 files', {
          cwd,
          totalFiles: trackedChangedFiles.length,
          limitedTo: MAX_FILES_FOR_NUMSTAT,
        });
      }
    } catch (error) {
      logWarn('Failed to read numstat diff; continuing without line stats', {
        cwd,
        message: (error as Error).message,
      });
    }

    const diffStats = parseNumstat(diffOutput, gitRoot);
    const changesMap = new Map<string, FileChangeDetail>();

    /**
     * Helper to count lines in a file by reading from filesystem.
     * Used for untracked files where git diff doesn't provide stats.
     * Counts newline characters to match git diff --numstat behavior.
     * Skips files larger than 10MB to avoid memory issues.
     */
    const countFileLines = async (filePath: string): Promise<number | null> => {
      try {
        // Check file size first - skip large files to avoid memory issues
        const stats = await fs.stat(filePath);
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        if (stats.size > MAX_FILE_SIZE) {
          return null; // Skip large files
        }

        // Read as buffer first to detect binary files
        const buffer = await fs.readFile(filePath);

        // Check for binary content (presence of NUL bytes in first 8KB)
        const sampleSize = Math.min(buffer.length, 8192);
        for (let i = 0; i < sampleSize; i++) {
          if (buffer[i] === 0) {
            // Binary file detected - return null
            return null;
          }
        }

        // Convert to string and count newlines
        const content = buffer.toString('utf-8');

        // Empty file = 0 lines
        if (content.length === 0) {
          return 0;
        }

        // Count newline characters (matches git diff --numstat)
        let lineCount = 0;
        for (let i = 0; i < content.length; i++) {
          if (content[i] === '\n') {
            lineCount++;
          }
        }

        // If file doesn't end with newline, add 1 for the final line
        if (content[content.length - 1] !== '\n') {
          lineCount++;
        }

        return lineCount;
      } catch (error) {
        // File may be unreadable, or deleted between status check and read
        // Fall back to null to indicate we couldn't determine line count
        return null;
      }
    };

    const addChange = async (pathFragment: string, statusValue: GitStatus) => {
      const absolutePath = resolve(gitRoot, pathFragment);
      const existing = changesMap.get(absolutePath);
      if (existing) {
        return;
      }

      const statsForFile = diffStats.get(absolutePath);
      let insertions: number | null;
      let deletions: number | null;

      // For untracked files without diff stats, read from filesystem to get line count
      if (statusValue === 'untracked' && !statsForFile) {
        insertions = await countFileLines(absolutePath);
        deletions = null; // Untracked files have no deletions
      } else {
        insertions = statsForFile?.insertions ?? (statusValue === 'untracked' ? null : 0);
        deletions = statsForFile?.deletions ?? (statusValue === 'untracked' ? null : 0);
      }

      changesMap.set(absolutePath, {
        path: absolutePath,
        status: statusValue,
        insertions,
        deletions,
      });
    };

    // Process tracked files sequentially (no filesystem reads needed)
    for (const file of status.modified) {
      await addChange(file, 'modified');
    }

    for (const file of status.renamed) {
      if (typeof file !== 'string' && file.to) {
        await addChange(file.to, 'renamed');
      }
    }

    for (const file of status.created) {
      await addChange(file, 'added');
    }

    for (const file of status.deleted) {
      await addChange(file, 'deleted');
    }

    if (status.conflicted) {
      for (const file of status.conflicted) {
        await addChange(file, 'modified');
      }
    }

    // Process untracked files in parallel with bounded concurrency (max 10 at once)
    // to avoid blocking on filesystem reads while preventing memory issues
    // PERF: Also limit total untracked files processed to prevent CPU hang on massive repos
    const untrackedFiles = status.not_added;
    const MAX_UNTRACKED_FILES = 200; // Limit untracked file processing
    const concurrencyLimit = 10;

    const limitedUntrackedFiles = untrackedFiles.length > MAX_UNTRACKED_FILES
      ? untrackedFiles.slice(0, MAX_UNTRACKED_FILES)
      : untrackedFiles;

    if (untrackedFiles.length > MAX_UNTRACKED_FILES) {
      logWarn('Large number of untracked files; limiting to first 200', {
        cwd,
        totalUntracked: untrackedFiles.length,
        limitedTo: MAX_UNTRACKED_FILES,
      });
    }

    for (let i = 0; i < limitedUntrackedFiles.length; i += concurrencyLimit) {
      const batch = limitedUntrackedFiles.slice(i, i + concurrencyLimit);
      await Promise.all(batch.map(file => addChange(file, 'untracked')));
    }

    // Backfill any files that appear in diff stats but not in status
    for (const [absolutePath, stats] of diffStats.entries()) {
      if (changesMap.has(absolutePath)) continue;
      changesMap.set(absolutePath, {
        path: absolutePath,
        status: 'modified',
        insertions: stats.insertions ?? 0,
        deletions: stats.deletions ?? 0,
      });
    }

    // Calculate the latest modification time across all changed files so we can
    // throttle AI refreshes based on real file activity instead of hash churn.
    // Also store mtimeMs on each change for recency scoring in AI summaries.
    const mtimes = await Promise.all(
      Array.from(changesMap.values()).map(async (change) => {
        const targetPath = change.status === 'deleted'
          ? dirname(change.path)
          : change.path;

        try {
          const stat = await fs.stat(targetPath);
          change.mtimeMs = stat.mtimeMs; // Store mtime on the change object
          return stat.mtimeMs;
        } catch {
          change.mtimeMs = 0;
          return 0;
        }
      })
    );

    const changes = Array.from(changesMap.values());
    const totalInsertions = changes.reduce(
      (sum, change) => sum + (change.insertions ?? 0),
      0
    );
    const totalDeletions = changes.reduce(
      (sum, change) => sum + (change.deletions ?? 0),
      0
    );
    const latestFileMtime = mtimes.length > 0 ? Math.max(...mtimes) : 0;

    const result: WorktreeChanges = {
      worktreeId: realpathSync(cwd),
      rootPath: gitRoot,
      changes,
      changedFileCount: changes.length,
      totalInsertions,
      totalDeletions,
      insertions: totalInsertions,
      deletions: totalDeletions,
      latestFileMtime,
      lastUpdated: Date.now(),
    };

    GIT_WORKTREE_CHANGES_CACHE.set(cwd, result);
    return result;
  } catch (error) {
    // Re-throw WorktreeRemovedError without wrapping or logging
    // This is an expected lifecycle event (worktree deleted externally), not an error
    if (error instanceof WorktreeRemovedError) {
      throw error;
    }

    // Handle race condition: directory disappeared between fs.access check and git operations
    // simple-git errors contain the ENOENT message, convert to WorktreeRemovedError
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes('ENOENT') ||
      errorMessage.includes('no such file or directory') ||
      errorMessage.includes('Unable to read current working directory')
    ) {
      throw new WorktreeRemovedError(cwd, error instanceof Error ? error : undefined);
    }

    const cause = error instanceof Error ? error : new Error(String(error));
    const gitError = new GitError(
      'Failed to get git worktree changes',
      { cwd },
      cause
    );
    logError('Git worktree changes operation failed', gitError, { cwd });
    throw gitError;
  }
}
