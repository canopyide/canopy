import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorktreeSnapshot, WorktreeEventVersion } from "@shared/types";

// Host-minted versions are now `(epoch, seq)` tuples (#8403). Tests mint a
// monotonic seq under a fixed epoch; each fresh store starts at epoch "" so
// the first non-empty epoch is always accepted as an epoch transition.
const TEST_EPOCH = "test-epoch";
let _seq = 0;
function nextV(): WorktreeEventVersion {
  return { epoch: TEST_EPOCH, seq: ++_seq };
}

const { worktreeClientDeleteMock, closeTerminalsForWorktreeMock } = vi.hoisted(() => ({
  worktreeClientDeleteMock:
    vi.fn<(id: string, force?: boolean, deleteBranch?: boolean) => Promise<void>>(),
  closeTerminalsForWorktreeMock: vi.fn<(id: string) => Promise<void>>(),
}));

vi.mock("@/clients", async () => {
  const actual = await vi.importActual<typeof import("@/clients")>("@/clients");
  return {
    ...actual,
    worktreeClient: {
      ...actual.worktreeClient,
      delete: worktreeClientDeleteMock,
    },
  };
});

vi.mock("@/components/Worktree/worktreeDeleteHelper", () => ({
  closeTerminalsForWorktree: closeTerminalsForWorktreeMock,
}));

