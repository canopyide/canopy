import { simpleGit } from 'simple-git';
import type { Worktree, WorktreeChanges, WorktreeMood } from '../types/index.js';
import { logWarn } from './logger.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Get the age of the last commit in days for a worktree path.
 * Returns null if the age can't be determined (e.g., no commits or git failure).
 */
export async function getLastCommitAgeInDays(worktreePath: string): Promise<number | null> {
  try {
    const git = simpleGit(worktreePath);
    const log = await git.log({ maxCount: 1 });
    const lastDate = log.latest?.date;
    if (!lastDate) return null;

    const timestamp = new Date(lastDate).getTime();
    if (Number.isNaN(timestamp)) return null;

    const ageDays = (Date.now() - timestamp) / MS_PER_DAY;
    return ageDays < 0 ? 0 : ageDays;
  } catch (error) {
    logWarn('Failed to compute last commit age', {
      path: worktreePath,
      message: (error as Error).message,
    });
    return null;
  }
}

/**
 * Categorize a worktree based on branch, change count, and staleness.
 */
export async function categorizeWorktree(
  worktree: Worktree,
  changes: WorktreeChanges | undefined,
  mainBranch: string,
  staleThresholdDays: number = 7
): Promise<WorktreeMood> {
  try {
    const changedCount = changes?.changedFileCount ?? 0;

    if (worktree.branch === mainBranch && changedCount === 0) {
      return 'stable';
    }

    if (changedCount > 0) {
      return 'active';
    }

    const ageDays = await getLastCommitAgeInDays(worktree.path);
    if (ageDays !== null && ageDays > staleThresholdDays) {
      return 'stale';
    }

    return 'stable';
  } catch (error) {
    logWarn('Failed to categorize worktree mood', {
      path: worktree.path,
      message: (error as Error).message,
    });
    return 'error';
  }
}
