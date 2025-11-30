import { simpleGit, SimpleGit, BranchSummary } from "simple-git";
import { resolve, dirname } from "path";
import { existsSync } from "fs";
import { logDebug, logError } from "../utils/logger.js";

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
}
