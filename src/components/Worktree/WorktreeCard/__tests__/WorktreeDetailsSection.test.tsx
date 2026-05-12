/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { WorktreeState } from "@/types";
import type { WorktreeChanges } from "@shared/types/git";
import type { ComputedSubtitle } from "../hooks/useWorktreeStatus";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  WorktreeDetailsSection,
  type WorktreeDetailsSectionProps,
} from "../WorktreeDetailsSection";

const mockAnimate = vi.fn();
let mockReducedMotion = false;

vi.mock("framer-motion", () => {
  const MotionDiv = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => (
      <div ref={ref} {...props}>
        {children}
      </div>
    )
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    LazyMotion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    domAnimation: {},
    domMax: {},
    m: { div: MotionDiv },
    motion: { div: MotionDiv },
    useAnimate: () => [{ current: null } as unknown as React.RefObject<HTMLElement>, mockAnimate],
    useReducedMotion: () => mockReducedMotion,
  };
});

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return { ...actual, createPortal: (children: ReactNode) => children };
});

vi.mock("@/services/ActionService", () => ({
  actionService: { dispatch: vi.fn() },
}));

const noop = () => {};
const noopAsync = async () => {};

const baseWorktree: WorktreeState = {
  id: "test-wt",
  worktreeId: "test-wt",
  path: "/tmp/test-wt",
  name: "test-branch",
  branch: "feature/test",
  isCurrent: false,
  isMainWorktree: false,
  worktreeChanges: {
    worktreeId: "test-wt",
    changedFileCount: 3,
    insertions: 5,
    deletions: 2,
    changes: [],
    rootPath: "",
  },
  lastActivityTimestamp: null,
};

const baseSubtitle: ComputedSubtitle = { text: "3 files changed", tone: "muted" };

const baseProps: WorktreeDetailsSectionProps = {
  worktree: baseWorktree,
  isExpanded: false,
  hasChanges: true,
  computedSubtitle: baseSubtitle,
  worktreeErrors: [],
  isFocused: false,
  onToggleExpand: noop,
  onPathClick: noop,
  onDismissError: noop,
  onRetryError: noopAsync,
};

function withChanges(overrides: Partial<WorktreeChanges>): WorktreeState {
  return {
    ...baseWorktree,
    worktreeChanges: { ...baseWorktree.worktreeChanges, ...overrides } as WorktreeChanges,
  };
}

function renderSection(overrides: Partial<WorktreeDetailsSectionProps> = {}) {
  return render(
    <TooltipProvider>
      <WorktreeDetailsSection {...baseProps} {...overrides} />
    </TooltipProvider>
  );
}