// Import after mocks so the store picks up the mocked deps.
import { createWorktreeStore } from "@/store/createWorktreeStore";

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

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createWorktreeStore — delete in-flight state (#8417)", () => {
  beforeEach(() => {
    worktreeClientDeleteMock.mockReset();
    closeTerminalsForWorktreeMock.mockReset();
    worktreeClientDeleteMock.mockResolvedValue();
    closeTerminalsForWorktreeMock.mockResolvedValue();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with empty delete maps", () => {
    const store = createWorktreeStore();
    expect(store.getState().deletingIds.size).toBe(0);
    expect(store.getState().deleteErrors.size).toBe(0);
    expect(store.getState().deleteErrorArgs.size).toBe(0);
  });

  it("startDelete marks deletingIds and stores args atomically", () => {
    const store = createWorktreeStore();
    store.getState().applySnapshot([makeSnapshot("wt-1")], nextV());

    store.getState().startDelete("wt-1", { force: true, deleteBranch: false });

    expect(store.getState().deletingIds.has("wt-1")).toBe(true);
    expect(store.getState().deleteErrors.has("wt-1")).toBe(false);
    expect(store.getState().deleteErrorArgs.get("wt-1")).toEqual({
      force: true,
      deleteBranch: false,
    });
  });

  it("startDelete is idempotent — a second call while in flight is a no-op", () => {
    const store = createWorktreeStore();
    store.getState().startDelete("wt-1", { force: false });
    store.getState().startDelete("wt-1", { force: true });
    // Args from the first call must persist — the second start was suppressed.
    expect(store.getState().deleteErrorArgs.get("wt-1")).toEqual({ force: false });
  });

  it("startDelete with closeTerminals routes through closeTerminalsForWorktree before IPC", async () => {
    const store = createWorktreeStore();
    store.getState().startDelete("wt-1", { closeTerminals: true });
    await flushPromises();
    await flushPromises();

    expect(closeTerminalsForWorktreeMock).toHaveBeenCalledWith("wt-1");
    expect(worktreeClientDeleteMock).toHaveBeenCalledWith("wt-1", undefined, undefined);
  });

  it("startDelete without closeTerminals skips terminal cleanup", async () => {
    const store = createWorktreeStore();
    store.getState().startDelete("wt-1", { force: true, deleteBranch: true });
    await flushPromises();
    await flushPromises();

    expect(closeTerminalsForWorktreeMock).not.toHaveBeenCalled();
    expect(worktreeClientDeleteMock).toHaveBeenCalledWith("wt-1", true, true);
  });

  it("on success, deletingIds and error maps are cleared by applyRemove", async () => {
    const store = createWorktreeStore();
    store.getState().applySnapshot([makeSnapshot("wt-1")], nextV());

    store.getState().startDelete("wt-1", { force: false });
    expect(store.getState().deletingIds.has("wt-1")).toBe(true);

    await flushPromises();
    await flushPromises();

    // Simulating the worktree-removed event handler invoking applyRemove.
    store.getState().applyRemove("wt-1", nextV());

    expect(store.getState().deletingIds.has("wt-1")).toBe(false);
    expect(store.getState().deleteErrors.has("wt-1")).toBe(false);
    expect(store.getState().deleteErrorArgs.has("wt-1")).toBe(false);
    expect(store.getState().worktrees.has("wt-1")).toBe(false);
  });

  it("on failure, deletingIds is cleared and deleteErrors records the message", async () => {
    worktreeClientDeleteMock.mockRejectedValueOnce(new Error("git error: unmerged paths"));

    const store = createWorktreeStore();
    store.getState().applySnapshot([makeSnapshot("wt-1")], nextV());

    store.getState().startDelete("wt-1", { force: false });
    await flushPromises();
    await flushPromises();

    expect(store.getState().deletingIds.has("wt-1")).toBe(false);
    expect(store.getState().deleteErrors.get("wt-1")).toContain("git error: unmerged paths");
    expect(store.getState().deleteErrorArgs.get("wt-1")).toEqual({ force: false });
  });

  it("retryDelete re-fires with the stored args", async () => {
    worktreeClientDeleteMock.mockRejectedValueOnce(new Error("first fail"));

    const store = createWorktreeStore();
    store.getState().applySnapshot([makeSnapshot("wt-1")], nextV());

    store.getState().startDelete("wt-1", { force: true, deleteBranch: true });
    await flushPromises();
    await flushPromises();

    expect(store.getState().deleteErrors.has("wt-1")).toBe(true);
    worktreeClientDeleteMock.mockResolvedValueOnce();

    store.getState().retryDelete("wt-1");

    expect(store.getState().deletingIds.has("wt-1")).toBe(true);
    expect(store.getState().deleteErrors.has("wt-1")).toBe(false);
    await flushPromises();
    await flushPromises();

    expect(worktreeClientDeleteMock).toHaveBeenCalledTimes(2);
    expect(worktreeClientDeleteMock).toHaveBeenLastCalledWith("wt-1", true, true);
  });

  it("retryDelete with no stored args is a no-op", () => {
    const store = createWorktreeStore();
    store.getState().retryDelete("wt-1");
    expect(store.getState().deletingIds.has("wt-1")).toBe(false);
    expect(worktreeClientDeleteMock).not.toHaveBeenCalled();
  });

  it("clearDeleteError purges error and stored args without touching deletingIds", async () => {
    worktreeClientDeleteMock.mockRejectedValueOnce(new Error("boom"));

    const store = createWorktreeStore();
    store.getState().startDelete("wt-1", { force: false });
    await flushPromises();
    await flushPromises();

    expect(store.getState().deleteErrors.has("wt-1")).toBe(true);

    store.getState().clearDeleteError("wt-1");

    expect(store.getState().deleteErrors.has("wt-1")).toBe(false);
    expect(store.getState().deleteErrorArgs.has("wt-1")).toBe(false);
  });

  it("worktree-removed arriving before failure aborts the error write (race guard)", async () => {
    let rejectIpc: (reason: unknown) => void = () => {};
    worktreeClientDeleteMock.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectIpc = reject;
        })
    );

    const store = createWorktreeStore();
    store.getState().applySnapshot([makeSnapshot("wt-1")], nextV());

    store.getState().startDelete("wt-1", { force: false });
    await flushPromises();

    // Simulate `worktree-removed` arriving before the IPC rejection — common
    // when the backend removed the worktree but the bridge is still resolving
    // a stale promise.
    store.getState().applyRemove("wt-1", nextV());

    expect(store.getState().deletingIds.has("wt-1")).toBe(false);
    expect(store.getState().worktrees.has("wt-1")).toBe(false);

    rejectIpc(new Error("late fail"));
    await flushPromises();
    await flushPromises();

    // The error must NOT have been written — the worktree is gone, so a
    // dangling error entry would never be rendered or cleared.
    expect(store.getState().deleteErrors.has("wt-1")).toBe(false);
    expect(store.getState().deleteErrorArgs.has("wt-1")).toBe(false);
  });

  it("applyRemove still works for worktrees with no in-flight delete (no regression)", () => {
    const store = createWorktreeStore();
    store.getState().applySnapshot([makeSnapshot("wt-1")], nextV());

    store.getState().applyRemove("wt-1", nextV());

    expect(store.getState().worktrees.has("wt-1")).toBe(false);
  });
});
