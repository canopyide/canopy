// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useContext } from "react";

import {
  buildCacheKey,
  setCache,
  getCache,
  getGeneration,
  _resetForTests as resetCache,
} from "@/lib/githubResourceCache";
import { useProjectStore } from "@/store/projectStore";
import type { GitHubPR, GitHubPRCIStatus } from "@shared/types/github";
import type { WorktreeSnapshot } from "@shared/types";
import type { Project } from "@shared/types/project";

type PortEventName =
  | "worktree-update"
  | "worktree-removed"
  | "worktree-activated"
  | "pr-detected"
  | "pr-cleared"
  | "pr-detection-paused"
  | "issue-detected"
  | "issue-not-found";

const listeners = new Map<PortEventName, Set<(data: unknown) => void>>();

function emit(name: PortEventName, data: unknown): void {
  const set = listeners.get(name);
  if (!set) return;
  for (const cb of set) cb(data);
}

function makeWorktree(id: string, overrides: Partial<WorktreeSnapshot> = {}): WorktreeSnapshot {
  return {
    id,
    worktreeId: id,
    path: `/repo/${id}`,
    name: id,
    isCurrent: false,
    branch: "main",
    isMainWorktree: true,
    prNumber: 42,
    prUrl: "https://example.test/pr/42",
    prState: "open",
    prCiStatus: "PENDING",
    ...overrides,
  } as WorktreeSnapshot;
}

function makePR(number: number, ciStatus?: GitHubPRCIStatus): GitHubPR {
  return {
    number,
    title: `PR #${number}`,
    url: `https://example.test/pr/${number}`,
    state: "OPEN",
    isDraft: false,
    updatedAt: "",
    author: { login: "u", avatarUrl: "" },
    ciStatus,
  };
}

function setCurrentProject(path: string | null): void {
  const project = path ? ({ id: "p1", name: "p1", path } as unknown as Project) : null;
  useProjectStore.setState({ currentProject: project });
}

beforeEach(() => {
  listeners.clear();
  resetCache();
  setCurrentProject("/repo/proj");

  (globalThis as unknown as { window: Window }).window.electron = {
    worktreePort: {
      isReady: () => true,
      request: (_name: string) => Promise.resolve({ states: [] as WorktreeSnapshot[] }),
      onEvent: (name: PortEventName, cb: (data: unknown) => void) => {
        let set = listeners.get(name);
        if (!set) {
          set = new Set();
          listeners.set(name, set);
        }
        set.add(cb);
        return () => set?.delete(cb);
      },
      onReady: (_cb: () => void) => () => {},
      onDisconnected: (_cb: () => void) => () => {},
      onFatalDisconnect: (_cb: () => void) => () => {},
    },
    worktree: {
      getAllIssueAssociations: () => Promise.resolve({}),
    },
  } as unknown as typeof window.electron;
});

afterEach(() => {
  listeners.clear();
  resetCache();
  setCurrentProject(null);
});

async function renderProvider() {
  const { WorktreeStoreProvider, WorktreeStoreContext } = await import("../WorktreeStoreContext");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WorktreeStoreProvider>{children}</WorktreeStoreProvider>
  );
  const { result } = renderHook(() => useContext(WorktreeStoreContext), { wrapper });
  // Let the initial fetchInitialState promise chain resolve so the store is
  // marked initialized before the test body runs.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  if (!result.current) throw new Error("WorktreeStoreContext is null");
  return result.current;
}

