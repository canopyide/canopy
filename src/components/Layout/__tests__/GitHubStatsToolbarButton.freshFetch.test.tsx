import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs/promises";
import path from "path";

/**
 * GitHubStatsToolbarButton — onFreshFetch wiring (issue #6390).
 *
 * When `GitHubResourceList` lands fresh first-page data on a SWR revalidation,
 * it calls the `onFreshFetch` callback. The toolbar wires this to
 * `refreshStats()` so the dropdown's just-updated count converges into the
 * badge in the same user interaction (no waiting for the 30s poll).
 *
 * These are source-code assertions rather than render tests because the
 * toolbar's eager dynamic-import effect resolves on a microtask, and rendering
 * the full toolbar in jsdom triggers `EnvironmentTeardownError`s when
 * `import()` resolutions race the test-runner shutdown. Static checks of the
 * wiring are sufficient — `onFreshFetch` itself is exercised end-to-end by
 * `GitHubResourceList.swr.test.tsx` and `useRepositoryStats.test.tsx`.
 */
const TOOLBAR_PATH = path.resolve(__dirname, "../GitHubStatsToolbarButton.tsx");

describe("GitHubStatsToolbarButton onFreshFetch wiring", () => {
  let source: string;

  beforeEach(async () => {
    source = await fs.readFile(TOOLBAR_PATH, "utf-8");
  });

  it("declares a stable handleListFreshFetch callback that calls refreshStats()", () => {
    // The handler must memoize against `refreshStats` so the dropdown's
    // `fetchData` callback identity stays stable across renders.
    expect(source).toMatch(/const\s+handleListFreshFetch\s*=\s*useCallback/);
    const handlerStart = source.indexOf("const handleListFreshFetch");
    const handlerSlice = source.slice(handlerStart, handlerStart + 400);
    expect(handlerSlice).toContain("refreshStats()");
    // Must NOT pass `force: true` — the main-process `repoStatsCache` was
    // just updated by the dropdown's `updateRepoStatsCount` write, so a
    // forced refresh would bypass that hot cache and trigger a redundant
    // GitHub network call.
    expect(handlerSlice).not.toMatch(/refreshStats\s*\(\s*\{\s*force/);
    // The handler must list `refreshStats` in its useCallback deps.
    expect(handlerSlice).toMatch(/\[\s*refreshStats\s*\]/);
  });

  it("passes onFreshFetch={handleListFreshFetch} to all four ResourceList renders", () => {
    // Eager-loaded ResourceListComponent appears once for issues and once for
    // PRs, and the Suspense LazyGitHubResourceList appears once for each as
    // well — four total prop sites.
    const matches = source.match(/onFreshFetch=\{handleListFreshFetch\}/g);
    expect(matches).not.toBeNull();
    expect(matches?.length).toBe(4);
  });

  it("wires onFreshFetch in both the issue and PR dropdowns", () => {
    // Split the file at the PR button anchor so we can verify each block
    // contains its own onFreshFetch wiring (not just one block with two).
    const prAnchor = source.indexOf("ref={prsButtonRef}");
    expect(prAnchor).toBeGreaterThan(0);
    const issuesBlock = source.slice(0, prAnchor);
    const prsBlock = source.slice(prAnchor);
    expect(issuesBlock).toContain("onFreshFetch={handleListFreshFetch}");
    expect(prsBlock).toContain("onFreshFetch={handleListFreshFetch}");
  });
});
