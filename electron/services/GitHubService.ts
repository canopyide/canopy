/**
 * GitHub Service for Canopy Electron App
 *
 * Provides direct GitHub API integration using @octokit/graphql,
 * eliminating the need for the gh CLI dependency.
 *
 * Key features:
 * - Personal access token management (stored via electron-store)
 * - GraphQL API calls for repo stats, PR detection, etc.
 * - Token validation and scope checking
 * - Caching to minimize API calls and avoid rate limits
 */

import { graphql, type GraphQlQueryResponseData } from "@octokit/graphql";
import { simpleGit } from "simple-git";
import { store } from "../store.js";
import { Cache } from "../utils/cache.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GitHubTokenConfig {
  hasToken: boolean;
  scopes?: string[];
  username?: string;
}

export interface GitHubTokenValidation {
  valid: boolean;
  scopes: string[];
  username?: string;
  error?: string;
}

export interface RepoContext {
  owner: string;
  repo: string;
}

export interface RepoStats {
  issueCount: number;
  prCount: number;
}

export interface RepoStatsResult {
  stats: RepoStats | null;
  error?: string;
}

export interface LinkedPR {
  number: number;
  url: string;
  state: "open" | "merged" | "closed";
  isDraft: boolean;
}

export interface PRCheckResult {
  issueNumber?: number;
  branchName?: string;
  pr: LinkedPR | null;
}

export interface PRCheckCandidate {
  worktreeId: string;
  issueNumber?: number;
  branchName?: string;
}

export interface BatchPRCheckResult {
  results: Map<string, PRCheckResult>;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub Service
// ─────────────────────────────────────────────────────────────────────────────

// Cache instances
const repoContextCache = new Cache<string, RepoContext>({ defaultTTL: 300000 }); // 5 minutes
const repoStatsCache = new Cache<string, RepoStats>({ defaultTTL: 60000 }); // 1 minute
const prCheckCache = new Cache<string, PRCheckResult>({ defaultTTL: 60000 }); // 1 minute

/**
 * Get the GitHub token from storage.
 */
export function getGitHubToken(): string | undefined {
  return store.get("userConfig.githubToken");
}

/**
 * Check if a GitHub token is configured.
 */
export function hasGitHubToken(): boolean {
  return !!getGitHubToken();
}

/**
 * Save a GitHub token to storage.
 */
export function setGitHubToken(token: string): void {
  store.set("userConfig.githubToken", token);
  // Clear caches when token changes
  repoContextCache.clear();
  repoStatsCache.clear();
  prCheckCache.clear();
}

/**
 * Clear the GitHub token from storage.
 */
export function clearGitHubToken(): void {
  store.set("userConfig.githubToken", undefined);
  // Clear caches when token is removed
  repoContextCache.clear();
  repoStatsCache.clear();
  prCheckCache.clear();
}

/**
 * Get the GitHub token configuration status.
 */
export function getGitHubConfig(): GitHubTokenConfig {
  const token = getGitHubToken();
  return {
    hasToken: !!token,
  };
}

/**
 * Create an authenticated GraphQL client.
 * Returns null if no token is configured.
 */
function createGraphQLClient(): typeof graphql | null {
  const token = getGitHubToken();
  if (!token) return null;

  return graphql.defaults({
    headers: {
      authorization: `token ${token}`,
    },
  });
}

/**
 * Validate a GitHub token by making a test API call.
 * Returns validation result with scopes and username.
 */
export async function validateGitHubToken(token: string): Promise<GitHubTokenValidation> {
  if (!token || token.trim() === "") {
    return { valid: false, scopes: [], error: "Token is empty" };
  }

  // Basic format validation
  if (!token.startsWith("ghp_") && !token.startsWith("github_pat_") && !token.startsWith("gho_")) {
    // Allow classic tokens that don't have prefix (older tokens)
    // but warn if they look completely wrong
    if (token.length < 40) {
      return { valid: false, scopes: [], error: "Invalid token format" };
    }
  }

  try {
    // Use REST API to validate and get scopes
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { valid: false, scopes: [], error: "Invalid or expired token" };
      }
      if (response.status === 403) {
        return { valid: false, scopes: [], error: "Token lacks required permissions" };
      }
      return { valid: false, scopes: [], error: `GitHub API error: ${response.statusText}` };
    }

    const userData = (await response.json()) as { login?: string };
    const scopesHeader = response.headers.get("x-oauth-scopes");
    const scopes = scopesHeader ? scopesHeader.split(",").map((s) => s.trim()) : [];

    return {
      valid: true,
      scopes,
      username: userData.login,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOTFOUND") || message.includes("ETIMEDOUT")) {
      return {
        valid: false,
        scopes: [],
        error: "Cannot reach GitHub. Check your internet connection.",
      };
    }
    return { valid: false, scopes: [], error: message };
  }
}

/**
 * Extract owner/repo from git remote URL.
 */
export async function getRepoContext(cwd: string): Promise<RepoContext | null> {
  // Check cache first
  const cached = repoContextCache.get(cwd);
  if (cached) return cached;

  try {
    const git = simpleGit(cwd);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === "origin");

    if (!origin?.refs?.fetch) return null;

    // Parse GitHub URL (https or ssh format)
    const fetchUrl = origin.refs.fetch;
    const match = fetchUrl.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/);

    if (!match) return null;

    const context = { owner: match[1], repo: match[2] };
    repoContextCache.set(cwd, context);
    return context;
  } catch {
    return null;
  }
}

/**
 * Get issue and PR counts using a single GraphQL API call.
 */