describe("WorktreeStoreProvider pr-detected handler", () => {
  it("writes prCiStatus to the worktree store", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(makeWorktree("wt-1"), store.getState().nextVersion());
    });

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "open",
        prCiStatus: "SUCCESS",
      });
    });

    expect(store.getState().worktrees.get("wt-1")?.prCiStatus).toBe("SUCCESS");
  });

  it("clears prCiStatus when the event omits it (full-replace, matches backend)", async () => {
    const store = await renderProvider();
    act(() => {
      store
        .getState()
        .applyUpdate(
          makeWorktree("wt-1", { prCiStatus: "FAILURE" }),
          store.getState().nextVersion()
        );
    });

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "open",
      });
    });

    expect(store.getState().worktrees.get("wt-1")?.prCiStatus).toBeUndefined();
  });

  it("updates the GitHub PR cache so the dropdown stays in sync", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(makeWorktree("wt-1"), store.getState().nextVersion());
    });

    const key = buildCacheKey("/repo/proj", "pr", "open", "created");
    setCache(key, {
      items: [makePR(42, "PENDING"), makePR(43, "SUCCESS")],
      endCursor: null,
      hasNextPage: false,
      timestamp: 1,
    });
    const genBefore = getGeneration(key);

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "open",
        prCiStatus: "FAILURE",
      });
    });

    const entry = getCache(key);
    const pr42 = entry?.items.find((it) => (it as GitHubPR).number === 42) as GitHubPR;
    const pr43 = entry?.items.find((it) => (it as GitHubPR).number === 43) as GitHubPR;
    expect(pr42.ciStatus).toBe("FAILURE");
    expect(pr43.ciStatus).toBe("SUCCESS");
    expect(getGeneration(key)).toBe(genBefore + 1);
  });

  it("does not bump the cache generation when the CI status is unchanged", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(makeWorktree("wt-1"), store.getState().nextVersion());
    });

    const key = buildCacheKey("/repo/proj", "pr", "open", "created");
    setCache(key, {
      items: [makePR(42, "SUCCESS")],
      endCursor: null,
      hasNextPage: false,
      timestamp: 1,
    });
    const genBefore = getGeneration(key);

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "open",
        prCiStatus: "SUCCESS",
      });
    });

    expect(getGeneration(key)).toBe(genBefore);
  });

  it("clears the cached ciStatus when prCiStatus is undefined (full-replace)", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(makeWorktree("wt-1"), store.getState().nextVersion());
    });

    const key = buildCacheKey("/repo/proj", "pr", "open", "created");
    setCache(key, {
      items: [makePR(42, "SUCCESS")],
      endCursor: null,
      hasNextPage: false,
      timestamp: 1,
    });
    const genBefore = getGeneration(key);

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "open",
      });
    });

    expect((getCache(key)?.items[0] as GitHubPR).ciStatus).toBeUndefined();
    expect(getGeneration(key)).toBe(genBefore + 1);
  });

  it("skips the cache mutation when there is no current project", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(makeWorktree("wt-1"), store.getState().nextVersion());
    });

    setCurrentProject(null);
    const key = buildCacheKey("/repo/proj", "pr", "open", "created");
    setCache(key, {
      items: [makePR(42, "PENDING")],
      endCursor: null,
      hasNextPage: false,
      timestamp: 1,
    });
    const genBefore = getGeneration(key);

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "open",
        prCiStatus: "FAILURE",
      });
    });

    expect((getCache(key)?.items[0] as GitHubPR).ciStatus).toBe("PENDING");
    expect(getGeneration(key)).toBe(genBefore);
  });

  it("targets the cache slot for the current project, not a sibling", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(makeWorktree("wt-1"), store.getState().nextVersion());
    });

    const sameProj = buildCacheKey("/repo/proj", "pr", "open", "created");
    const otherProj = buildCacheKey("/repo/other", "pr", "open", "created");
    setCache(sameProj, {
      items: [makePR(42, "PENDING")],
      endCursor: null,
      hasNextPage: false,
      timestamp: 1,
    });
    setCache(otherProj, {
      items: [makePR(42, "PENDING")],
      endCursor: null,
      hasNextPage: false,
      timestamp: 1,
    });

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "open",
        prCiStatus: "SUCCESS",
      });
    });

    expect((getCache(sameProj)?.items[0] as GitHubPR).ciStatus).toBe("SUCCESS");
    expect((getCache(otherProj)?.items[0] as GitHubPR).ciStatus).toBe("PENDING");
  });

  it("applies last-write-wins across rapid successive events for the same PR", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(makeWorktree("wt-1"), store.getState().nextVersion());
    });

    const key = buildCacheKey("/repo/proj", "pr", "open", "created");
    setCache(key, {
      items: [makePR(42, "PENDING")],
      endCursor: null,
      hasNextPage: false,
      timestamp: 1,
    });

    act(() => {
      for (const ciStatus of ["PENDING", "FAILURE", "SUCCESS"] as const) {
        emit("pr-detected", {
          type: "pr-detected",
          worktreeId: "wt-1",
          prNumber: 42,
          prUrl: "https://example.test/pr/42",
          prState: "open",
          prCiStatus: ciStatus,
        });
      }
    });

    expect(store.getState().worktrees.get("wt-1")?.prCiStatus).toBe("SUCCESS");
    expect((getCache(key)?.items[0] as GitHubPR).ciStatus).toBe("SUCCESS");
  });

  it("does nothing when the worktree is not in the store", async () => {
    const store = await renderProvider();
    const key = buildCacheKey("/repo/proj", "pr", "open", "created");
    setCache(key, {
      items: [makePR(42, "PENDING")],
      endCursor: null,
      hasNextPage: false,
      timestamp: 1,
    });
    const genBefore = getGeneration(key);

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-missing",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "open",
        prCiStatus: "SUCCESS",
      });
    });

    expect(store.getState().worktrees.get("wt-missing")).toBeUndefined();
    expect((getCache(key)?.items[0] as GitHubPR).ciStatus).toBe("PENDING");
    expect(getGeneration(key)).toBe(genBefore);
  });

  it("drops the overlay when event.branchName mismatches the worktree's current branch", async () => {
    const store = await renderProvider();
    act(() => {
      store
        .getState()
        .applyUpdate(
          makeWorktree("wt-1", { branch: "feature/bar", prCiStatus: "FAILURE", prNumber: 99 }),
          store.getState().nextVersion()
        );
    });

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "open",
        prCiStatus: "SUCCESS",
        branchName: "feature/foo",
      });
    });

    const wt = store.getState().worktrees.get("wt-1");
    expect(wt?.prNumber).toBe(99);
    expect(wt?.prCiStatus).toBe("FAILURE");
  });

  it("applies the overlay when event.branchName matches the worktree's current branch", async () => {
    const store = await renderProvider();
    act(() => {
      store
        .getState()
        .applyUpdate(
          makeWorktree("wt-1", { branch: "feature/foo" }),
          store.getState().nextVersion()
        );
    });

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "open",
        prCiStatus: "SUCCESS",
        branchName: "feature/foo",
      });
    });

    expect(store.getState().worktrees.get("wt-1")?.prCiStatus).toBe("SUCCESS");
  });

  it("applies the overlay when the event omits branchName (older host backward compat)", async () => {
    const store = await renderProvider();
    act(() => {
      store
        .getState()
        .applyUpdate(
          makeWorktree("wt-1", { branch: "feature/foo" }),
          store.getState().nextVersion()
        );
    });

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "open",
        prCiStatus: "SUCCESS",
      });
    });

    expect(store.getState().worktrees.get("wt-1")?.prCiStatus).toBe("SUCCESS");
  });

  it("drops a stale pr-detected that arrives after a worktree-update changed the branch", async () => {
    // End-to-end race scenario: worktree starts on feature/foo, a PR lookup
    // was queued against it, the worktree switches to feature/bar (arrives as
    // a worktree-update snapshot), then the stale pr-detected from the
    // feature/foo lookup completes and tries to land on the now-bar row.
    const store = await renderProvider();
    act(() => {
      store
        .getState()
        .applyUpdate(
          makeWorktree("wt-1", { branch: "feature/foo" }),
          store.getState().nextVersion()
        );
    });

    // Worktree-update arrives reflecting the branch change to feature/bar.
    act(() => {
      emit("worktree-update", {
        type: "worktree-update",
        worktree: makeWorktree("wt-1", { branch: "feature/bar", prCiStatus: undefined }),
      });
    });

    // The stale pr-detected from the feature/foo lookup arrives late.
    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 999,
        prUrl: "https://example.test/pr/999",
        prState: "open",
        prCiStatus: "FAILURE",
        branchName: "feature/foo",
      });
    });

    const wt = store.getState().worktrees.get("wt-1");
    expect(wt?.branch).toBe("feature/bar");
    expect(wt?.prNumber).not.toBe(999);
    expect(wt?.prCiStatus).not.toBe("FAILURE");
  });

  it("applies the overlay when the worktree has no branch (detached HEAD)", async () => {
    const store = await renderProvider();
    act(() => {
      store
        .getState()
        .applyUpdate(makeWorktree("wt-1", { branch: undefined }), store.getState().nextVersion());
    });

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "open",
        prCiStatus: "SUCCESS",
        branchName: "feature/foo",
      });
    });

    expect(store.getState().worktrees.get("wt-1")?.prCiStatus).toBe("SUCCESS");
  });

  it("uses the project path read at event time so closures cannot go stale", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(makeWorktree("wt-1"), store.getState().nextVersion());
    });

    // Project switches AFTER the provider mounts; the handler must read the
    // new path at fire time, not the path captured at mount.
    setCurrentProject("/repo/proj-new");
    const newKey = buildCacheKey("/repo/proj-new", "pr", "open", "created");
    const oldKey = buildCacheKey("/repo/proj", "pr", "open", "created");
    setCache(newKey, {
      items: [makePR(42, "PENDING")],
      endCursor: null,
      hasNextPage: false,
      timestamp: 1,
    });
    setCache(oldKey, {
      items: [makePR(42, "PENDING")],
      endCursor: null,
      hasNextPage: false,
      timestamp: 1,
    });

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "open",
        prCiStatus: "SUCCESS",
      });
    });

    expect((getCache(newKey)?.items[0] as GitHubPR).ciStatus).toBe("SUCCESS");
    expect((getCache(oldKey)?.items[0] as GitHubPR).ciStatus).toBe("PENDING");
  });

  it("evicts a PR from the 'open' slot once it closes", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(makeWorktree("wt-1"), store.getState().nextVersion());
    });

    const key = buildCacheKey("/repo/proj", "pr", "open", "created");
    setCache(key, {
      items: [
        { ...makePR(42, "PENDING"), state: "OPEN" },
        { ...makePR(43, "SUCCESS"), state: "OPEN" },
      ],
      endCursor: null,
      hasNextPage: false,
      timestamp: 1,
    });
    const genBefore = getGeneration(key);

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "closed",
        prCiStatus: "FAILURE",
      });
    });

    const items = getCache(key)?.items as GitHubPR[];
    expect(items.find((it) => it.number === 42)).toBeUndefined();
    expect(items.find((it) => it.number === 43)).toBeDefined();
    expect(getGeneration(key)).toBe(genBefore + 1);
  });

  it("evicts a closed PR from every 'open' sort slot in one event", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(makeWorktree("wt-1"), store.getState().nextVersion());
    });

    const createdKey = buildCacheKey("/repo/proj", "pr", "open", "created");
    const updatedKey = buildCacheKey("/repo/proj", "pr", "open", "updated");
    for (const key of [createdKey, updatedKey]) {
      setCache(key, {
        items: [{ ...makePR(42, "PENDING"), state: "OPEN" }],
        endCursor: null,
        hasNextPage: false,
        timestamp: 1,
      });
    }
    const genCreatedBefore = getGeneration(createdKey);
    const genUpdatedBefore = getGeneration(updatedKey);

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "closed",
        prCiStatus: "FAILURE",
      });
    });

    expect(
      (getCache(createdKey)?.items as GitHubPR[]).find((it) => it.number === 42)
    ).toBeUndefined();
    expect(
      (getCache(updatedKey)?.items as GitHubPR[]).find((it) => it.number === 42)
    ).toBeUndefined();
    expect(getGeneration(createdKey)).toBe(genCreatedBefore + 1);
    expect(getGeneration(updatedKey)).toBe(genUpdatedBefore + 1);
  });

  it("evicts a PR from the 'open' slot once it merges", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(makeWorktree("wt-1"), store.getState().nextVersion());
    });

    const key = buildCacheKey("/repo/proj", "pr", "open", "created");
    setCache(key, {
      items: [{ ...makePR(42, "SUCCESS"), state: "OPEN" }],
      endCursor: null,
      hasNextPage: false,
      timestamp: 1,
    });
    const genBefore = getGeneration(key);

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "merged",
        prCiStatus: "SUCCESS",
      });
    });

    expect((getCache(key)?.items as GitHubPR[]).find((it) => it.number === 42)).toBeUndefined();
    expect(getGeneration(key)).toBe(genBefore + 1);
  });

  it("evicts a PR from the 'closed' slot once it reopens", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(makeWorktree("wt-1"), store.getState().nextVersion());
    });

    const key = buildCacheKey("/repo/proj", "pr", "closed", "created");
    setCache(key, {
      items: [{ ...makePR(42, "FAILURE"), state: "CLOSED" }],
      endCursor: null,
      hasNextPage: false,
      timestamp: 1,
    });
    const genBefore = getGeneration(key);

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "open",
        prCiStatus: "PENDING",
      });
    });

    expect((getCache(key)?.items as GitHubPR[]).find((it) => it.number === 42)).toBeUndefined();
    expect(getGeneration(key)).toBe(genBefore + 1);
  });

  it("keeps the row in a CI-only rollup where the state is unchanged", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(makeWorktree("wt-1"), store.getState().nextVersion());
    });

    const key = buildCacheKey("/repo/proj", "pr", "open", "created");
    setCache(key, {
      items: [{ ...makePR(42, "PENDING"), state: "OPEN" }],
      endCursor: null,
      hasNextPage: false,
      timestamp: 1,
    });
    const genBefore = getGeneration(key);

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "open",
        prCiStatus: "SUCCESS",
      });
    });

    const pr42 = (getCache(key)?.items as GitHubPR[]).find((it) => it.number === 42);
    expect(pr42).toBeDefined();
    expect(pr42?.ciStatus).toBe("SUCCESS");
    expect(getGeneration(key)).toBe(genBefore + 1);
  });

  it("keeps a state-changed PR in the 'all' slot, only patching CI", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(makeWorktree("wt-1"), store.getState().nextVersion());
    });

    const key = buildCacheKey("/repo/proj", "pr", "all", "created");
    setCache(key, {
      items: [{ ...makePR(42, "PENDING"), state: "OPEN" }],
      endCursor: null,
      hasNextPage: false,
      timestamp: 1,
    });
    const genBefore = getGeneration(key);

    act(() => {
      emit("pr-detected", {
        type: "pr-detected",
        worktreeId: "wt-1",
        prNumber: 42,
        prUrl: "https://example.test/pr/42",
        prState: "merged",
        prCiStatus: "SUCCESS",
      });
    });

    const pr42 = (getCache(key)?.items as GitHubPR[]).find((it) => it.number === 42);
    expect(pr42).toBeDefined();
    expect(pr42?.ciStatus).toBe("SUCCESS");
    expect(getGeneration(key)).toBe(genBefore + 1);
  });
});

