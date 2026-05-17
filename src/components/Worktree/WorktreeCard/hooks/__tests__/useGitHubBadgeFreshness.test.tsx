/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { useGitHubBadgeFreshness } from "../useGitHubBadgeFreshness";
import * as cache from "@/lib/githubResourceCache";
import type { GitHubResourceCacheEntry } from "@/lib/githubResourceCache";
import { useGitHubRateLimitStore } from "@/store/githubRateLimitStore";
import { WorktreeStoreContext } from "@/contexts/WorktreeStoreContext";
import { createWorktreeStore, type WorktreeViewStoreApi } from "@/store/createWorktreeStore";

function makeCacheEntry(timestamp: number): GitHubResourceCacheEntry {
  return { items: [], endCursor: null, hasNextPage: false, timestamp };
}

let store: WorktreeViewStoreApi;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(WorktreeStoreContext.Provider, { value: store }, children);
}

function renderFreshness(type: "pr" | "issue", rowLastUpdatedAt?: number) {
  return renderHook(() => useGitHubBadgeFreshness(type, rowLastUpdatedAt), { wrapper });
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
const STALE_THRESHOLD_MS = 3 * 60 * 1000;
const FIXED_NOW = 10_000_000;

describe("useGitHubBadgeFreshness", () => {
  beforeEach(() => {
    cache._resetForTests();
    useGitHubRateLimitStore.setState({ blocked: false, kind: null, resetAt: null });
    mockTick = 1;
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    store = createWorktreeStore();
  });

  afterEach(() => {
    cache._resetForTests();
    useGitHubRateLimitStore.setState({ blocked: false, kind: null, resetAt: null });
    vi.useRealTimers();
  });

  it("returns fresh when row timestamp is undefined", () => {
    const { result } = renderFreshness("pr", undefined);
    expect(result.current.freshnessLevel).toBe("fresh");
  });

  it("returns fresh when row timestamp is null (cast)", () => {
    const { result } = renderFreshness(
      "pr",
      null as unknown as number | undefined
    );
    expect(result.current.freshnessLevel).toBe("fresh");
  });

  it("returns fresh when no cache entry exists", () => {
    const { result } = renderFreshness("pr", FIXED_NOW);
    expect(result.current.freshnessLevel).toBe("fresh");
  });

  it("returns fresh when row was just updated (age 0)", () => {
    const { result } = renderFreshness("pr", FIXED_NOW);
    expect(result.current.freshnessLevel).toBe("fresh");
  });

  it("returns fresh when row age is just below threshold", () => {
    const rowTime = FIXED_NOW - (STALE_THRESHOLD_MS - 1);
    const { result } = renderFreshness("pr", rowTime);
    expect(result.current.freshnessLevel).toBe("fresh");
  });

  it("returns fresh when row age equals threshold exactly (strict >)", () => {
    const rowTime = FIXED_NOW - STALE_THRESHOLD_MS;
    const { result } = renderFreshness("pr", rowTime);
    expect(result.current.freshnessLevel).toBe("fresh");
  });

  it("returns aging when row age is just over threshold", () => {
    const rowTime = FIXED_NOW - (STALE_THRESHOLD_MS + 1);
    const { result } = renderFreshness("pr", rowTime);
    expect(result.current.freshnessLevel).toBe("aging");
  });

  it("returns aging when row age is well past threshold", () => {
    const rowTime = FIXED_NOW - 10 * 60 * 1000;
    const { result } = renderFreshness("pr", rowTime);
    expect(result.current.freshnessLevel).toBe("aging");
  });

  it("returns fresh when row timestamp is in the future (clock skew)", () => {
    const rowTime = FIXED_NOW + 60_000;
    const { result } = renderFreshness("pr", rowTime);
    expect(result.current.freshnessLevel).toBe("fresh");
  });

  it("does not use cache timestamp to determine aging", () => {
    const rowTime = FIXED_NOW - 1000;
    cache.setCache(PR_KEY, makeCacheEntry(FIXED_NOW));

    const { result } = renderFreshness("pr", rowTime);
    expect(result.current.freshnessLevel).toBe("fresh");
  });

  it("still returns cacheLastUpdatedAt for tooltip suffix consumers", () => {
    const cacheTime = FIXED_NOW - 5_000;
    cache.setCache(PR_KEY, makeCacheEntry(cacheTime));

    const { result } = renderFreshness("pr", FIXED_NOW);
    expect(result.current.cacheLastUpdatedAt).toBe(cacheTime);
  });

  it("returns null cacheLastUpdatedAt when no cache entry exists", () => {
    const { result } = renderFreshness("pr", FIXED_NOW);
    expect(result.current.cacheLastUpdatedAt).toBeNull();
  });

  it("returns now reflecting wall-clock time", () => {
    mockTick = 5;
    const { result } = renderFreshness("pr", undefined);
    expect(result.current.now).toBe(FIXED_NOW);
  });

  it("treats badges as aging while rate-limit pause is active, even with no cache", () => {
    useGitHubRateLimitStore.setState({
      blocked: true,
      kind: "primary",
      resetAt: Date.now() + 60_000,
    });

    const { result } = renderHook(() => useGitHubBadgeFreshness("pr", Date.now()), {
      wrapper,
    });
    expect(result.current.freshnessLevel).toBe("aging");
  });

  it("treats badges as aging while rate-limit pause is active, regardless of cache freshness", () => {
    const time = Date.now();
    cache.setCache(PR_KEY, makeCacheEntry(time));
    useGitHubRateLimitStore.setState({
      blocked: true,
      kind: "secondary",
      resetAt: null,
    });

    // Without rate-limit, this would be "fresh" (cache time equals row time).
    const { result } = renderHook(() => useGitHubBadgeFreshness("pr", time), {
      wrapper,
    });
    expect(result.current.freshnessLevel).toBe("aging");
  });

  it("transitions between fresh and aging as the rate-limit store flips", async () => {
    const { act } = await import("@testing-library/react");
    const time = Date.now();
    cache.setCache(PR_KEY, makeCacheEntry(time));

    const { result, rerender } = renderHook(() => useGitHubBadgeFreshness("pr", time), {
      wrapper,
    });
    expect(result.current.freshnessLevel).toBe("fresh");

    act(() => {
      useGitHubRateLimitStore.setState({
        blocked: true,
        kind: "primary",
        resetAt: Date.now() + 60_000,
      });
    });
    rerender();
    expect(result.current.freshnessLevel).toBe("aging");

    act(() => {
      useGitHubRateLimitStore.setState({ blocked: false, kind: null, resetAt: null });
    });
    rerender();
    expect(result.current.freshnessLevel).toBe("fresh");
  });

  it("uses the issue cache key when type is 'issue'", () => {
    const cacheTime = FIXED_NOW - 5_000;
    cache.setCache(ISSUE_KEY, makeCacheEntry(cacheTime));
    cache.setCache(PR_KEY, makeCacheEntry(FIXED_NOW - 50_000));

    const { result } = renderFreshness("issue", FIXED_NOW);
    expect(result.current.cacheLastUpdatedAt).toBe(cacheTime);
  });

  it("re-evaluates aging as wall-clock time advances past threshold", () => {
    const rowTime = FIXED_NOW - (STALE_THRESHOLD_MS - 1);
    const { result, rerender } = renderHook(
      ({ row }) => useGitHubBadgeFreshness("pr", row),
      {
        initialProps: { row: rowTime },
        wrapper,
      }
    );
    expect(result.current.freshnessLevel).toBe("fresh");

    vi.setSystemTime(FIXED_NOW + 2);
    mockTick = 2;
    rerender({ row: rowTime });

    expect(result.current.freshnessLevel).toBe("aging");
  });

  it("returns errored when PR detection circuit breaker is tripped", () => {
    store.getState().setPrDetectionPaused(true);
    const { result } = renderFreshness("pr", undefined);
    expect(result.current.freshnessLevel).toBe("errored");
  });

  it("overrides aging with errored while the circuit breaker is tripped", () => {
    cache.setCache(PR_KEY, makeCacheEntry(2000));
    store.getState().setPrDetectionPaused(true);

    const { result } = renderFreshness("pr", 1000);
    expect(result.current.freshnessLevel).toBe("errored");
  });

  it("applies errored to issue badges too", () => {
    store.getState().setPrDetectionPaused(true);
    const { result } = renderFreshness("issue", 1000);
    expect(result.current.freshnessLevel).toBe("errored");
  });

  it("reverts to cache-age freshness after the circuit breaker recovers", () => {
    const rowTime = 1000;
    cache.setCache(PR_KEY, makeCacheEntry(2000));

    store.getState().setPrDetectionPaused(true);
    const { result, rerender } = renderFreshness("pr", rowTime);
    expect(result.current.freshnessLevel).toBe("errored");

    store.getState().setPrDetectionPaused(false);
    rerender();
    expect(result.current.freshnessLevel).toBe("aging");
  });
});
