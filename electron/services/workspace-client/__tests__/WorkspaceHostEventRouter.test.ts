import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceHostEventRouter } from "../WorkspaceHostEventRouter.js";
import type { WorkspaceHostEvent } from "../../../../shared/types/workspace-host.js";
import type { ProcessEntry, CopyTreeProgressCallback } from "../types.js";
import type { WorkspaceHostProcess } from "../../WorkspaceHostProcess.js";

vi.mock("../../../ipc/utils.js", () => ({
  broadcastToRenderer: vi.fn(),
}));

vi.mock("../../events.js", () => ({
  events: { emit: vi.fn() },
}));

vi.mock("../../github/index.js", () => ({
  gitHubRateLimitService: { applyRemoteState: vi.fn() },
}));

import { broadcastToRenderer } from "../../../ipc/utils.js";
import { events } from "../../events.js";

function makeEntry(overrides: Partial<ProcessEntry> = {}): ProcessEntry {
  return {
    host: {
      generateRequestId: () => "r",
      send: vi.fn(),
      sendWithResponse: vi.fn(),
      dispose: vi.fn(),
    } as unknown as WorkspaceHostProcess,
    refCount: 1,
    initPromise: Promise.resolve(),
    currentReadyPromise: Promise.resolve(),
    cleanupTimeout: null,
    windowIds: new Set(),
    projectPath: "/project/test",
    directPortViews: new Map(),
    ...overrides,
  };
}

function makeWorktreeUpdateEvent(
  overrides: Record<string, unknown> = {}
): Extract<WorkspaceHostEvent, { type: "worktree-update" }> {
  return {
    type: "worktree-update",
    worktree: {
      id: "wt-1",
      path: "/project/test",
      name: "test-worktree",
      isCurrent: true,
      worktreeId: "wt-1",
      ...overrides,
    },
    epoch: "550e8400-e29b-41d4-a716-446655440000",
    seq: 1,
  };
}

describe("WorkspaceHostEventRouter", () => {
  let router: WorkspaceHostEventRouter;
  let copyTreeCallbacks: Map<string, CopyTreeProgressCallback>;

  beforeEach(() => {
    vi.clearAllMocks();
    copyTreeCallbacks = new Map();
    router = new WorkspaceHostEventRouter({
      emit: vi.fn(),
      worktreePathToProject: new Map(),
      copyTreeProgressCallbacks: copyTreeCallbacks,
    });
  });

  describe("inotify-limit-reached dedup", () => {
    it("fires toast on first emit", () => {
      const entry = makeEntry();
      router.routeHostEvent(entry, { type: "inotify-limit-reached" });

      expect(broadcastToRenderer).toHaveBeenCalledTimes(1);
      expect(broadcastToRenderer).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ type: "warning" })
      );
    });

    it("suppresses duplicate toasts from subsequent hosts", () => {
      const entryA = makeEntry({ projectPath: "/a" });
      const entryB = makeEntry({ projectPath: "/b" });

      router.routeHostEvent(entryA, { type: "inotify-limit-reached" });
      router.routeHostEvent(entryB, { type: "inotify-limit-reached" });

      expect(broadcastToRenderer).toHaveBeenCalledTimes(1);
    });

    it("suppresses duplicate toasts from the same host", () => {
      const entry = makeEntry();

      router.routeHostEvent(entry, { type: "inotify-limit-reached" });
      router.routeHostEvent(entry, { type: "inotify-limit-reached" });

      expect(broadcastToRenderer).toHaveBeenCalledTimes(1);
    });
  });

  describe("emfile-limit-reached dedup", () => {
    it("fires toast on first emit", () => {
      const entry = makeEntry();
      router.routeHostEvent(entry, { type: "emfile-limit-reached" });

      expect(broadcastToRenderer).toHaveBeenCalledTimes(1);
      expect(broadcastToRenderer).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ type: "warning" })
      );
    });

    it("suppresses duplicate toasts from subsequent hosts", () => {
      const entryA = makeEntry({ projectPath: "/a" });
      const entryB = makeEntry({ projectPath: "/b" });

      router.routeHostEvent(entryA, { type: "emfile-limit-reached" });
      router.routeHostEvent(entryB, { type: "emfile-limit-reached" });

      expect(broadcastToRenderer).toHaveBeenCalledTimes(1);
    });
  });

  describe("inotify and emfile are independent", () => {
    it("allows both limit types to fire independently", () => {
      const entry = makeEntry();

      router.routeHostEvent(entry, { type: "inotify-limit-reached" });
      router.routeHostEvent(entry, { type: "emfile-limit-reached" });

      expect(broadcastToRenderer).toHaveBeenCalledTimes(2);
    });
  });

  describe("sys:worktree:update", () => {
    it("emits the full worktree object directly", () => {
      const entry = makeEntry();
      const event = makeWorktreeUpdateEvent({ branch: "feature/foo", prTitle: "My PR" });

      router.routeHostEvent(entry, event);

      expect(events.emit).toHaveBeenCalledWith("sys:worktree:update", event.worktree);
    });
  });
});
