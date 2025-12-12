import type { GitStatus } from "../domain.js";

/** Get file diff payload */
export interface GitGetFileDiffPayload {
  /** Working directory (worktree path) */
  cwd: string;
  /** Path to the file relative to worktree root */
  filePath: string;
  /** Git status of the file */
  status: GitStatus;
}
