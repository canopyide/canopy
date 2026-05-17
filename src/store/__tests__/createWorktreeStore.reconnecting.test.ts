import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorktreeStore } from "@/store/createWorktreeStore";
import type { WorktreeSnapshot } from "@shared/types";

function makeSnapshot(id: string): WorktreeSnapshot {
  return {
    id,
    name: id,
    branch: "main",
    path: `/repo/${id}`,
    isCurrent: false,
    isMainWorktree: false,
    modifiedCount: 0,
    changes: [],
    summary: "",
    mood: null,
    gitDir: "",
  } as unknown as WorktreeSnapshot;
}

describe("createWorktreeStore — reconnecting state", () => {
  it("starts with isReconnecting=false", () => {
    const store = createWorktreeStore();
    expect(store.getState().isReconnecting).toBe(false);
  });

  it("setReconnecting(true) flips the flag", () => {
    const store = createWorktreeStore();
    store.getState().setReconnecting(true);
    expect(store.getState().isReconnecting).toBe(true);
  });

  it("applySnapshot clears isReconnecting after successful hydration", () => {
    const store = createWorktreeStore();
    store.getState().setReconnecting(true);
    expect(store.getState().isReconnecting).toBe(true);

    const version = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], version);

    expect(store.getState().isReconnecting).toBe(false);
    expect(store.getState().isInitialized).toBe(true);
    expect(store.getState().worktrees.size).toBe(1);
  });

  it("applySnapshot with stale version does NOT clear isReconnecting", () => {
    const store = createWorktreeStore();

    // Advance version by applying a first snapshot
    const v1 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], v1);

    // Start reconnecting, then deliver a stale snapshot (lower/equal version)
    store.getState().setReconnecting(true);
    store.getState().applySnapshot([makeSnapshot("wt-stale")], v1);

    expect(store.getState().isReconnecting).toBe(true);
  });

  it("applyUpdate does NOT clear isReconnecting (only applySnapshot does)", () => {
    const store = createWorktreeStore();

    // Seed with a worktree so applyUpdate can modify it
    const v1 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], v1);

    store.getState().setReconnecting(true);
    const v2 = store.getState().nextVersion();
    store.getState().applyUpdate(makeSnapshot("wt-1"), v2);

    expect(store.getState().isReconnecting).toBe(true);
  });

  it("setReconnecting(false) clears the flag independently", () => {
    const store = createWorktreeStore();
    store.getState().setReconnecting(true);
    store.getState().setReconnecting(false);
    expect(store.getState().isReconnecting).toBe(false);
  });
});

