/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

vi.mock("@/components/ui/Spinner", () => ({
  Spinner: () => <span data-testid="spinner" />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    "aria-disabled": ariaDisabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    "aria-disabled"?: boolean;
  }) => (
    <button type="button" onClick={onClick} aria-disabled={ariaDisabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({
    isOpen,
    title,
    children,
    onConfirm,
    onClose,
    confirmLabel,
  }: {
    isOpen: boolean;
    title: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    onConfirm: () => void;
    onClose?: () => void;
    confirmLabel: string;
  }) => {
    if (!isOpen) return null;
    return (
      <div role="alertdialog" data-testid="protected-confirm-dialog">
        <div data-testid="confirm-title">{title}</div>
        {children && <div data-testid="confirm-body">{children}</div>}
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        {onClose && (
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        )}
      </div>
    );
  },
}));

import { CommitPanel } from "../CommitPanel";

interface RenderProps {
  currentBranch?: string | null;
  hasRemote?: boolean;
  commitMessage?: string;
  onCommitAndPush?: (message: string) => Promise<void>;
}

function renderPanel(overrides: RenderProps = {}) {
  const onCommitAndPush = overrides.onCommitAndPush ?? vi.fn().mockResolvedValue(undefined);
  render(
    <CommitPanel
      stagedCount={1}
      isDetachedHead={false}
      hasConflicts={false}
      hasRemote={overrides.hasRemote ?? true}
      worktreePath="/repo"
      currentBranch={overrides.currentBranch ?? "feature/x"}
      commitMessage={overrides.commitMessage ?? "fix: bug"}
      onCommitMessageChange={vi.fn()}
      onCommit={vi.fn().mockResolvedValue(undefined)}
      onCommitAndPush={onCommitAndPush}
      isPushing={false}
      pushProgress={new Map()}
      pushTargetBranch={null}
    />
  );
  return { onCommitAndPush };
}

describe("CommitPanel — protected-branch confirm", () => {
  beforeEach(() => {
    Object.defineProperty(window, "electron", {
      value: { git: { listCommits: vi.fn().mockResolvedValue({ items: [] }) } },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("on a feature branch, calls onCommitAndPush directly without confirm", () => {
    const { onCommitAndPush } = renderPanel({ currentBranch: "feature/x" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    expect(onCommitAndPush).toHaveBeenCalledWith("fix: bug");
    expect(screen.queryByTestId("protected-confirm-dialog")).toBeNull();
  });

  it("on a protected branch ('main'), opens the ConfirmDialog instead of pushing", () => {
    const { onCommitAndPush } = renderPanel({ currentBranch: "main" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    expect(onCommitAndPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("protected-confirm-dialog")).toBeDefined();
  });

  it("confirming the protected-branch dialog calls onCommitAndPush", () => {
    const { onCommitAndPush } = renderPanel({ currentBranch: "develop" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    expect(onCommitAndPush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Push to develop/ }));
    expect(onCommitAndPush).toHaveBeenCalledWith("fix: bug");
  });

  it("cancelling the protected-branch dialog does not call onCommitAndPush", () => {
    const { onCommitAndPush } = renderPanel({ currentBranch: "main" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCommitAndPush).not.toHaveBeenCalled();
    expect(screen.queryByTestId("protected-confirm-dialog")).toBeNull();
  });

  it("normalizes mixed-case protected branch names ('Main', 'DEVELOP')", () => {
    const { onCommitAndPush } = renderPanel({ currentBranch: "Main" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    expect(onCommitAndPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("protected-confirm-dialog")).toBeDefined();
    cleanup();

    const second = renderPanel({ currentBranch: "DEVELOP" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    expect(second.onCommitAndPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("protected-confirm-dialog")).toBeDefined();
  });

  it("treats 'master' and 'development' as protected", () => {
    const first = renderPanel({ currentBranch: "master" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    expect(first.onCommitAndPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("protected-confirm-dialog")).toBeDefined();
    cleanup();

    const second = renderPanel({ currentBranch: "development" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    expect(second.onCommitAndPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("protected-confirm-dialog")).toBeDefined();
  });

  it("shows the commit message preview inside the confirm dialog body", () => {
    renderPanel({ currentBranch: "main", commitMessage: "chore: bump deps\n\nBody line" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    const body = screen.getByTestId("confirm-body");
    expect(body.textContent).toContain("chore: bump deps");
    expect(body.textContent).toContain("Body line");
  });
});
