import type { WorktreeChanges } from '../../types/index.js';

/**
 * Generate AI summary for worktree changes
 * Stub implementation - returns null to disable AI summaries
 * TODO: Implement full AI summary generation when needed
 */
export async function generateWorktreeSummary(
  _worktreePath: string,
  _branch: string | undefined,
  _mainBranch: string,
  _changes: WorktreeChanges
): Promise<{ summary: string; modifiedCount: number } | null> {
  // Stub: AI summaries disabled for initial migration
  return null;
}