describe("WorktreeDetailsSection count pill bump", () => {
  beforeEach(() => {
    mockAnimate.mockClear();
    mockReducedMotion = false;
    delete document.body.dataset.performanceMode;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders file count without calling animate on initial mount", () => {
    renderSection();
    expect(screen.getByText(/3 files/)).toBeDefined();
    expect(mockAnimate).not.toHaveBeenCalled();
  });

  it("calls animate when changedFileCount changes after mount", () => {
    const { rerender } = renderSection();

    const updated = withChanges({ changedFileCount: 5, insertions: 10, deletions: 3 });

    rerender(
      <TooltipProvider>
        <WorktreeDetailsSection {...baseProps} worktree={updated} />
      </TooltipProvider>
    );

    expect(mockAnimate).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/5 files/)).toBeDefined();
  });

  it("coalesces rapid changes within 200ms gate", () => {
    const { rerender } = renderSection();

    const first = withChanges({ changedFileCount: 5, insertions: 10, deletions: 3 });
    const second = withChanges({ changedFileCount: 7, insertions: 12, deletions: 5 });
    const third = withChanges({ changedFileCount: 9, insertions: 15, deletions: 8 });

    rerender(
      <TooltipProvider>
        <WorktreeDetailsSection {...baseProps} worktree={first} />
      </TooltipProvider>
    );
    rerender(
      <TooltipProvider>
        <WorktreeDetailsSection {...baseProps} worktree={second} />
      </TooltipProvider>
    );
    rerender(
      <TooltipProvider>
        <WorktreeDetailsSection {...baseProps} worktree={third} />
      </TooltipProvider>
    );

    expect(mockAnimate).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/9 files/)).toBeDefined();
  });

  it("re-arms bump after throttle window expires", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = renderSection();

      const first = withChanges({ changedFileCount: 5, insertions: 10, deletions: 3 });

      rerender(
        <TooltipProvider>
          <WorktreeDetailsSection {...baseProps} worktree={first} />
        </TooltipProvider>
      );
      expect(mockAnimate).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(250);

      const second = withChanges({ changedFileCount: 7, insertions: 12, deletions: 5 });

      rerender(
        <TooltipProvider>
          <WorktreeDetailsSection {...baseProps} worktree={second} />
        </TooltipProvider>
      );

      expect(mockAnimate).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips animation when reduced motion is preferred", () => {
    mockReducedMotion = true;
    const { rerender } = renderSection();

    const updated = withChanges({ changedFileCount: 5, insertions: 10, deletions: 3 });

    rerender(
      <TooltipProvider>
        <WorktreeDetailsSection {...baseProps} worktree={updated} />
      </TooltipProvider>
    );

    expect(mockAnimate).not.toHaveBeenCalled();
    expect(screen.getByText(/5 files/)).toBeDefined();
  });

  it("does not bump when reduced motion toggles off without a count change", () => {
    mockReducedMotion = true;
    const { rerender } = renderSection();

    mockReducedMotion = false;
    rerender(
      <TooltipProvider>
        <WorktreeDetailsSection {...baseProps} />
      </TooltipProvider>
    );

    expect(mockAnimate).not.toHaveBeenCalled();
  });

  it("keeps the count span DOM node stable across changes", () => {
    const { rerender } = renderSection();
    const firstNode = screen.getByText(/3 files/);

    const updated = withChanges({ changedFileCount: 5, insertions: 10, deletions: 3 });

    rerender(
      <TooltipProvider>
        <WorktreeDetailsSection {...baseProps} worktree={updated} />
      </TooltipProvider>
    );

    const secondNode = screen.getByText(/5 files/);
    expect(firstNode).toBe(secondNode);
  });

  it("does not bump when changedFileCount stays the same", () => {
    const { rerender } = renderSection();
    expect(mockAnimate).not.toHaveBeenCalled();

    rerender(
      <TooltipProvider>
        <WorktreeDetailsSection {...baseProps} />
      </TooltipProvider>
    );

    expect(mockAnimate).not.toHaveBeenCalled();
  });

  it("does not animate when expanded (count span not rendered)", () => {
    const { rerender } = renderSection({ isExpanded: false });

    const updated = withChanges({ changedFileCount: 5, insertions: 10, deletions: 3 });

    rerender(
      <TooltipProvider>
        <WorktreeDetailsSection {...baseProps} isExpanded={true} worktree={updated} />
      </TooltipProvider>
    );

    expect(mockAnimate).not.toHaveBeenCalled();
  });

  it("does not animate when count span not rendered, then allows bump after collapse", () => {
    const { rerender } = renderSection({ isExpanded: true });

    const collapsed = withChanges({ changedFileCount: 5, insertions: 10, deletions: 3 });

    rerender(
      <TooltipProvider>
        <WorktreeDetailsSection {...baseProps} isExpanded={false} worktree={collapsed} />
      </TooltipProvider>
    );

    expect(mockAnimate).toHaveBeenCalledTimes(1);
  });

  it("skips animation in performance mode", () => {
    document.body.dataset.performanceMode = "true";
    const { rerender } = renderSection();

    const updated = withChanges({ changedFileCount: 5, insertions: 10, deletions: 3 });

    rerender(
      <TooltipProvider>
        <WorktreeDetailsSection {...baseProps} worktree={updated} />
      </TooltipProvider>
    );

    expect(mockAnimate).not.toHaveBeenCalled();
    expect(screen.getByText(/5 files/)).toBeDefined();
  });
});