describe("WorktreeStoreProvider pr-cleared handler", () => {
  it("drops the clear when event.branchName mismatches the worktree's current branch", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(
        makeWorktree("wt-1", {
          branch: "feature/bar",
          prNumber: 42,
          prUrl: "https://example.test/pr/42",
          prState: "open",
        }),
        store.getState().nextVersion()
      );
    });

    act(() => {
      emit("pr-cleared", {
        type: "pr-cleared",
        worktreeId: "wt-1",
        branchName: "feature/foo",
      });
    });

    const wt = store.getState().worktrees.get("wt-1");
    expect(wt?.prNumber).toBe(42);
    expect(wt?.prUrl).toBe("https://example.test/pr/42");
    expect(wt?.prState).toBe("open");
  });

  it("applies the clear when event.branchName matches the worktree's current branch", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(
        makeWorktree("wt-1", {
          branch: "feature/foo",
          prNumber: 42,
          prUrl: "https://example.test/pr/42",
          prState: "open",
        }),
        store.getState().nextVersion()
      );
    });

    act(() => {
      emit("pr-cleared", {
        type: "pr-cleared",
        worktreeId: "wt-1",
        branchName: "feature/foo",
      });
    });

    const wt = store.getState().worktrees.get("wt-1");
    expect(wt?.prNumber).toBeUndefined();
    expect(wt?.prUrl).toBeUndefined();
    expect(wt?.prState).toBeUndefined();
  });

  it("applies the clear when the event omits branchName (older host backward compat)", async () => {
    const store = await renderProvider();
    act(() => {
      store
        .getState()
        .applyUpdate(
          makeWorktree("wt-1", { branch: "feature/foo", prNumber: 42 }),
          store.getState().nextVersion()
        );
    });

    act(() => {
      emit("pr-cleared", {
        type: "pr-cleared",
        worktreeId: "wt-1",
      });
    });

    expect(store.getState().worktrees.get("wt-1")?.prNumber).toBeUndefined();
  });

  it("clears prCiStatus alongside the PR fields (no orphaned CI rollup)", async () => {
    const store = await renderProvider();
    act(() => {
      store
        .getState()
        .applyUpdate(
          makeWorktree("wt-1", { branch: "feature/foo", prNumber: 42, prCiStatus: "FAILURE" }),
          store.getState().nextVersion()
        );
    });

    act(() => {
      emit("pr-cleared", {
        type: "pr-cleared",
        worktreeId: "wt-1",
        branchName: "feature/foo",
      });
    });

    const wt = store.getState().worktrees.get("wt-1");
    expect(wt?.prNumber).toBeUndefined();
    expect(wt?.prCiStatus).toBeUndefined();
  });

  it("drops a stale pr-cleared after a multi-hop branch switch (foo → bar → baz)", async () => {
    const store = await renderProvider();
    // Start on baz with a valid PR (the survivor)
    act(() => {
      store.getState().applyUpdate(
        makeWorktree("wt-1", {
          branch: "feature/baz",
          prNumber: 999,
          prUrl: "https://example.test/pr/999",
          prState: "open",
          prCiStatus: "SUCCESS",
        }),
        store.getState().nextVersion()
      );
    });

    // Stale clear arrives from the long-ago `foo` lookup
    act(() => {
      emit("pr-cleared", {
        type: "pr-cleared",
        worktreeId: "wt-1",
        branchName: "feature/foo",
      });
    });

    const wt = store.getState().worktrees.get("wt-1");
    expect(wt?.prNumber).toBe(999);
    expect(wt?.prCiStatus).toBe("SUCCESS");
  });
});

