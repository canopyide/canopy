// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const suppressMock = vi.hoisted(() => vi.fn());
const getPanelStateMock = vi.hoisted(() => vi.fn());
const getWorktreeSelectionStateMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/terminal/TerminalInstanceService", () => ({
  terminalInstanceService: {
    suppressResizesDuringLayoutTransition: suppressMock,
  },
}));

vi.mock("@/store/panelStore", () => ({
  usePanelStore: { getState: getPanelStateMock },
}));

vi.mock("@/store/worktreeStore", () => ({
  useWorktreeSelectionStore: { getState: getWorktreeSelectionStateMock },
}));

import { gatedSidebarToggle } from "../sidebarToggle";
import { SIDEBAR_TOGGLE_LOCK_MS } from "../terminalLayout";

type PanelFixture = {
  id: string;
  location: "grid" | "dock";
  worktreeId: string | null;
};

function setup(panels: PanelFixture[], activeWorktreeId: string | null) {
  getPanelStateMock.mockReturnValue({
    panelIds: panels.map((p) => p.id),
    panelsById: Object.fromEntries(panels.map((p) => [p.id, p])),
  });
  getWorktreeSelectionStateMock.mockReturnValue({ activeWorktreeId });
}

describe("gatedSidebarToggle", () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatchSpy = vi.spyOn(window, "dispatchEvent");
  });

  it("suppresses resizes for grid panels of the active worktree", () => {
    setup(
      [
        { id: "p-1", location: "grid", worktreeId: "wt-a" },
        { id: "p-2", location: "grid", worktreeId: "wt-a" },
      ],
      "wt-a"
    );

    gatedSidebarToggle();

    expect(suppressMock).toHaveBeenCalledTimes(1);
    expect(suppressMock).toHaveBeenCalledWith(["p-1", "p-2"], SIDEBAR_TOGGLE_LOCK_MS);
  });

  it("excludes dock panels from the suppression set", () => {
    setup(
      [
        { id: "p-grid", location: "grid", worktreeId: "wt-a" },
        { id: "p-dock", location: "dock", worktreeId: "wt-a" },
      ],
      "wt-a"
    );

    gatedSidebarToggle();

    expect(suppressMock).toHaveBeenCalledWith(["p-grid"], SIDEBAR_TOGGLE_LOCK_MS);
  });

  it("excludes panels belonging to other worktrees", () => {
    setup(
      [
        { id: "p-active", location: "grid", worktreeId: "wt-a" },
        { id: "p-other", location: "grid", worktreeId: "wt-b" },
      ],
      "wt-a"
    );

    gatedSidebarToggle();

    expect(suppressMock).toHaveBeenCalledWith(["p-active"], SIDEBAR_TOGGLE_LOCK_MS);
  });

  it("dispatches the daintree:toggle-focus-mode event", () => {
    setup([], "wt-a");

    gatedSidebarToggle();

    const events: Event[] = dispatchSpy.mock.calls.map((args: unknown[]) => args[0] as Event);
    const toggle = events.find((e: Event) => e.type === "daintree:toggle-focus-mode");
    expect(toggle).toBeDefined();
  });

  it("still dispatches the toggle event when there are no grid panels", () => {
    setup([{ id: "p-dock", location: "dock", worktreeId: "wt-a" }], "wt-a");

    gatedSidebarToggle();

    expect(suppressMock).toHaveBeenCalledWith([], SIDEBAR_TOGGLE_LOCK_MS);
    const events: Event[] = dispatchSpy.mock.calls.map((args: unknown[]) => args[0] as Event);
    expect(events.some((e: Event) => e.type === "daintree:toggle-focus-mode")).toBe(true);
  });
});
