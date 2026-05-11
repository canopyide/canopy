import type { HydrateResult } from "../../shared/types/ipc/app.js";

/**
 * Main-process cache of pre-built `HydrateResult` payloads, populated by hover
 * prefetches from the project switcher palette and consumed by `handleAppHydrate`
 * when the new project view boots. Lives in its own module to avoid the
 * `ProjectStore` ↔ `AppHydrationService` import cycle that would form if either
 * side owned the cache directly.
 */

const PREFETCH_TTL_MS = 30_000;

interface CacheEntry {
  result: HydrateResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<HydrateResult | null>>();

/**
 * Bumped on every invalidation for a given project. The async prefetch path
 * snapshots the value before kicking off `buildSwitchHydrateResult` and only
 * commits the resulting payload if the version is unchanged afterwards — this
 * defeats the save-during-prefetch race without a full version counter on
 * every read.
 */
const invalidationVersions = new Map<string, number>();

function nextVersion(projectId: string): number {
  const v = (invalidationVersions.get(projectId) ?? 0) + 1;
  invalidationVersions.set(projectId, v);
  return v;
}

function currentVersion(projectId: string): number {
  return invalidationVersions.get(projectId) ?? 0;
}

/**
 * Run a prefetch for `projectId` if none is in flight, singleflighting concurrent
 * callers behind the same promise. The result is committed to the cache only if
 * no invalidation occurred during the build — stale prefetches are dropped silently.
 *
 * Errors are caught and swallowed so callers never need to handle them; the
 * eventual `handleAppHydrate` call simply falls through to the full read path.
 */
export function prefetchHydrateResult(
  projectId: string,
  build: (projectId: string) => Promise<HydrateResult>
): Promise<HydrateResult | null> {
  const existing = inflight.get(projectId);
  if (existing) return existing;

  const versionAtStart = currentVersion(projectId);
  const promise = (async () => {
    try {
      const result = await build(projectId);
      if (currentVersion(projectId) !== versionAtStart) {
        return null;
      }
      cache.set(projectId, { result, expiresAt: Date.now() + PREFETCH_TTL_MS });
      return result;
    } catch (error) {
      console.warn(
        `[prefetchHydrateCache] Prefetch failed for project ${projectId}:`,
        error instanceof Error ? error.message : error
      );
      return null;
    } finally {
      if (inflight.get(projectId) === promise) {
        inflight.delete(projectId);
      }
    }
  })();
  inflight.set(projectId, promise);
  return promise;
}

/**
 * Return-and-delete: consumes the cached payload so the same prefetch never
 * services two hydrates. Returns `undefined` on miss or when the entry has
 * expired (the consumer falls back to the normal hydrate read path in that case).
 */
export function consumePrefetchedHydrateResult(projectId: string): HydrateResult | undefined {
  const entry = cache.get(projectId);
  if (!entry) return undefined;
  cache.delete(projectId);
  if (entry.expiresAt <= Date.now()) return undefined;
  return entry.result;
}

/**
 * Drop any cached payload for `projectId` and bump the invalidation version so
 * any concurrently in-flight prefetch's result is discarded on resolution. Called
 * from `ProjectStore.saveProjectState` whenever project state mutates.
 */
export function invalidatePrefetchCache(projectId?: string): void {
  if (projectId === undefined) {
    cache.clear();
    for (const key of invalidationVersions.keys()) {
      nextVersion(key);
    }
    return;
  }
  cache.delete(projectId);
  nextVersion(projectId);
}

/** Test-only reset. Clears cache, in-flight promises, and invalidation versions. */
export function _resetPrefetchHydrateCacheForTests(): void {
  cache.clear();
  inflight.clear();
  invalidationVersions.clear();
}

/** Test-only inspection. */
export function _peekPrefetchCacheForTests(projectId: string): HydrateResult | undefined {
  const entry = cache.get(projectId);
  return entry?.result;
}
