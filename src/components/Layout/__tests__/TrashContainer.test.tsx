// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { TrashContainer } from "../TrashContainer";
import { useAnnouncerStore } from "@/store/accessibilityAnnouncerStore";
import { UI_TRANSIENT_HINT_DWELL_MS } from "@/lib/animationUtils";
import type { TerminalInstance } from "@/store";
import type { TrashedTerminal } from "@/store/slices";

// jsdom does not ship AnimationEvent.
if (typeof AnimationEvent === "undefined") {
  (globalThis as Record<string, unknown>).AnimationEvent = class AnimationEvent extends Event {
    constructor(type: string, init?: EventInit) {
      super(type, init);
    }
  };
}

const dndMocks = vi.hoisted(() => ({
  isDragging: false,
  isWorktreeSortDragging: false,
  isOver: false,
}));

vi.mock("@/hooks/useWorktrees", () => ({
  useWorktrees: () => ({ worktreeMap: new Map() }),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: { children: React.ReactNode } & React.HTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/tooltip", () => ({
  // Only the controlled (open-prop-driven) Tooltip — i.e. the trash hint —
  // gets a testable wrapper. Uncontrolled Tooltips inside child components
  // (TrashBinItem actions) stay transparent.
  Tooltip: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open !== undefined ? (
      <div data-testid="trash-hint-tooltip" data-open={open ? "true" : "false"}>
        {children}
      </div>
    ) : (
      <>{children}</>
    ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@dnd-kit/core", () => ({
  useDroppable: () => ({ setNodeRef: () => {}, isOver: dndMocks.isOver }),
}));

vi.mock("@/components/DragDrop", () => ({
  useIsDragging: () => dndMocks.isDragging,
  useIsWorktreeSortDragging: () => dndMocks.isWorktreeSortDragging,
  TRASH_DROPPABLE_ID: "__trash-droppable__",
}));

// TrashGroupItem pulls in panel/worktree stores and the second-ticker — mock
// it to a minimal shape so we can assert TrashContainer's display-ordering
// logic and prop-passing without the heavy dependency surface.
vi.mock("../TrashGroupItem", () => ({
  TrashGroupItem: ({
    groupRestoreId,
    earliestExpiry,
  }: {
    groupRestoreId: string;
    earliestExpiry: number;
  }) => (
    <div data-testid={`trash-group-item-${groupRestoreId}`} data-earliest={String(earliestExpiry)}>
      GROUP {groupRestoreId}
    </div>
  ),
}));

function makeTrashedItem(
  id: string,
  expiresAt: number = Date.now() + 10_000
): {
  terminal: TerminalInstance;
  trashedInfo: TrashedTerminal;
} {
  return {
    terminal: { id, title: `Terminal ${id}` } as TerminalInstance,
    trashedInfo: {
      id,
      expiresAt,
      originalLocation: "grid",
    },
  };
}

function makeGroupAnchor(
  id: string,
  groupRestoreId: string,
  expiresAt: number
): { terminal: TerminalInstance; trashedInfo: TrashedTerminal } {
  return {
    terminal: { id, title: `Terminal ${id}` } as TerminalInstance,
    trashedInfo: {
      id,
      expiresAt,
      originalLocation: "grid",
      groupRestoreId,
      groupMetadata: {
        panelIds: [id],
        activeTabId: id,
        location: "grid",
        worktreeId: null,
      },
    },
  };
}

function makeGroupMember(
  id: string,
  groupRestoreId: string,
  expiresAt: number
): { terminal: TerminalInstance; trashedInfo: TrashedTerminal } {
  return {
    terminal: { id, title: `Terminal ${id}` } as TerminalInstance,
    trashedInfo: {
      id,
      expiresAt,
      originalLocation: "grid",
      groupRestoreId,
    },
  };
}

describe("TrashContainer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAnnouncerStore.setState({ polite: null, assertive: null });
    dndMocks.isDragging = false;
    dndMocks.isWorktreeSortDragging = false;
    dndMocks.isOver = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not render when trashedTerminals is empty and not dragging", () => {
    const { container } = render(<TrashContainer trashedTerminals={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders ghosted drop pill when empty and a drag is active", () => {
    dndMocks.isDragging = true;
    const { getByTestId } = render(<TrashContainer trashedTerminals={[]} />);
    const ghost = getByTestId("trash-container-ghost");
    expect(ghost).not.toBeNull();
    expect(ghost.textContent).toContain("Trash (drop to delete)");
    expect(ghost.getAttribute("aria-hidden")).toBe("true");
    expect(ghost.getAttribute("tabindex")).toBe("-1");
  });

  it("does not render ghost pill in compact mode label, but still mounts the icon", () => {
    dndMocks.isDragging = true;
    const { getByTestId } = render(<TrashContainer trashedTerminals={[]} compact />);
    const ghost = getByTestId("trash-container-ghost");
    expect(ghost).not.toBeNull();
    expect(ghost.textContent).not.toContain("Trash (drop to delete)");
  });

  it("applies armed isOver classes on ghost pill, not accent", () => {
    dndMocks.isDragging = true;
    dndMocks.isOver = true;
    const { getByTestId } = render(<TrashContainer trashedTerminals={[]} />);
    const ghost = getByTestId("trash-container-ghost");
    expect(ghost.className).toContain("bg-overlay-soft");
    expect(ghost.className).toContain("ring-border-default");
    expect(ghost.className).toContain("cursor-copy");
    expect(ghost.className).not.toContain("daintree-accent");
  });

  it("applies armed isOver classes on the real pill when dragged onto", () => {
    dndMocks.isDragging = true;
    dndMocks.isOver = true;
    const { getByTestId } = render(<TrashContainer trashedTerminals={[makeTrashedItem("1")]} />);
    const pill = getByTestId("trash-container");
    expect(pill.className).toContain("bg-overlay-soft");
    expect(pill.className).toContain("ring-border-default");
    expect(pill.className).toContain("cursor-copy");
    expect(pill.className).not.toContain("daintree-accent");
  });

  it("does not render ghost pill during worktree-sort drags", () => {
    dndMocks.isDragging = true;
    dndMocks.isWorktreeSortDragging = true;
    const { container } = render(<TrashContainer trashedTerminals={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("does not pulse on initial mount", () => {
    const { container } = render(<TrashContainer trashedTerminals={[makeTrashedItem("1")]} />);
    expect(container.querySelector(".animate-trash-pulse")).toBeNull();
  });

  it("applies pulse class when trashedTerminals.length increases", () => {
    const items = [makeTrashedItem("1")];
    const { container, rerender } = render(<TrashContainer trashedTerminals={items} />);

    const newItems = [...items, makeTrashedItem("2")];
    rerender(<TrashContainer trashedTerminals={newItems} />);

    expect(container.querySelector(".animate-trash-pulse")).not.toBeNull();
  });

  it("removes pulse class via safety timeout after the animation completes", () => {
    const items = [makeTrashedItem("1")];
    const { container, rerender } = render(<TrashContainer trashedTerminals={items} />);

    rerender(<TrashContainer trashedTerminals={[...items, makeTrashedItem("2")]} />);
    expect(container.querySelector(".animate-trash-pulse")).not.toBeNull();

    // Advance past the 250ms safety timeout (DURATION_200 + 50). In jsdom
    // `animationend` doesn't fire via dispatchEvent, so the safety timeout
    // is the testable cleanup path — same as AgentStatusIndicator.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.querySelector(".animate-trash-pulse")).toBeNull();
  });

  it("does not pulse when trashedTerminals.length decreases", () => {
    const items = [makeTrashedItem("1"), makeTrashedItem("2")];
    const { container, rerender } = render(<TrashContainer trashedTerminals={items} />);

    rerender(<TrashContainer trashedTerminals={[items[0]!]} />);
    expect(container.querySelector(".animate-trash-pulse")).toBeNull();
  });

  it("announces panel closed with correct shortcut on increase", () => {
    const items = [makeTrashedItem("1")];
    const { rerender } = render(<TrashContainer trashedTerminals={items} />);

    rerender(<TrashContainer trashedTerminals={[...items, makeTrashedItem("2")]} />);

    const { polite } = useAnnouncerStore.getState();
    expect(polite).not.toBeNull();
    expect(polite!.msg).toMatch(/Panel closed/);
    expect(polite!.msg).toMatch(/Shift\+T/);
  });

  it("does not announce when trashedTerminals.length decreases", () => {
    const items = [makeTrashedItem("1"), makeTrashedItem("2")];
    const { rerender } = render(<TrashContainer trashedTerminals={items} />);

    useAnnouncerStore.setState({ polite: null });
    rerender(<TrashContainer trashedTerminals={[items[0]!]} />);

    expect(useAnnouncerStore.getState().polite).toBeNull();
  });

  it("clears pulse when count decreases while pulsing", () => {
    const items = [makeTrashedItem("1")];
    const { container, rerender } = render(<TrashContainer trashedTerminals={items} />);

    // Trigger pulse
    rerender(<TrashContainer trashedTerminals={[...items, makeTrashedItem("2")]} />);
    expect(container.querySelector(".animate-trash-pulse")).not.toBeNull();

    // Restore a panel (count decreases) before timeout
    rerender(<TrashContainer trashedTerminals={[items[0]!]} />);
    expect(container.querySelector(".animate-trash-pulse")).toBeNull();
  });

  it("restarts pulse on rapid successive increases", () => {
    const items = [makeTrashedItem("1")];
    const { container, rerender } = render(<TrashContainer trashedTerminals={items} />);

    // First increase
    rerender(<TrashContainer trashedTerminals={[...items, makeTrashedItem("2")]} />);
    expect(container.querySelector(".animate-trash-pulse")).not.toBeNull();

    // Second increase before timeout — class already present, stays alive.
    rerender(
      <TrashContainer trashedTerminals={[...items, makeTrashedItem("2"), makeTrashedItem("3")]} />
    );
    expect(container.querySelector(".animate-trash-pulse")).not.toBeNull();

    // Safety timeout from the second trigger clears the pulse.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.querySelector(".animate-trash-pulse")).toBeNull();
  });

  it("caps the 'Moved to trash' hint after three shows", () => {
    const items = [makeTrashedItem("1")];
    const { getByTestId, rerender } = render(<TrashContainer trashedTerminals={items} />);

    // Closes 1, 2, 3: hint shows each time. Advance past dwell between closes
    // so the previous hint clears and we can assert a fresh open=true.
    const next = [...items];
    for (let i = 2; i <= 4; i++) {
      next.push(makeTrashedItem(String(i)));
      rerender(<TrashContainer trashedTerminals={next} />);
      expect(getByTestId("trash-hint-tooltip").getAttribute("data-open")).toBe("true");
      act(() => {
        vi.advanceTimersByTime(UI_TRANSIENT_HINT_DWELL_MS + 10);
      });
      expect(getByTestId("trash-hint-tooltip").getAttribute("data-open")).toBe("false");
    }

    // Close 4: cap reached, hint must not re-open.
    next.push(makeTrashedItem("5"));
    rerender(<TrashContainer trashedTerminals={next} />);
    expect(getByTestId("trash-hint-tooltip").getAttribute("data-open")).toBe("false");
  });

  it("continues announcing on every close after the hint cap is reached", () => {
    const items = [makeTrashedItem("1")];
    const { rerender } = render(<TrashContainer trashedTerminals={items} />);

    // Burn through the cap (3 closes), advancing dwell between each.
    const next = [...items];
    for (let i = 2; i <= 4; i++) {
      next.push(makeTrashedItem(String(i)));
      rerender(<TrashContainer trashedTerminals={next} />);
      act(() => {
        vi.advanceTimersByTime(UI_TRANSIENT_HINT_DWELL_MS + 10);
      });
    }

    // Clear announcer and trigger a post-cap close — aria-live must still fire.
    useAnnouncerStore.setState({ polite: null });
    next.push(makeTrashedItem("post-cap"));
    rerender(<TrashContainer trashedTerminals={next} />);

    const { polite } = useAnnouncerStore.getState();
    expect(polite).not.toBeNull();
    expect(polite!.msg).toMatch(/Panel closed/);
  });

  it("renders items in LIFO order (newest-trashed first)", () => {
    const older = makeTrashedItem("older", 1_000);
    const newer = makeTrashedItem("newer", 5_000);
    const { container } = render(<TrashContainer trashedTerminals={[older, newer]} />);

    const text = container.textContent ?? "";
    const newerIdx = text.indexOf("Terminal newer");
    const olderIdx = text.indexOf("Terminal older");
    expect(newerIdx).toBeGreaterThanOrEqual(0);
    expect(olderIdx).toBeGreaterThanOrEqual(0);
    expect(newerIdx).toBeLessThan(olderIdx);
  });

  it("sorts groups by latestExpiry, not earliestExpiry, when interleaved with singles", () => {
    // Group's members span expiry [1000, 9000]. A single sits at 5000.
    // LIFO must use the group's latestExpiry (9000) so the group comes first.
    const anchor = makeGroupAnchor("g-a", "grp", 1_000);
    const member = makeGroupMember("g-b", "grp", 9_000);
    const single = makeTrashedItem("solo", 5_000);
    const { container } = render(<TrashContainer trashedTerminals={[anchor, member, single]} />);

    const text = container.textContent ?? "";
    const groupIdx = text.indexOf("GROUP grp");
    const singleIdx = text.indexOf("Terminal solo");
    expect(groupIdx).toBeGreaterThanOrEqual(0);
    expect(singleIdx).toBeGreaterThanOrEqual(0);
    expect(groupIdx).toBeLessThan(singleIdx);
  });

  it("passes earliestExpiry (not latestExpiry) to TrashGroupItem for the countdown", () => {
    const anchor = makeGroupAnchor("g-a", "grp", 1_000);
    const member = makeGroupMember("g-b", "grp", 9_000);
    const { getByTestId } = render(<TrashContainer trashedTerminals={[anchor, member]} />);

    // The countdown displayed by TrashGroupItem must use the soonest-to-expire
    // member; the sortKey/LIFO change must not bleed into this prop.
    expect(getByTestId("trash-group-item-grp").getAttribute("data-earliest")).toBe("1000");
  });
});