export async function getRepoStats(cwd: string): Promise<RepoStatsResult> {
  const client = createGraphQLClient();
  if (!client) {
    return { stats: null, error: "GitHub token not configured" };
  }

  const context = await getRepoContext(cwd);
  if (!context) {
    return { stats: null, error: "Not a GitHub repository" };
  }

  // Check cache
  const cacheKey = `${context.owner}/${context.repo}`;
  const cached = repoStatsCache.get(cacheKey);
  if (cached) {
    return { stats: cached };
  }

  const query = `
    query GetRepoStats($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(states: OPEN) { totalCount }
        pullRequests(states: OPEN) { totalCount }
      }
    }
  `;

  try {
    const result = (await client(query, {
      owner: context.owner,
      repo: context.repo,
    })) as GraphQlQueryResponseData;

    const repository = result?.repository;
    if (!repository) {
      return { stats: null, error: "Repository not found" };
    }

    const stats: RepoStats = {
      issueCount: repository.issues?.totalCount ?? 0,
      prCount: repository.pullRequests?.totalCount ?? 0,
    };

    repoStatsCache.set(cacheKey, stats);
    return { stats };
  } catch (error) {
    return { stats: null, error: parseGitHubError(error) };
  }
}

/**
 * Get repository owner and name from a working directory.
 * Returns cached result to avoid repeated git operations.
 */
export async function getRepoInfo(cwd: string): Promise<RepoContext | null> {
  return getRepoContext(cwd);
}

/**
 * Build a batched GraphQL query to check multiple issues for linked PRs.
 */
function buildBatchPRQuery(owner: string, repo: string, candidates: PRCheckCandidate[]): string {
  const issueQueries: string[] = [];
  const branchQueries: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
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
    if (candidate.branchName) {
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
  data: Record<string, unknown>,
  candidates: PRCheckCandidate[]
): Map<string, PRCheckResult> {
  const results = new Map<string, PRCheckResult>();

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const alias = `wt_${i}`;
    let foundPR: LinkedPR | null = null;

    // Check issue timeline results first
    const issueData = (
      data?.[`${alias}_issue`] as { issue?: { timelineItems?: { nodes?: unknown[] } } }
    )?.issue?.timelineItems?.nodes;
    if (issueData && Array.isArray(issueData)) {
      const prs: LinkedPR[] = [];
      for (const node of issueData as Array<{
        source?: {
          number?: number;
          url?: string;
          state?: string;
          isDraft?: boolean;
          merged?: boolean;
        };
      }>) {
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

      // Pick best PR: prefer open, then merged, then closed
      const openPRs = prs.filter((pr) => pr.state === "open");
      const mergedPRs = prs.filter((pr) => pr.state === "merged");
      const closedPRs = prs.filter((pr) => pr.state === "closed");

      if (openPRs.length > 0) {
        foundPR = openPRs[openPRs.length - 1];
      } else if (mergedPRs.length > 0) {
        foundPR = mergedPRs[mergedPRs.length - 1];
      } else if (closedPRs.length > 0) {
        foundPR = closedPRs[closedPRs.length - 1];
      }
    }

    // If no PR found via issue, check branch-based lookup
    if (!foundPR) {
      const branchData = (data?.[`${alias}_branch`] as { pullRequests?: { nodes?: unknown[] } })
        ?.pullRequests?.nodes;
      if (branchData && Array.isArray(branchData) && branchData.length > 0) {
        const pr = branchData[0] as {
          number?: number;
          url?: string;
          state?: string;
          isDraft?: boolean;
          merged?: boolean;
        };
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
 */
export async function batchCheckLinkedPRs(
  cwd: string,
  candidates: PRCheckCandidate[]
): Promise<BatchPRCheckResult> {
  if (candidates.length === 0) {
    return { results: new Map() };
  }

  const client = createGraphQLClient();
  if (!client) {
    return { results: new Map(), error: "GitHub token not configured" };
  }

  const context = await getRepoContext(cwd);
  if (!context) {
    return { results: new Map(), error: "Not a GitHub repository" };
  }

  try {
    const query = buildBatchPRQuery(context.owner, context.repo, candidates);
    const response = (await client(query)) as Record<string, unknown>;

    const results = parseBatchPRResponse(response, candidates);
    return { results };
  } catch (error) {
    return { results: new Map(), error: parseGitHubError(error) };
  }
}

/**
 * Get the URL for a GitHub repository.
 */
export async function getRepoUrl(cwd: string): Promise<string | null> {
  const context = await getRepoContext(cwd);
  if (!context) return null;
  return `https://github.com/${context.owner}/${context.repo}`;
}

/**
 * Get the URL for a specific issue.
 */
export async function getIssueUrl(cwd: string, issueNumber: number): Promise<string | null> {
  const repoUrl = await getRepoUrl(cwd);
  if (!repoUrl) return null;
  return `${repoUrl}/issues/${issueNumber}`;
}

/**
 * Parse GitHub API errors into user-friendly messages.
 */
function parseGitHubError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("rate limit") || message.includes("API rate limit")) {
    return "GitHub rate limit exceeded. Try again in a few minutes.";
  }

  if (message.includes("401") || message.includes("Bad credentials")) {
    return "Invalid GitHub token. Please update in Settings.";
  }

  if (message.includes("403")) {
    return "Token lacks required permissions. Required scopes: repo, read:org";
  }

  if (message.includes("404") || message.includes("Could not resolve")) {
    return "Repository not found or token lacks access.";
  }

  if (message.includes("ENOTFOUND") || message.includes("ETIMEDOUT")) {
    return "Cannot reach GitHub. Check your internet connection.";
  }

  return "GitHub API unavailable";
}

/**
 * Clear all caches. Useful when token changes or on logout.
 */
export function clearGitHubCaches(): void {
  repoContextCache.clear();
  repoStatsCache.clear();
  prCheckCache.clear();
}
