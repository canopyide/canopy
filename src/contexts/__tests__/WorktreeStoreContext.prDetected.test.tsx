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
});
