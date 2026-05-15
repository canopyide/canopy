/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import type { GitHubIssue, GitHubPR } from "@shared/types/github";

const openBulkCreateDialog = vi.fn();
const openBulkCreateDialogForPRs = vi.fn();

vi.mock("@/store/worktreeStore", () => ({
  useWorktreeSelectionStore: (selector: (s: unknown) => unknown) =>
    selector({ openBulkCreateDialog, openBulkCreateDialogForPRs }),
}));

vi.mock("framer-motion", () => {
  const MotionDiv = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & {
      exit?: Record<string, unknown>;
      initial?: Record<string, unknown>;
      animate?: Record<string, unknown>;
      transition?: unknown;
    }
  >(({ children, exit, initial, animate, transition, ...rest }, ref) => (
    <div
      ref={ref}
      data-exit={exit ? JSON.stringify(exit) : undefined}
      data-animate={animate ? JSON.stringify(animate) : undefined}
      {...rest}
    >
      {children}
    </div>
  ));
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    m: { div: MotionDiv },
    motion: { div: MotionDiv },
  };
});

import { BulkActionBar } from "../BulkActionBar";

const makeIssue = (n: number): GitHubIssue => ({
  number: n,
  title: `Issue #${n}`,
  url: `https://github.com/test/repo/issues/${n}`,
  state: "OPEN",
  updatedAt: "2026-01-01",
  author: { login: "user", avatarUrl: "" },
  assignees: [],
  commentCount: 0,
});

const makePR = (n: number): GitHubPR => ({
  number: n,
  title: `PR #${n}`,
  url: `https://github.com/test/repo/pull/${n}`,
  state: "OPEN",
  isDraft: false,
  updatedAt: "2026-01-02",
  author: { login: "user", avatarUrl: "" },
});

beforeEach(() => {
  openBulkCreateDialog.mockReset();
  openBulkCreateDialogForPRs.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("BulkActionBar", () => {
  it("renders when issue selection is non-empty", () => {
    render(
      <BulkActionBar
        mode="issue"
        selectedIssues={[makeIssue(1), makeIssue(2)]}
        selectedPRs={[]}
        selectedCount={2}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByRole("toolbar", { name: /bulk actions/i })).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("does not render when selection is empty", () => {
    render(
      <BulkActionBar
        mode="issue"
        selectedIssues={[]}
        selectedPRs={[]}
        selectedCount={0}
        onClear={vi.fn()}
      />
    );

    expect(screen.queryByRole("toolbar", { name: /bulk actions/i })).toBeNull();
  });

  it("disables pointer events on the exiting bar to prevent dead-click during exit animation", () => {
    render(
      <BulkActionBar
        mode="issue"
        selectedIssues={[makeIssue(1)]}
        selectedPRs={[]}
        selectedCount={1}
        onClear={vi.fn()}
      />
    );

    const toolbar = screen.getByRole("toolbar", { name: /bulk actions/i });
    const exitProp = toolbar.getAttribute("data-exit");
    expect(exitProp).toBeTruthy();
    const exit = JSON.parse(exitProp!) as Record<string, unknown>;
    expect(exit.pointerEvents).toBe("none");
  });

  it("restores pointer events in the animate variant so re-entry isn't hit-test dead", () => {
    // Without this, framer-motion never clears the inline style written by
    // the exit variant — in production builds the bar can come back visually
    // visible while the X button stays unclickable.
    render(
      <BulkActionBar
        mode="issue"
        selectedIssues={[makeIssue(1)]}
        selectedPRs={[]}
        selectedCount={1}
        onClear={vi.fn()}
      />
    );

    const toolbar = screen.getByRole("toolbar", { name: /bulk actions/i });
    const animateProp = toolbar.getAttribute("data-animate");
    expect(animateProp).toBeTruthy();
    const animate = JSON.parse(animateProp!) as Record<string, unknown>;
    expect(animate.pointerEvents).toBe("auto");
  });

  it("calls onClear when the X button is clicked", () => {
    const onClear = vi.fn();
    render(
      <BulkActionBar
        mode="issue"
        selectedIssues={[makeIssue(1)]}
        selectedPRs={[]}
        selectedCount={1}
        onClear={onClear}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /clear selection/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("opens bulk-create dialog with issues in issue mode", () => {
    const onClear = vi.fn();
    const issues = [makeIssue(1), makeIssue(2)];
    render(
      <BulkActionBar
        mode="issue"
        selectedIssues={issues}
        selectedPRs={[]}
        selectedCount={2}
        onClear={onClear}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /create worktrees/i }));
    expect(openBulkCreateDialog).toHaveBeenCalledWith(issues, onClear);
    expect(openBulkCreateDialogForPRs).not.toHaveBeenCalled();
  });

  it("opens bulk-create dialog with PRs in PR mode and uses PR count", () => {
    const onClear = vi.fn();
    const prs = [makePR(10), makePR(11), makePR(12)];
    render(
      <BulkActionBar
        mode="pr"
        selectedIssues={[makeIssue(99)]}
        selectedPRs={prs}
        selectedCount={3}
        onClear={onClear}
      />
    );

    expect(screen.getByText("3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /create worktrees/i }));
    expect(openBulkCreateDialogForPRs).toHaveBeenCalledWith(prs, onClear);
    expect(openBulkCreateDialog).not.toHaveBeenCalled();
  });

  it("invokes onCloseDropdown after opening the dialog", () => {
    const onCloseDropdown = vi.fn();
    render(
      <BulkActionBar
        mode="issue"
        selectedIssues={[makeIssue(1)]}
        selectedPRs={[]}
        selectedCount={1}
        onClear={vi.fn()}
        onCloseDropdown={onCloseDropdown}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /create worktrees/i }));
    expect(onCloseDropdown).toHaveBeenCalledTimes(1);
  });
});
