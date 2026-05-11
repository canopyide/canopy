/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGitHubBadgeFreshness } from "../useGitHubBadgeFreshness";
import * as cache from "@/lib/githubResourceCache";
import type { GitHubResourceCacheEntry } from "@/lib/githubResourceCache";

function makeCacheEntry(timestamp: number): GitHubResourceCacheEntry {
  return { items: [], endCursor: null, hasNextPage: false, timestamp };
}

vi.mock("@/store/projectStore", () => ({
  useProjectStore: (selector: (s: { currentProject?: { path: string } | null }) => unknown) =>
    selector({ currentProject: { path: "/test/repo" } }),
}));

let mockTick = 0;
vi.mock("@/hooks/useGlobalMinuteTicker", () => ({
  useGlobalMinuteTicker: () => mockTick,
}));

const PR_KEY = "/test/repo:pr:open:created";
const ISSUE_KEY = "/test/repo:issue:open:created";

describe("useGitHubBadgeFreshness", () => {
  beforeEach(() => {
    cache._resetForTests();
    mockTick = 1;
  });

  afterEach(() => {
    cache._resetForTests();
  });

  it("returns fresh when no row timestamp", () => {
    const { result } = renderHook(() => useGitHubBadgeFreshness("pr", undefined));
    expect(result.current.freshnessLevel).toBe("fresh");
  });

  it("returns fresh when no cache entry exists", () => {
    const { result } = renderHook(() => useGitHubBadgeFreshness("pr", Date.now()));
    expect(result.current.freshnessLevel).toBe("fresh");
    expect(result.current.cacheLastUpdatedAt).toBeNull();
  });

  it("returns aging when cache timestamp is newer than row", () => {
    const rowTime = 1000;
    const cacheTime = 2000;
    cache.setCache(PR_KEY, makeCacheEntry(cacheTime));

    const { result } = renderHook(() => useGitHubBadgeFreshness("pr", rowTime));
    expect(result.current.freshnessLevel).toBe("aging");
    expect(result.current.cacheLastUpdatedAt).toBe(cacheTime);
  });

  it("returns fresh when cache timestamp equals row", () => {
    const time = Date.now();
    cache.setCache(PR_KEY, makeCacheEntry(time));

    const { result } = renderHook(() => useGitHubBadgeFreshness("pr", time));
    expect(result.current.freshnessLevel).toBe("fresh");
  });

  it("returns fresh when cache timestamp is older than row", () => {
    const rowTime = 2000;
    const cacheTime = 1000;
    cache.setCache(PR_KEY, makeCacheEntry(cacheTime));

    const { result } = renderHook(() => useGitHubBadgeFreshness("pr", rowTime));
    expect(result.current.freshnessLevel).toBe("fresh");
  });

  it("uses correct cache key for issue type", () => {
    const rowTime = 1000;
    const cacheTime = 2000;
    cache.setCache(ISSUE_KEY, makeCacheEntry(cacheTime));

    const { result } = renderHook(() => useGitHubBadgeFreshness("issue", rowTime));
    expect(result.current.freshnessLevel).toBe("aging");
  });

  it("returns fresh when cache timestamp is not newer than row", () => {
    const rowTime = 2000;
    cache.setCache(PR_KEY, makeCacheEntry(1500));

    const { result } = renderHook(() => useGitHubBadgeFreshness("pr", rowTime));
    expect(result.current.freshnessLevel).toBe("fresh");
  });

  it("provides now from Date.now when ticker is active", () => {
    mockTick = 5;
    const { result } = renderHook(() => useGitHubBadgeFreshness("pr", undefined));
    expect(result.current.now).toBeGreaterThan(0);
  });
});
