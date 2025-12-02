import { simpleGit, SimpleGit, BranchSummary } from "simple-git";
import { resolve, dirname, normalize, sep, isAbsolute } from "path";
import { existsSync } from "fs";
import { readFile, stat } from "fs/promises";
import { logDebug, logError, logWarn } from "../utils/logger.js";
import type { GitStatus, WorktreeChanges } from "../../shared/types/index.js";
import { WorktreeRemovedError, GitError } from "../utils/errorTypes.js";

export interface BranchInfo {
  name: string;
  current: boolean;
  commit: string;
  remote?: string;
}

export interface CreateWorktreeOptions {
  baseBranch: string;
  newBranch: string;
  path: string;
  fromRemote?: boolean;
}

/**
 * GitService encapsulates git operations for worktree management.
 * Uses simple-git for most operations and git.raw() for worktree commands.
 */
export class GitService {
  private git: SimpleGit;
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.git = simpleGit(rootPath);
  }

  /**
   * List all local and remote branches.
   * @returns Array of branch information
   */
  async listBranches(): Promise<BranchInfo[]> {
    try {
      logDebug("Listing branches", { rootPath: this.rootPath });

      // Get both local and remote branches
      const summary: BranchSummary = await this.git.branch(["-a"]);

      const branches: BranchInfo[] = [];

      // Process all branches (local + remote)
      for (const [branchName, branchDetail] of Object.entries(summary.branches)) {
        // Skip HEAD pointers (both "HEAD ->" and "remotes/origin/HEAD")
        if (branchName.includes("HEAD ->") || branchName.endsWith("/HEAD")) {
          continue;
        }

        // Determine if this is a remote branch
        const isRemote = branchName.startsWith("remotes/");
        const displayName = isRemote ? branchName.replace("remotes/", "") : branchName;

        branches.push({
          name: displayName,
          current: branchDetail.current,
          commit: branchDetail.commit,
          remote: isRemote ? displayName.split("/")[0] : undefined,
        });
      }

      logDebug("Listed branches", { count: branches.length });
      return branches;
    } catch (error) {
      logError("Failed to list branches", { error: (error as Error).message });
      throw new Error(`Failed to list branches: ${(error as Error).message}`);
    }
  }

  /**
   * Suggest a default worktree path based on branch name.
   * Pattern: <repo-root>/../<repo-name>-worktrees/<branch-name>
   */
  suggestWorktreePath(branchName: string): string {
    const repoName = this.rootPath.split("/").pop() || "repo";
    const sanitizedBranch = branchName.replace(/[^a-zA-Z0-9-_]/g, "-");
    const worktreesDir = resolve(this.rootPath, "..", `${repoName}-worktrees`);
    return resolve(worktreesDir, sanitizedBranch);
  }

  /**
   * Validate that a path doesn't already exist.
   * @returns true if path is valid (doesn't exist), false otherwise
   */
  validatePath(path: string): { valid: boolean; error?: string } {
    if (existsSync(path)) {
      return {
        valid: false,
        error: `Path already exists: ${path}`,
      };
    }
    return { valid: true };
  }

  /**
   * Check if a branch exists (local or remote).
   */
  async branchExists(branchName: string): Promise<boolean> {
    try {
      const branches = await this.listBranches();
      return branches.some((b) => b.name === branchName || b.name === `origin/${branchName}`);
    } catch (error) {
      logError("Failed to check branch existence", {
        branchName,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Create a new worktree.
   * Uses git.raw() since simple-git doesn't have a worktree wrapper.
   *
   * @param options - Worktree creation options
   * @throws Error if worktree creation fails
   */
  async createWorktree(options: CreateWorktreeOptions): Promise<void> {
    const { baseBranch, newBranch, path, fromRemote = false } = options;

    logDebug("Creating worktree", {
      baseBranch: options.baseBranch,
      newBranch: options.newBranch,
      path: options.path,
      fromRemote: options.fromRemote,
    });

    // Validate path doesn't exist
    const pathValidation = this.validatePath(path);
    if (!pathValidation.valid) {
      throw new Error(pathValidation.error);
    }

    // Ensure parent directory exists
    const parentDir = dirname(path);
    if (!existsSync(parentDir)) {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }

    try {
      if (fromRemote) {
        // Create worktree from remote branch with local tracking branch
        // git worktree add -b <new-branch> --track <path> <remote>/<branch>
        logDebug("Creating worktree from remote branch", {
          path,
          newBranch,
          remoteBranch: baseBranch,
        });

        await this.git.raw(["worktree", "add", "-b", newBranch, "--track", path, baseBranch]);
      } else {
        // Create worktree with new branch
        // git worktree add -b <new-branch> <path> <base-branch>
        logDebug("Creating worktree with new branch", {
          path,
          newBranch,
          baseBranch,
        });

        await this.git.raw(["worktree", "add", "-b", newBranch, path, baseBranch]);
      }

      logDebug("Worktree created successfully", { path, newBranch });
    } catch (error) {
      logError("Failed to create worktree", {
        options,
        error: (error as Error).message,
      });
      throw new Error(`Failed to create worktree: ${(error as Error).message}`);
    }
  }

  /**
   * List all worktrees.
   * Uses git worktree list --porcelain for structured output.
   * The first worktree in the output is always the main worktree (repository root).
   */
  async listWorktrees(): Promise<
    Array<{ path: string; branch: string; bare: boolean; isMainWorktree: boolean }>
  > {
    try {
      const output = await this.git.raw(["worktree", "list", "--porcelain"]);
      const worktrees: Array<{
        path: string;
        branch: string;
        bare: boolean;
        isMainWorktree: boolean;
      }> = [];

      let currentWorktree: Partial<{ path: string; branch: string; bare: boolean }> = {};

      // Helper to push worktree
      const pushWorktree = () => {
        if (currentWorktree.path) {
          worktrees.push({
            path: currentWorktree.path,
            branch: currentWorktree.branch || "",
            bare: currentWorktree.bare || false,
            // The first worktree found is always the main worktree
            isMainWorktree: worktrees.length === 0,
          });
        }
        currentWorktree = {};
      };

      for (const line of output.split("\n")) {
        if (line.startsWith("worktree ")) {
          currentWorktree.path = line.replace("worktree ", "").trim();
        } else if (line.startsWith("branch ")) {
          currentWorktree.branch = line.replace("branch ", "").replace("refs/heads/", "").trim();
        } else if (line.startsWith("bare")) {
          currentWorktree.bare = true;
        } else if (line === "") {
          // Empty line marks end of worktree entry
          pushWorktree();
        }
      }

      // Handle last entry if file doesn't end with empty line
      pushWorktree();

      return worktrees;
    } catch (error) {
      logError("Failed to list worktrees", { error: (error as Error).message });
      throw new Error(`Failed to list worktrees: ${(error as Error).message}`);
    }
  }

  /**
   * Get a unified diff for a specific file.
   *
   * @param filePath - Path to the file (relative to worktree root)
   * @param status - Git status of the file
   * @returns The unified diff string, or special markers for binary/large files
   */
  async getFileDiff(filePath: string, status: GitStatus): Promise<string> {
    // Validate input status
    const validStatuses: GitStatus[] = [
      "added",
      "modified",
      "deleted",
      "untracked",
      "ignored",
      "renamed",
      "copied",
    ];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid git status: ${status}`);
    }

    // Security: Prevent path traversal attacks
    // 1. Reject absolute paths
    if (isAbsolute(filePath)) {
      throw new Error("Absolute paths are not allowed");
    }

    // 2. Normalize and check for parent directory references
    const normalizedPath = normalize(filePath);
    if (normalizedPath.includes("..") || normalizedPath.startsWith(sep)) {
      throw new Error("Path traversal detected");
    }

    // 3. Resolve and verify the path stays within rootPath
    const absolutePath = resolve(this.rootPath, normalizedPath);
    const normalizedRoot = normalize(this.rootPath + sep);
    if (!absolutePath.startsWith(normalizedRoot)) {
      throw new Error("Path is outside worktree root");
    }

    // Handle file size limits (1MB max for existing files)
    try {
      const stats = await stat(absolutePath);
      if (stats.size > 1024 * 1024) {
        return "FILE_TOO_LARGE";
      }
    } catch {
      // File might be deleted, will check diff size below
    }

    // Handle Untracked/Added files - these aren't in the index yet
    if (status === "untracked" || status === "added") {
      try {
        // Read as Buffer first to check for binary content
        const buffer = await readFile(absolutePath);

        // Check for binary content before converting to string
        if (this.isBinaryBuffer(buffer)) {
          return "BINARY_FILE";
        }

        const content = buffer.toString("utf-8");
        const lines = content.split("\n");

        // Construct unified diff format for new files
        return `diff --git a/${normalizedPath} b/${normalizedPath}
new file mode 100644
--- /dev/null
+++ b/${normalizedPath}
@@ -0,0 +1,${lines.length} @@
${lines.map((l) => "+" + l).join("\n")}`;
      } catch (error) {
        logError("Failed to read new file for diff", {
          filePath: normalizedPath,
          error: (error as Error).message,
        });
        throw new Error(`Failed to read new file: ${(error as Error).message}`);
      }
    }

    // Handle Modified/Deleted files using git diff
    try {
      const diff = await this.git.diff(["HEAD", "--no-color", "--", normalizedPath]);

      // Check for binary files
      if (diff.includes("Binary files")) {
        return "BINARY_FILE";
      }

      // If no diff returned, the file might be unchanged
      if (!diff.trim()) {
        return "NO_CHANGES";
      }

      // Check diff size to prevent memory issues with large deleted files
      if (diff.length > 1024 * 1024) {
        return "FILE_TOO_LARGE";
      }

      return diff;
    } catch (error) {
      logError("Failed to generate diff", {
        filePath,
        error: (error as Error).message,
      });
      throw new Error(`Failed to generate diff: ${(error as Error).message}`);
    }
  }

  /**
   * Check if a buffer contains binary content
   * More accurate than string-based detection
   */
  private isBinaryBuffer(buffer: Buffer): boolean {
    // Check up to first 8KB for null bytes (standard binary detection)
    const checkLength = Math.min(buffer.length, 8192);

    for (let i = 0; i < checkLength; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }

    // Check for high ratio of non-printable characters
    let nonPrintable = 0;
    for (let i = 0; i < checkLength; i++) {
      const byte = buffer[i];
      // Printable ASCII range (0x20-0x7E) + common whitespace (tab, newline, carriage return)
      if (!(byte >= 0x20 && byte <= 0x7e) && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
        nonPrintable++;
      }
    }

    // More than 30% non-printable characters indicates binary
    return checkLength > 0 && nonPrintable / checkLength > 0.3;
  }

  /**
   * Get remote URL for a repository (typically origin)
   * @param repoPath - Path to repository
   * @returns Remote URL or null if no remote exists
   */
  async getRemoteUrl(repoPath: string): Promise<string | null> {
    return this.handleGitOperation(async () => {
      const git = simpleGit(repoPath);
      const remotes = await git.getRemotes(true);
      const origin = remotes.find((r) => r.name === "origin");
      return origin?.refs?.fetch || null;
    }, "getRemoteUrl");
  }

  /**
   * Get upstream URL (origin) for a repository
   * Alias for getRemoteUrl for backwards compatibility
   */
  async getUpstreamUrl(repoPath: string): Promise<string | null> {
    return this.getRemoteUrl(repoPath);
  }

  /**
   * Initialize a new git repository
   * @param path - Path where repository should be initialized
   */
  async initializeRepository(path: string): Promise<void> {
    return this.handleGitOperation(async () => {
      const git = simpleGit(path);
      await git.init();
    }, "initializeRepository");
  }

  /**
   * Get worktree changes with stats (moved from electron/utils/git.ts)
   * This method integrates the existing cache-based implementation
   * but delegates to the standalone function for now to preserve behavior.
   *
   * @param worktreePath - Path to the worktree
   * @param forceRefresh - Skip cache and fetch fresh data
   * @returns WorktreeChanges with file details and statistics
   */
  async getWorktreeChangesWithStats(
    worktreePath: string,
    forceRefresh = false
  ): Promise<WorktreeChanges> {
    // Import the standalone function to preserve existing cache behavior
    // This allows gradual migration without breaking existing functionality
    const { getWorktreeChangesWithStats: getChanges } = await import("../utils/git.js");
    return getChanges(worktreePath, forceRefresh);
  }

  /**
   * Get the last commit message from a repository or worktree
   * @param repoPath - Path to repository or worktree
   * @returns Last commit message or null if no commits exist
   */
  async getLastCommitMessage(repoPath: string): Promise<string | null> {
    return this.handleGitOperation(async () => {
      const git = simpleGit(repoPath);
      const log = await git.log({ maxCount: 1 });
      return log.latest?.message ?? null;
    }, "getLastCommitMessage");
  }

  /**
   * Get the repository root directory for a given path
   * @param repoPath - Path within a git repository
   * @returns Absolute path to repository root
   */
  async getRepositoryRoot(repoPath: string): Promise<string> {
    return this.handleGitOperation(async () => {
      const git = simpleGit(repoPath);
      const root = await git.revparse(["--show-toplevel"]);
      return root.trim();
    }, "getRepositoryRoot");
  }

  /**
   * Get git status for a repository or worktree
   * @param repoPath - Path to repository or worktree
   * @returns Status result from simple-git
   */
  async getStatus(repoPath: string) {
    return this.handleGitOperation(async () => {
      const git = simpleGit(repoPath);
      return await git.status();
    }, "getStatus");
  }

  /**
   * Get git log entries
   * @param repoPath - Path to repository or worktree
   * @param options - Log options (e.g., maxCount)
   * @returns Log result from simple-git
   */
  async getLog(repoPath: string, options?: { maxCount?: number }) {
    return this.handleGitOperation(async () => {
      const git = simpleGit(repoPath);
      return await git.log(options);
    }, "getLog");
  }

  /**
   * Get git diff output
   * @param repoPath - Path to repository or worktree
   * @param args - Diff arguments (e.g., ['--numstat', 'HEAD'])
   * @returns Diff output string
   */
  async getDiff(repoPath: string, args: string[]): Promise<string> {
    return this.handleGitOperation(async () => {
      const git = simpleGit(repoPath);
      return await git.diff(args);
    }, "getDiff");
  }

  /**
   * Centralized error handling wrapper for git operations
   * Provides consistent error handling, logging, and error type conversion
   *
   * @param operation - Async function to execute
   * @param context - Description of operation for logging
   * @returns Result of the operation
   */
  private async handleGitOperation<T>(operation: () => Promise<T>, context: string): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for worktree removed scenario
      if (
        errorMessage.includes("ENOENT") ||
        errorMessage.includes("no such file or directory") ||
        errorMessage.includes("Unable to read current working directory")
      ) {
        const wtError =
          error instanceof WorktreeRemovedError
            ? error
            : new WorktreeRemovedError(this.rootPath, error instanceof Error ? error : undefined);
        logWarn(`Git operation failed: worktree removed (${context})`, {
          rootPath: this.rootPath,
        });
        throw wtError;
      }

      // Wrap other errors in GitError for consistent handling
      const cause = error instanceof Error ? error : new Error(String(error));
      const gitError = new GitError(
        `Git operation failed: ${context}`,
        { rootPath: this.rootPath },
        cause
      );
      logError(`Git operation failed: ${context}`, gitError, { rootPath: this.rootPath });
      throw gitError;
    }
  }
}
