// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const setActiveWorktreeMock = vi.hoisted(() => vi.fn());
const setPendingReviewHubWorktreeIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/store/worktreeStore", () => ({
  useWorktreeSelectionStore: { getState: () => ({ setActiveWorktree: setActiveWorktreeMock }) },
}));

vi.mock("@/store/uiStore", () => ({
  useUIStore: {
    getState: () => ({ setPendingReviewHubWorktreeId: setPendingReviewHubWorktreeIdMock }),
  },
}));

vi.mock("@/store/createWorktreeStore", () => ({
  getCurrentViewStore: () => ({
    getState: () => ({ worktrees: new Map() }),
  }),
}));

vi.mock("@/clients", () => ({
  copyTreeClient: { generateAndCopyFile: vi.fn() },
  systemClient: { openPath: vi.fn() },
}));

vi.mock("@/services/ActionService", () => ({
  actionService: { dispatch: vi.fn() },
}));

import type { ActionContext } from "@shared/types/actions";
import type { ActionRegistry, ActionCallbacks } from "../../actionTypes";
import { registerWorktreeContextActions } from "../worktreeContextActions";

function getAction() {
  const actions: ActionRegistry = new Map();
  const callbacks = { onInject: vi.fn() } as unknown as ActionCallbacks;
  registerWorktreeContextActions(actions, callbacks);
  const factory = actions.get("worktree.openReviewHub");
  if (!factory) throw new Error("worktree.openReviewHub is not registered");
  return factory();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("worktree.openReviewHub", () => {
  it("registers a renderer-scoped command action", () => {
    const action = getAction();
    expect(action.id).toBe("worktree.openReviewHub");
    expect(action.kind).toBe("command");
    expect(action.danger).toBe("safe");
    expect(action.scope).toBe("renderer");
  });

  it("accepts an optional worktreeId argument", () => {
    const action = getAction();
    expect(action.argsSchema).toBeDefined();
    expect(() => action.argsSchema!.parse({ worktreeId: "wt-1" })).not.toThrow();
    expect(() => action.argsSchema!.parse({})).not.toThrow();
    expect(() => action.argsSchema!.parse(undefined)).not.toThrow();
  });

  it("activates the worktree and sets the pending Review Hub signal with explicit worktreeId", async () => {
    const action = getAction();
    await action.run({ worktreeId: "wt-1" }, {} as ActionContext);

    expect(setActiveWorktreeMock).toHaveBeenCalledWith("wt-1");
    expect(setPendingReviewHubWorktreeIdMock).toHaveBeenCalledWith("wt-1");
  });

  it("falls back to focusedWorktreeId then activeWorktreeId", async () => {
    const action = getAction();
    await action.run(undefined, {
      focusedWorktreeId: "wt-focus",
      activeWorktreeId: "wt-active",
    } as ActionContext);

    expect(setActiveWorktreeMock).toHaveBeenCalledWith("wt-focus");
    expect(setPendingReviewHubWorktreeIdMock).toHaveBeenCalledWith("wt-focus");
  });

  it("falls back to activeWorktreeId when no focused worktree is set", async () => {
    const action = getAction();
    await action.run(undefined, { activeWorktreeId: "wt-active" } as ActionContext);

    expect(setActiveWorktreeMock).toHaveBeenCalledWith("wt-active");
    expect(setPendingReviewHubWorktreeIdMock).toHaveBeenCalledWith("wt-active");
  });

  it("no-ops when no worktreeId can be resolved", async () => {
    const action = getAction();
    await action.run(undefined, {} as ActionContext);

    expect(setActiveWorktreeMock).not.toHaveBeenCalled();
    expect(setPendingReviewHubWorktreeIdMock).not.toHaveBeenCalled();
  });
});
