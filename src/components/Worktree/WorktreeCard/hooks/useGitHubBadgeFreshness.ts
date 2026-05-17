import { useSyncExternalStore } from "react";
import type { FreshnessLevel } from "@/hooks/useRepositoryStats";
import { getCache, buildCacheKey } from "@/lib/githubResourceCache";
import { useGlobalMinuteTicker } from "@/hooks/useGlobalMinuteTicker";
import { useProjectStore } from "@/store/projectStore";
import { useGitHubRateLimitStore } from "@/store/githubRateLimitStore";

const DEFAULT_FILTER_STATE = "open";
const DEFAULT_SORT_ORDER = "created";

const noopSubscribe = () => () => {};

interface UseGitHubBadgeFreshnessResult {
  freshnessLevel: FreshnessLevel;
  cacheLastUpdatedAt: number | null;
  now: number;
}

export function useGitHubBadgeFreshness(
  type: "pr" | "issue",
  rowLastUpdatedAt?: number
): UseGitHubBadgeFreshnessResult {
  const projectPath = useProjectStore((s) => s.currentProject?.path);
  const tick = useGlobalMinuteTicker();
  const rateLimitBlocked = useGitHubRateLimitStore((s) => s.blocked);

  const cacheKey = projectPath
    ? buildCacheKey(projectPath, type, DEFAULT_FILTER_STATE, DEFAULT_SORT_ORDER)
    : null;

  const cacheEntry = useSyncExternalStore(noopSubscribe, () =>
    cacheKey ? getCache(cacheKey) : undefined
  );

  const cacheLastUpdatedAt = cacheEntry?.timestamp ?? null;
  const now = tick > 0 ? Date.now() : Date.now();

  // While GitHub-wide rate-limit pause is active, badge data may be older
  // than its timestamp suggests — polling is suspended, so a `fresh` badge
  // would be misleading. Treat as `aging` until the block clears.
  const freshnessLevel: FreshnessLevel = rateLimitBlocked
    ? "aging"
    : rowLastUpdatedAt == null || cacheLastUpdatedAt == null
      ? "fresh"
      : cacheLastUpdatedAt > rowLastUpdatedAt
        ? "aging"
        : "fresh";

  return { freshnessLevel, cacheLastUpdatedAt, now };
}