describe("WorktreeDetailsSection — reviewState surfaces", () => {
  it('replaces churn subtitle with conflict callout when reviewState is "conflicted"', () => {
    renderSection({
      reviewState: "conflicted",
      worktree: withChanges({
        changedFileCount: 4,
        changes: [{ path: "a.ts", status: "conflicted", insertions: null, deletions: null }],
      }),
    });
    expect(screen.getByText("Conflicts need review")).toBeDefined();
    expect(screen.queryByText(/files/)).toBeNull();
  });

  it("renders the Commit & push button when there are changes", () => {
    const onCommitAndPush = vi.fn();
    renderSection({
      reviewState: "has-changes",
      onCommitAndPush,
    });
    const button = screen.getByLabelText("Commit and push");
    expect(button).toBeDefined();
    fireEvent.click(button);
    expect(onCommitAndPush).toHaveBeenCalledTimes(1);
  });

  it("renders the Commit & push button even when no AI note is present", () => {
    renderSection({
      reviewState: "has-changes",
      onCommitAndPush: vi.fn(),
    });
    // The composer dialog now collects the message, so the button must show
    // whenever there are changes — even without a prefilled message source.
    expect(screen.queryByLabelText("Commit and push")).not.toBeNull();
  });

  it('hides the Commit & push button when reviewState is "conflicted"', () => {
    renderSection({
      reviewState: "conflicted",
      onCommitAndPush: vi.fn(),
      worktree: withChanges({
        changedFileCount: 2,
        changes: [{ path: "a.ts", status: "conflicted", insertions: null, deletions: null }],
      }),
    });
    expect(screen.queryByLabelText("Commit and push")).toBeNull();
  });

  it("swaps the button for a spinner while committing", () => {
    renderSection({
      reviewState: "has-changes",
      onCommitAndPush: vi.fn(),
      isCommitting: true,
    });
    expect(screen.queryByLabelText("Commit and push")).toBeNull();
    expect(screen.getByLabelText("Committing and pushing")).toBeDefined();
  });

  it("renders an inline error banner with commitError", () => {
    renderSection({
      reviewState: "has-changes",
      onCommitAndPush: vi.fn(),
      commitError: "Couldn't push to remote",
      clearCommitError: vi.fn(),
      onOpenReviewHub: vi.fn(),
    });
    expect(screen.getByText("Couldn't push to remote")).toBeDefined();
    expect(screen.getByText("Open review hub")).toBeDefined();
  });

  it("invokes clearCommitError and onOpenReviewHub from the banner CTA", () => {
    const clearCommitError = vi.fn();
    const onOpenReviewHub = vi.fn();
    renderSection({
      reviewState: "has-changes",
      onCommitAndPush: vi.fn(),
      commitError: "Couldn't push to remote",
      clearCommitError,
      onOpenReviewHub,
    });
    fireEvent.click(screen.getByText("Open review hub"));
    expect(clearCommitError).toHaveBeenCalledTimes(1);
    expect(onOpenReviewHub).toHaveBeenCalledTimes(1);
  });

  it("dismisses the banner via the Dismiss button", () => {
    const clearCommitError = vi.fn();
    renderSection({
      reviewState: "has-changes",
      commitError: "Couldn't push to remote",
      clearCommitError,
    });
    fireEvent.click(screen.getByLabelText("Dismiss error"));
    expect(clearCommitError).toHaveBeenCalledTimes(1);
  });

  it('does not render Commit & push or conflict callout when reviewState is "unpushed-clean"', () => {
    renderSection({
      reviewState: "unpushed-clean",
      hasChanges: false,
      onCommitAndPush: vi.fn(),
      computedSubtitle: { text: "fix: stuff", tone: "muted" },
      worktree: {
        ...baseWorktree,
        worktreeChanges: {
          ...baseWorktree.worktreeChanges,
          changedFileCount: 0,
          ahead: 2,
        } as WorktreeChanges,
      },
    });
    expect(screen.queryByLabelText("Commit and push")).toBeNull();
    expect(screen.queryByText("Conflicts need review")).toBeNull();
    expect(screen.getByText("fix: stuff")).toBeDefined();
  });

  it("hides the error banner when expanded", () => {
    renderSection({
      isExpanded: true,
      reviewState: "has-changes",
      commitError: "Couldn't push to remote",
      clearCommitError: vi.fn(),
    });
    expect(screen.queryByText("Couldn't push to remote")).toBeNull();
  });
});

describe("WorktreeDetailsSection activity indicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z").getTime());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders 'No activity' placeholder when lastActivityTimestamp is null", () => {
    const worktree: WorktreeState = { ...baseWorktree, lastActivityTimestamp: null };
    renderSection({ worktree, hasChanges: false });
    expect(screen.getByText("No activity")).toBeDefined();
  });

  it("renders the activity dot and time ago when timestamp is present", () => {
    const worktree: WorktreeState = {
      ...baseWorktree,
      lastActivityTimestamp: Date.now(),
    };
    renderSection({ worktree, hasChanges: false });
    expect(screen.queryByText("No activity")).toBeNull();
    // LiveTimeAgo renders "now" for a just-now timestamp
    expect(screen.getByText("now")).toBeDefined();
  });

  it("renders hollow ring and time label for decayed timestamp", () => {
    const worktree: WorktreeState = {
      ...baseWorktree,
      lastActivityTimestamp: Date.now() - 120_000, // 2 minutes ago — past DECAY_DURATION (90s)
    };
    renderSection({ worktree, hasChanges: false });
    expect(screen.queryByText("No activity")).toBeNull();
    // LiveTimeAgo renders a time label like "2m"
    expect(screen.getByText("2m")).toBeDefined();
  });

  it("collapsed view shows 'No activity' when expanded view shows worktree details without activity section", () => {
    // The expanded view (WorktreeDetails) already gates the activity section
    // on showTime && lastActivityTimestamp (line 81). Verify the collapsed
    // view handles the null case distinctly.
    const worktree: WorktreeState = { ...baseWorktree, lastActivityTimestamp: null };
    renderSection({ worktree, hasChanges: false });
    expect(screen.getByText("No activity")).toBeDefined();
  });

  it("null timestamp worktree does not render an ActivityLight dot", () => {
    const worktree: WorktreeState = { ...baseWorktree, lastActivityTimestamp: null };
    const { container } = renderSection({ worktree, hasChanges: false });
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
