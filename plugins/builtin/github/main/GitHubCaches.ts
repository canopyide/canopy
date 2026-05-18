import { Cache } from "../../../../electron/utils/cache.js";
import { GitHubFirstPageCache } from "../../../../electron/services/GitHubFirstPageCache.js";
import { GitHubStatsCache } from "../../../../electron/services/GitHubStatsCache.js";
import type {
  GitHubIssue,
  GitHubPR,
  GitHubPRCIStatus,
  GitHubPRCISummary,
  GitHubListResponse,
  IssueTooltipData,
  PRTooltipData,
} from "../../../../shared/types/github.js";
import type { RepoContext, RepoStats } from "./types.js";

export const repoContextCache = new Cache<string, RepoContext>({ defaultTTL: 300000 });
export const repoStatsCache = new Cache<string, RepoStats>({ defaultTTL: 60000 });
export const issueListCache = new Cache<string, GitHubListResponse<GitHubIssue>>({
  defaultTTL: 60000,
});
export const prListCache = new Cache<string, GitHubListResponse<GitHubPR>>({ defaultTTL: 60000 });
export const projectHealthCache = new Cache<string, unknown>({ defaultTTL: 60000 });
export const issueTooltipCache = new Cache<string, IssueTooltipData>({ defaultTTL: 300000 });

export const prTooltipWrittenAt = new Map<string, number>();
export const prTooltipCache = new Cache<string, PRTooltipData>({
  defaultTTL: 300000,
  onEvict: (key) => {
    prTooltipWrittenAt.delete(key as string);
  },
});

const ETAG_CACHE_MAX_SIZE = 500;
const ETAG_CACHE_TTL = 3_600_000; // 1 hour

export const prETagCache = new Cache<string, string>({
  maxSize: ETAG_CACHE_MAX_SIZE,
  defaultTTL: ETAG_CACHE_TTL,
});
export const branchListETagCache = new Cache<string, string>({
  maxSize: ETAG_CACHE_MAX_SIZE,
  defaultTTL: ETAG_CACHE_TTL,
});

let etagCacheVersion = 0;

export function getETagCacheVersion(): number {
  return etagCacheVersion;
}

export interface PRRequiredStatusEntry {
  ciStatus: GitHubPRCIStatus | undefined;
  ciSummary: GitHubPRCISummary | undefined;
}
export const reviewThreadsCache = new Cache<string, Record<string, number>>({
  defaultTTL: 300000,
});

export const prRequiredStatusCache = new Cache<string, PRRequiredStatusEntry>({
  defaultTTL: 60000,
});

export function clearGitHubCaches(): void {
  etagCacheVersion++;
  repoContextCache.clear();
  repoStatsCache.clear();
  projectHealthCache.clear();
  issueListCache.clear();
  prListCache.clear();
  issueTooltipCache.clear();
  prTooltipCache.clear();
  prTooltipWrittenAt.clear();
  prETagCache.clear();
  branchListETagCache.clear();
  reviewThreadsCache.clear();
  prRequiredStatusCache.clear();
  GitHubFirstPageCache.getInstance().clear();
  GitHubStatsCache.getInstance().clear();
}

export function truncateBody(body: string | null | undefined, maxLength = 150): string {
  if (!body) return "";
  const cleaned = body.replace(/\r?\n/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim() + "…";
}

export function clearPRCaches(): void {
  etagCacheVersion++;
  prListCache.clear();
  prTooltipCache.clear();
  prTooltipWrittenAt.clear();
  prETagCache.clear();
  branchListETagCache.clear();
  reviewThreadsCache.clear();
  prRequiredStatusCache.clear();
}