describe("WorktreeStoreProvider issue-detected handler", () => {
  it("drops the overlay when event.branchName mismatches the worktree's current branch", async () => {
    const store = await renderProvider();
    act(() => {
      store.getState().applyUpdate(
        makeWorktree("wt-1", {
          branch: "feature/bar",
          issueNumber: 100,
          issueTitle: "Old issue",
        }),
        store.getState().nextVersion()
      );
    });

    act(() => {
      emit("issue-detected", {
        type: "issue-detected",
        worktreeId: "wt-1",
        issueNumber: 200,
        issueTitle: "New issue",
        branchName: "feature/foo",
      });
    });

    const wt = store.getState().worktrees.get("wt-1");
    expect(wt?.issueNumber).toBe(100);
    expect(wt?.issueTitle).toBe("Old issue");
  });

  it("applies the overlay when event.branchName matches the worktree's current branch", async () => {
    const store = await renderProvider();
    act(() => {
      store
        .getState()
        .applyUpdate(
          makeWorktree("wt-1", { branch: "feature/foo" }),
          store.getState().nextVersion()
        );
    });

    act(() => {
      emit("issue-detected", {
        type: "issue-detected",
        worktreeId: "wt-1",
        issueNumber: 200,
        issueTitle: "Issue title",
        branchName: "feature/foo",
      });
    });

    const wt = store.getState().worktrees.get("wt-1");
    expect(wt?.issueNumber).toBe(200);
    expect(wt?.issueTitle).toBe("Issue title");
  });

  it("applies the overlay when the event omits branchName (older host backward compat)", async () => {
    const store = await renderProvider();
    act(() => {
      store
        .getState()
        .applyUpdate(
          makeWorktree("wt-1", { branch: "feature/foo" }),
          store.getState().nextVersion()
        );
    });

    act(() => {
      emit("issue-detected", {
        type: "issue-detected",
        worktreeId: "wt-1",
        issueNumber: 200,
        issueTitle: "Issue title",
      });
    });

    expect(store.getState().worktrees.get("wt-1")?.issueNumber).toBe(200);
  });
});