describe("createWorktreeStore — reconnectingAt timestamp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with reconnectingAt=null", () => {
    const store = createWorktreeStore();
    expect(store.getState().reconnectingAt).toBeNull();
  });

  it("setReconnecting(true) captures Date.now() in reconnectingAt", () => {
    const store = createWorktreeStore();
    const before = Date.now();
    store.getState().setReconnecting(true);
    expect(store.getState().reconnectingAt).toBe(before);
  });

  it("setReconnecting(false) clears reconnectingAt to null", () => {
    const store = createWorktreeStore();
    store.getState().setReconnecting(true);
    expect(store.getState().reconnectingAt).not.toBeNull();
    store.getState().setReconnecting(false);
    expect(store.getState().reconnectingAt).toBeNull();
  });

  it("repeated setReconnecting(true) preserves the original baseline", () => {
    // During a workspace-host crash-retry loop, `onDisconnected` fires on
    // every restart. If `reconnectingAt` were re-stamped on each call, the
    // elapsed clock would reset and the escalation copy would never appear
    // before the restart budget exhausts (~14s) and `setFatalError` fires.
    const store = createWorktreeStore();
    store.getState().setReconnecting(true);
    const first = store.getState().reconnectingAt;
    vi.advanceTimersByTime(5000);
    store.getState().setReconnecting(true);
    expect(store.getState().reconnectingAt).toBe(first);
  });

  it("setReconnecting(true) after recovery captures a fresh timestamp", () => {
    const store = createWorktreeStore();
    store.getState().setReconnecting(true);
    const first = store.getState().reconnectingAt;
    vi.advanceTimersByTime(5000);
    store.getState().setReconnecting(false);
    vi.advanceTimersByTime(1000);
    store.getState().setReconnecting(true);
    const second = store.getState().reconnectingAt;
    expect(second).not.toBeNull();
    expect(second).toBeGreaterThan(first ?? 0);
  });

  it("applySnapshot normal-path clears reconnectingAt", () => {
    const store = createWorktreeStore();
    store.getState().setReconnecting(true);
    expect(store.getState().reconnectingAt).not.toBeNull();

    const version = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], version);

    expect(store.getState().reconnectingAt).toBeNull();
  });

  it("applySnapshot no-op early-return path clears reconnectingAt", () => {
    const store = createWorktreeStore();

    // Hydrate so the value-equality early-return path triggers on the next call
    const v1 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], v1);
    store.getState().setReconnecting(true);
    expect(store.getState().reconnectingAt).not.toBeNull();

    const v2 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], v2);

    expect(store.getState().reconnectingAt).toBeNull();
  });

  it("setFatalError clears reconnectingAt", () => {
    const store = createWorktreeStore();
    store.getState().setReconnecting(true);
    expect(store.getState().reconnectingAt).not.toBeNull();

    store.getState().setFatalError("host crashed");

    expect(store.getState().reconnectingAt).toBeNull();
  });

  it("stale-version applySnapshot does NOT clear reconnectingAt", () => {
    const store = createWorktreeStore();

    const v1 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], v1);

    store.getState().setReconnecting(true);
    const captured = store.getState().reconnectingAt;
    store.getState().applySnapshot([makeSnapshot("wt-stale")], v1);

    expect(store.getState().reconnectingAt).toBe(captured);
  });
});

describe("createWorktreeStore — PR detection paused state", () => {
  it("starts with prDetectionPaused=false", () => {
    const store = createWorktreeStore();
    expect(store.getState().prDetectionPaused).toBe(false);
  });

  it("setPrDetectionPaused(true) flips the flag", () => {
    const store = createWorktreeStore();
    store.getState().setPrDetectionPaused(true);
    expect(store.getState().prDetectionPaused).toBe(true);
  });

  it("setPrDetectionPaused(false) clears the flag", () => {
    const store = createWorktreeStore();
    store.getState().setPrDetectionPaused(true);
    store.getState().setPrDetectionPaused(false);
    expect(store.getState().prDetectionPaused).toBe(false);
  });

  it("no-ops (same state reference) when the value is unchanged", () => {
    const store = createWorktreeStore();
    const before = store.getState();
    store.getState().setPrDetectionPaused(false);
    expect(store.getState()).toBe(before);
  });
});

