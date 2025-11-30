/**
 * GitHub CLI utilities for Canopy Electron.
 * Provides GraphQL-based PR detection and repository operations.
 *
 * Migrated from Canopy CLI with Electron-specific patterns.
 */

import { execa } from "execa";

// ─────────────────────────────────────────────────────────────────────────────
// Repository Statistics
// ─────────────────────────────────────────────────────────────────────────────

export interface RepoStats {
  issueCount: number;
  prCount: number;
}

export interface RepoStatsResult {
  stats: RepoStats | null;
  error?: string;
}

/**
 * Get issue and PR counts using a single GraphQL API call.
 * Much more efficient than fetching full lists - uses only 1 API call instead of 2.
 * Handles auth errors gracefully without needing a separate auth check.
 * @param cwd - Working directory
 * @returns Issue and PR counts with optional error message
 */
export async function getRepoStats(cwd: string): Promise<RepoStatsResult> {
  try {
    // GraphQL query to get both counts in a single API call
    const query = `
      query {
        repository(owner: "{owner}", name: "{repo}") {
          issues(states: OPEN) { totalCount }
          pullRequests(states: OPEN) { totalCount }
        }
      }
    `;

    // First get the owner/repo from the current directory
    const { stdout: repoInfo } = await execa(
      "gh",
      ["repo", "view", "--json", "owner,name", "-q", '.owner.login + "/" + .name'],
      { cwd }
    );
    const [owner, repo] = repoInfo.trim().split("/");

    if (!owner || !repo) {
      return { stats: null, error: "not a GitHub repository" };
    }

    // Execute the GraphQL query
    const { stdout } = await execa(
      "gh",
      ["api", "graphql", "-f", `query=${query.replace("{owner}", owner).replace("{repo}", repo)}`],
      { cwd }
    );

    const data = JSON.parse(stdout);
    const repository = data?.data?.repository;

    if (!repository) {
      return { stats: null, error: "repository not found" };
    }

    return {
      stats: {
        issueCount: repository.issues?.totalCount ?? 0,
        prCount: repository.pullRequests?.totalCount ?? 0,
      },
    };
  } catch (error: any) {
    // Check if gh CLI is not installed
    if (error.code === "ENOENT") {
      return { stats: null, error: "gh CLI not installed" };
    }

    // Parse stderr for common errors
    const stderr = error.stderr || error.message || "";

    if (stderr.includes("auth") || stderr.includes("login") || stderr.includes("token")) {
      return { stats: null, error: "gh auth required - run: gh auth login" };
    }
    if (stderr.includes("Could not resolve to a Repository")) {
      return { stats: null, error: "not a GitHub repository" };
    }
    if (stderr.includes("rate limit")) {
      return { stats: null, error: "GitHub rate limit exceeded" };
    }

    // Generic failure
    return { stats: null, error: "GitHub API unavailable" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// URL Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Opens the GitHub repository in the default browser.
 * @param cwd - Working directory
 * @param page - Optional page to navigate to ('issues' or 'pulls')
 */
export async function openGitHubUrl(cwd: string, page?: "issues" | "pulls"): Promise<void> {
  try {
    // gh CLI doesn't support appending paths directly, so we need to get the URL and open it
    if (page) {
      // Get the repo URL first
      const { stdout } = await execa("gh", ["repo", "view", "--json", "url", "-q", ".url"], {
        cwd,
      });
      const repoUrl = stdout.trim();
      const targetUrl = `${repoUrl}/${page}`;

      // Open the URL directly using Electron's shell
      const { shell } = await import("electron");
      await shell.openExternal(targetUrl);
    } else {
      // Just open the repo homepage via gh CLI
      await execa("gh", ["repo", "view", "--web"], { cwd, stdio: "ignore" });
    }
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new Error("GitHub CLI (gh) not found. Please install it.");
    }
    throw new Error(
      error.message || "Failed to open GitHub. Are you logged in via `gh auth login`?"
    );
  }
}

/**
 * Opens the current repository in the default browser using the GitHub CLI.
 * @param cwd - The current working directory (root of the worktree)
 */
export async function openGitHubRepo(cwd: string): Promise<void> {
  return openGitHubUrl(cwd);
}

/**
 * Gets the GitHub issue URL for a specific issue number.
 * @param cwd - Working directory (to get repo info)
 * @param issueNumber - Issue number to get URL for
 * @returns The full GitHub issue URL
 */
export async function getIssueUrl(cwd: string, issueNumber: number): Promise<string> {
  const { stdout } = await execa("gh", ["repo", "view", "--json", "url", "-q", ".url"], { cwd });
  const repoUrl = stdout.trim();
  return `${repoUrl}/issues/${issueNumber}`;
}

/**
 * Opens a specific GitHub issue in the default browser.
 * @param cwd - Working directory (to get repo info)
 * @param issueNumber - Issue number to open
 */
export async function openGitHubIssue(cwd: string, issueNumber: number): Promise<void> {
  try {
    const issueUrl = await getIssueUrl(cwd, issueNumber);
    const { shell } = await import("electron");
    await shell.openExternal(issueUrl);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new Error("GitHub CLI (gh) not found. Please install it.");
    }
    throw new Error(error.message || "Failed to open GitHub issue.");
  }
}

/**
 * Opens a specific GitHub pull request in the default browser.
 * @param prUrl - Full URL of the pull request
 */
export async function openGitHubPR(prUrl: string): Promise<void> {
  try {
    const { shell } = await import("electron");
    await shell.openExternal(prUrl);
  } catch (error: any) {
    throw new Error(error.message || "Failed to open GitHub pull request.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PR Detection via GraphQL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Represents a detected pull request linked to an issue or branch.
 */
export interface LinkedPR {
  number: number;
  url: string;
  state: "open" | "merged" | "closed";
  isDraft: boolean;
}

/**
 * Result of checking for linked PRs for a single issue/branch.
 */
export interface PRCheckResult {
  issueNumber?: number;
  branchName?: string;
  pr: LinkedPR | null;
}

/**
 * Result of batch PR detection.
 */
export interface BatchPRCheckResult {
  results: Map<string, PRCheckResult>; // keyed by worktree ID
  error?: string;
}

/**
 * Input for batch PR check - worktree candidates.
 */
export interface PRCheckCandidate {
  worktreeId: string;
  issueNumber?: number;
  branchName?: string;
}

/**
 * Get repository owner and name from a working directory.
 * Caches result to avoid repeated CLI calls.
 */
let repoInfoCache: { cwd: string; owner: string; repo: string } | null = null;

export async function getRepoInfo(cwd: string): Promise<{ owner: string; repo: string } | null> {
  // Return cached result if same cwd
  if (repoInfoCache && repoInfoCache.cwd === cwd) {
    return { owner: repoInfoCache.owner, repo: repoInfoCache.repo };
  }

  try {
    const { stdout: repoInfo } = await execa(
      "gh",
      ["repo", "view", "--json", "owner,name", "-q", '.owner.login + "/" + .name'],
      { cwd }
    );
    const [owner, repo] = repoInfo.trim().split("/");

    if (!owner || !repo) {
      return null;
    }

    repoInfoCache = { cwd, owner, repo };
    return { owner, repo };
  } catch {
    return null;
  }
}

/**
 * Build a batched GraphQL query to check multiple issues for linked PRs.
 * Uses aliases to batch multiple issue checks into one API call.
 *
 * The query checks:
 * 1. Issue timeline for CrossReferencedEvent where source is a PullRequest
 * 2. PRs with matching headRefName (fallback for unlinked PRs)
 */
function buildBatchPRQuery(owner: string, repo: string, candidates: PRCheckCandidate[]): string {
  const issueQueries: string[] = [];
  const branchQueries: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    // Use index-based alias to avoid collisions (e.g., "a-1" vs "a_1" both becoming "wt_a_1")
    const alias = `wt_${i}`;

    // Query by issue number (check timeline for cross-references)
    if (candidate.issueNumber) {
      issueQueries.push(`
        ${alias}_issue: repository(owner: "${owner}", name: "${repo}") {
          issue(number: ${candidate.issueNumber}) {
            timelineItems(itemTypes: [CROSS_REFERENCED_EVENT], last: 10) {
              nodes {
                ... on CrossReferencedEvent {
                  source {
                    ... on PullRequest {
                      number
                      url
                      state
                      isDraft
                      merged
                    }
                  }
                }
              }
            }
          }
        }
      `);
    }

    // Also query by branch name (fallback for PRs not linked via "Closes #X")
    // Include CLOSED state to detect all PRs on the branch
    if (candidate.branchName) {
      // Escape branch name for GraphQL by using JSON.stringify
      const escapedBranch = JSON.stringify(candidate.branchName).slice(1, -1);
      branchQueries.push(`
        ${alias}_branch: repository(owner: "${owner}", name: "${repo}") {
          pullRequests(first: 1, states: [OPEN, MERGED, CLOSED], headRefName: "${escapedBranch}", orderBy: {field: UPDATED_AT, direction: DESC}) {
            nodes {
              number
              url
              state
              isDraft
              merged
            }
          }
        }
      `);
    }
  }

  return `query { ${issueQueries.join("\n")} ${branchQueries.join("\n")} }`;
}

/**
 * Parse GraphQL response to extract PR information per worktree.
 */
function parseBatchPRResponse(
  data: any,
  candidates: PRCheckCandidate[]
): Map<string, PRCheckResult> {
  const results = new Map<string, PRCheckResult>();

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const alias = `wt_${i}`;
    let foundPR: LinkedPR | null = null;

    // Check issue timeline results first (more reliable linkage)
    const issueData = data?.[`${alias}_issue`]?.issue?.timelineItems?.nodes;
    if (issueData && Array.isArray(issueData)) {
      // Filter for valid PR sources, prefer OPEN > MERGED > CLOSED
      const prs: LinkedPR[] = [];
      for (const node of issueData) {
        const source = node?.source;
        if (source?.number && source?.url) {
          prs.push({
            number: source.number,
            url: source.url,
            state: source.merged
              ? "merged"
              : (source.state?.toLowerCase() as "open" | "closed") || "open",
            isDraft: source.isDraft ?? false,
          });
        }
      }

      // Pick best PR: prefer open, then merged, then closed (most recent within each category)
      const openPRs = prs.filter((pr) => pr.state === "open");
      const mergedPRs = prs.filter((pr) => pr.state === "merged");
      const closedPRs = prs.filter((pr) => pr.state === "closed");

      if (openPRs.length > 0) {
        foundPR = openPRs[openPRs.length - 1]; // Latest open
      } else if (mergedPRs.length > 0) {
        foundPR = mergedPRs[mergedPRs.length - 1]; // Latest merged
      } else if (closedPRs.length > 0) {
        foundPR = closedPRs[closedPRs.length - 1]; // Latest closed
      }
    }

    // If no PR found via issue, check branch-based lookup
    if (!foundPR) {
      const branchData = data?.[`${alias}_branch`]?.pullRequests?.nodes;
      if (branchData && Array.isArray(branchData) && branchData.length > 0) {
        const pr = branchData[0];
        if (pr?.number && pr?.url) {
          foundPR = {
            number: pr.number,
            url: pr.url,
            state: pr.merged ? "merged" : (pr.state?.toLowerCase() as "open" | "closed") || "open",
            isDraft: pr.isDraft ?? false,
          };
        }
      }
    }

    results.set(candidate.worktreeId, {
      issueNumber: candidate.issueNumber,
      branchName: candidate.branchName,
      pr: foundPR,
    });
  }

  return results;
}

/**
 * Batch check for PRs linked to multiple worktrees.
 * Executes a single GraphQL query that checks all candidates.
 *
 * @param cwd - Working directory (to determine repo context)
 * @param candidates - Worktrees to check for linked PRs
 * @returns Map of worktree ID to PR check result
 */
export async function batchCheckLinkedPRs(
  cwd: string,
  candidates: PRCheckCandidate[]
): Promise<BatchPRCheckResult> {
  if (candidates.length === 0) {
    return { results: new Map() };
  }

  try {
    // Get repo info
    const repoInfo = await getRepoInfo(cwd);
    if (!repoInfo) {
      return { results: new Map(), error: "not a GitHub repository" };
    }

    // Build and execute the batched query
    const query = buildBatchPRQuery(repoInfo.owner, repoInfo.repo, candidates);

    const { stdout } = await execa("gh", ["api", "graphql", "-f", `query=${query}`], { cwd });

    const response = JSON.parse(stdout);

    // Check for GraphQL errors
    if (response.errors && response.errors.length > 0) {
      const errorMsg = response.errors[0]?.message || "GraphQL query failed";
      return { results: new Map(), error: errorMsg };
    }

    // Parse results
    const results = parseBatchPRResponse(response.data, candidates);
    return { results };
  } catch (error: any) {
    // Handle common errors
    if (error.code === "ENOENT") {
      return { results: new Map(), error: "gh CLI not installed" };
    }

    const stderr = error.stderr || error.message || "";

    if (stderr.includes("auth") || stderr.includes("login") || stderr.includes("token")) {
      return { results: new Map(), error: "gh auth required" };
    }
    if (stderr.includes("rate limit")) {
      return { results: new Map(), error: "rate limit exceeded" };
    }

    return { results: new Map(), error: "GitHub API unavailable" };
  }
}