describe("WorktreeStoreProvider manual issue associations (#8079)", () => {
  function mockHydration(
    states: WorktreeSnapshot[],
    associations: Record<string, { issueNumber: number; issueTitle?: string }>
  ): void {
    const electron = (globalThis as unknown as { window: Window }).window.electron as unknown as {
      worktreePort: { request: (name: string) => Promise<unknown> };
      worktree: { getAllIssueAssociations: () => Promise<unknown> };
    };
    electron.worktreePort.request = () => Promise.resolve({ states });
    electron.worktree.getAllIssueAssociations = () => Promise.resolve(associations);
  }

  it("manual association survives a worktree-update that omits the issue", async () => {
    mockHydration([makeWorktree("wt-1", { issueNumber: undefined, issueTitle: undefined })], {
      "wt-1": { issueNumber: 42, issueTitle: "Manual issue" },
    });
    const store = await renderProvider();

    expect(store.getState().worktrees.get("wt-1")?.issueNumber).toBe(42);

    act(() => {
      emit("worktree-update", {
        type: "worktree-update",
        worktree: makeWorktree("wt-1", {
          branch: "feature/x",
          issueNumber: undefined,
          issueTitle: undefined,
        }),
      });
    });

    const wt = store.getState().worktrees.get("wt-1");
    expect(wt?.issueNumber).toBe(42);
    expect(wt?.issueTitle).toBe("Manual issue");
    expect(wt?.branch).toBe("feature/x");
  });

  it("manual association overrides an auto-detected issue (MANUAL_OVER_AUTO)", async () => {
    mockHydration([makeWorktree("wt-1", { issueNumber: 11, issueTitle: "Auto" })], {
      "wt-1": { issueNumber: 42, issueTitle: "Manual issue" },
    });
    const store = await renderProvider();

    const wt = store.getState().worktrees.get("wt-1");
    expect(wt?.issueNumber).toBe(42);
    expect(wt?.issueTitle).toBe("Manual issue");
  });

  it("clearing an association stops it resurfacing on the next update", async () => {
    mockHydration([makeWorktree("wt-1", { issueNumber: undefined })], {
      "wt-1": { issueNumber: 42, issueTitle: "Manual issue" },
    });
    const store = await renderProvider();

    act(() => {
      store.getState().clearManualAssociation("wt-1");
    });
    act(() => {
      emit("worktree-update", {
        type: "worktree-update",
        worktree: makeWorktree("wt-1", { issueNumber: undefined, issueTitle: undefined }),
      });
    });

    expect(store.getState().worktrees.get("wt-1")?.issueNumber).toBeUndefined();
  });
});

describe("WorktreeStoreProvider pr-detection-paused handler", () => {
  it("mirrors the circuit-breaker trip into the store", async () => {
    const store = await renderProvider();
    expect(store.getState().prDetectionPaused).toBe(false);

    act(() => {
      emit("pr-detection-paused", { type: "pr-detection-paused", tripped: true });
    });

    expect(store.getState().prDetectionPaused).toBe(true);
  });

  it("clears the flag on recovery", async () => {
    const store = await renderProvider();
    act(() => {
      emit("pr-detection-paused", { type: "pr-detection-paused", tripped: true });
    });
    expect(store.getState().prDetectionPaused).toBe(true);

    act(() => {
      emit("pr-detection-paused", { type: "pr-detection-paused", tripped: false });
    });

    expect(store.getState().prDetectionPaused).toBe(false);
  });
});