describe("createWorktreeStore — applySnapshot identity preservation", () => {
  it("preserves Map identity when every snapshot is value-equal", () => {
    const store = createWorktreeStore();

    const v1 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1"), makeSnapshot("wt-2")], v1);
    const firstMap = store.getState().worktrees;

    const v2 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1"), makeSnapshot("wt-2")], v2);

    expect(store.getState().worktrees).toBe(firstMap);
    expect(store.getState().version).toBe(v2);
  });

  it("rebuilds the Map when any snapshot's value differs", () => {
    const store = createWorktreeStore();

    const v1 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], v1);
    const firstMap = store.getState().worktrees;

    const changed = makeSnapshot("wt-1");
    (changed as { branch: string }).branch = "feature/x";

    const v2 = store.getState().nextVersion();
    store.getState().applySnapshot([changed], v2);

    expect(store.getState().worktrees).not.toBe(firstMap);
    expect(store.getState().worktrees.get("wt-1")?.branch).toBe("feature/x");
  });

  it("rebuilds when the snapshot set has different size", () => {
    const store = createWorktreeStore();

    const v1 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], v1);
    const firstMap = store.getState().worktrees;

    const v2 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1"), makeSnapshot("wt-2")], v2);

    expect(store.getState().worktrees).not.toBe(firstMap);
    expect(store.getState().worktrees.size).toBe(2);
  });

  it("rebuilds when only prCiStatus changes (CI flip should trigger re-render)", () => {
    const store = createWorktreeStore();

    const initial = makeSnapshot("wt-1");
    (initial as { prCiStatus?: string }).prCiStatus = "PENDING";

    const v1 = store.getState().nextVersion();
    store.getState().applySnapshot([initial], v1);
    const firstMap = store.getState().worktrees;

    const updated = makeSnapshot("wt-1");
    (updated as { prCiStatus?: string }).prCiStatus = "SUCCESS";

    const v2 = store.getState().nextVersion();
    store.getState().applySnapshot([updated], v2);

    // snapshotsEqual must include prCiStatus so the Map is rebuilt and
    // selectors using useShallow re-render with the new CI state.
    expect(store.getState().worktrees).not.toBe(firstMap);
    expect(store.getState().worktrees.get("wt-1")?.prCiStatus).toBe("SUCCESS");
  });

  it("rebuilds when an id is replaced (same size, different keys)", () => {
    const store = createWorktreeStore();

    const v1 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], v1);
    const firstMap = store.getState().worktrees;

    const v2 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-2")], v2);

    expect(store.getState().worktrees).not.toBe(firstMap);
    expect(store.getState().worktrees.has("wt-2")).toBe(true);
    expect(store.getState().worktrees.has("wt-1")).toBe(false);
  });

  it("always rebuilds on cold start so isInitialized flips", () => {
    const store = createWorktreeStore();
    expect(store.getState().isInitialized).toBe(false);
    const initialMap = store.getState().worktrees;

    const v1 = store.getState().nextVersion();
    store.getState().applySnapshot([], v1);

    expect(store.getState().isInitialized).toBe(true);
    expect(store.getState().worktrees).not.toBe(initialMap);
  });

  it("advances version on a no-op snapshot", () => {
    const store = createWorktreeStore();

    const v1 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], v1);

    const v2 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], v2);

    expect(store.getState().version).toBe(v2);
  });

  it("clears isReconnecting on a no-op snapshot", () => {
    const store = createWorktreeStore();

    const v1 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], v1);
    store.getState().setReconnecting(true);

    const v2 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], v2);

    expect(store.getState().isReconnecting).toBe(false);
  });
});

describe("createWorktreeStore — fatal error state", () => {
  it("setFatalError sets error, clears isReconnecting, and resets isInitialized", () => {
    const store = createWorktreeStore();

    // Simulate a fully-hydrated store before the host crashes
    const v1 = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], v1);
    store.getState().setReconnecting(true);
    expect(store.getState().isInitialized).toBe(true);

    store.getState().setFatalError("host crashed");

    expect(store.getState().error).toBe("host crashed");
    expect(store.getState().isReconnecting).toBe(false);
    // isInitialized must be reset so the next fetch is treated as a cold
    // start, not a silent wake refresh (which swallows fetch errors).
    expect(store.getState().isInitialized).toBe(false);
  });

  it("setFatalError clears isLoading so the error UI surfaces before first hydration", () => {
    // If the host exhausts its restart budget before the first snapshot
    // ever arrives, `isLoading` is still `true` and `worktrees` is empty.
    // `SidebarContent` checks `isLoading && worktrees.length === 0` BEFORE
    // the error branch — so without clearing `isLoading`, the Restart
    // Service button would never appear.
    const store = createWorktreeStore();
    expect(store.getState().isLoading).toBe(true);
    expect(store.getState().worktrees.size).toBe(0);

    store.getState().setFatalError("host crashed before first fetch");

    expect(store.getState().isLoading).toBe(false);
    expect(store.getState().error).toBe("host crashed before first fetch");
  });

  it("applySnapshot after setFatalError clears error and restores isInitialized", () => {
    const store = createWorktreeStore();
    store.getState().setFatalError("host crashed");
    expect(store.getState().error).toBe("host crashed");
    expect(store.getState().isInitialized).toBe(false);

    const version = store.getState().nextVersion();
    store.getState().applySnapshot([makeSnapshot("wt-1")], version);

    expect(store.getState().error).toBeNull();
    expect(store.getState().isInitialized).toBe(true);
    expect(store.getState().worktrees.size).toBe(1);
  });
});
