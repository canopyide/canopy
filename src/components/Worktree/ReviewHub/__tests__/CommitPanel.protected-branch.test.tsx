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
    description,
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
      <div role="alertdialog" data-testid="push-confirm-dialog">
        <div data-testid="confirm-title">{title}</div>
        {description && <div data-testid="confirm-description">{description}</div>}
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
  skipPushConfirm?: boolean;
  onCommitAndPush?: (message: string) => Promise<void>;
  onSetSkipPushConfirm?: (value: boolean) => void;
}

function renderPanel(overrides: RenderProps = {}) {
  const onCommitAndPush = overrides.onCommitAndPush ?? vi.fn().mockResolvedValue(undefined);
  const onSetSkipPushConfirm = overrides.onSetSkipPushConfirm ?? vi.fn();
  // Use `in` so callers can explicitly pass `currentBranch: null` to test the
  // missing-branch path — `??` would coalesce null to the default.
  const currentBranch =
    "currentBranch" in overrides ? (overrides.currentBranch ?? null) : "feature/x";
  render(
    <CommitPanel
      stagedCount={1}
      isDetachedHead={false}
      hasConflicts={false}
      hasRemote={overrides.hasRemote ?? true}
      worktreePath="/repo"
      currentBranch={currentBranch}
      commitMessage={overrides.commitMessage ?? "fix: bug"}
      onCommitMessageChange={vi.fn()}
      onCommit={vi.fn().mockResolvedValue(undefined)}
      onCommitAndPush={onCommitAndPush}
      isPushing={false}
      pushProgress={new Map()}
      pushTargetBranch={null}
      skipPushConfirm={overrides.skipPushConfirm ?? false}
      onSetSkipPushConfirm={onSetSkipPushConfirm}
    />
  );
  return { onCommitAndPush, onSetSkipPushConfirm };
}

describe("CommitPanel — push confirm", () => {
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

  it("on a feature branch, opens the ConfirmDialog instead of pushing immediately", () => {
    const { onCommitAndPush } = renderPanel({ currentBranch: "feature/x" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    expect(onCommitAndPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("push-confirm-dialog")).toBeDefined();
  });

  it("on a protected branch ('main'), opens the ConfirmDialog instead of pushing", () => {
    const { onCommitAndPush } = renderPanel({ currentBranch: "main" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    expect(onCommitAndPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("push-confirm-dialog")).toBeDefined();
  });

  it("confirming the dialog calls onCommitAndPush", () => {
    const { onCommitAndPush } = renderPanel({ currentBranch: "develop" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    expect(onCommitAndPush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Push to develop/ }));
    expect(onCommitAndPush).toHaveBeenCalledWith("fix: bug");
  });

  it("cancelling the dialog does not call onCommitAndPush", () => {
    const { onCommitAndPush } = renderPanel({ currentBranch: "main" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCommitAndPush).not.toHaveBeenCalled();
    expect(screen.queryByTestId("push-confirm-dialog")).toBeNull();
  });

  it("shows the commit message preview inside the confirm dialog body", () => {
    renderPanel({ currentBranch: "main", commitMessage: "chore: bump deps\n\nBody line" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    const message = screen.getByTestId("commit-panel-push-confirm-message");
    expect(message.textContent).toContain("chore: bump deps");
    expect(message.textContent).toContain("Body line");
  });

  it("shows the target-branch pill with the current branch name", () => {
    renderPanel({ currentBranch: "feature/my-thing" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    const pill = screen.getByTestId("commit-panel-push-confirm-branch");
    expect(pill.textContent).toBe("feature/my-thing");
  });

  it("warns about protected branches in the description copy", () => {
    renderPanel({ currentBranch: "main" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    const description = screen.getByTestId("confirm-description");
    expect(description.textContent).toContain("protected branch");
  });

  it("uses a simpler description for non-protected branches", () => {
    renderPanel({ currentBranch: "feature/x" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    const description = screen.getByTestId("confirm-description");
    expect(description.textContent).not.toContain("protected branch");
    expect(description.textContent).toContain("Review your commit message");
  });

  it("when skipPushConfirm is true, pushes directly without opening the dialog", () => {
    const { onCommitAndPush, onSetSkipPushConfirm } = renderPanel({
      currentBranch: "feature/x",
      skipPushConfirm: true,
    });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    expect(onCommitAndPush).toHaveBeenCalledWith("fix: bug");
    expect(screen.queryByTestId("push-confirm-dialog")).toBeNull();
    expect(onSetSkipPushConfirm).not.toHaveBeenCalled();
  });

  it("confirming with the 'don't ask again' checkbox checked calls onSetSkipPushConfirm(true)", () => {
    const { onCommitAndPush, onSetSkipPushConfirm } = renderPanel({ currentBranch: "feature/x" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    const checkbox = screen.getByTestId("commit-panel-push-confirm-dont-ask") as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Push to feature\/x/ }));
    expect(onSetSkipPushConfirm).toHaveBeenCalledWith(true);
    expect(onCommitAndPush).toHaveBeenCalledWith("fix: bug");
  });

  it("confirming without checking the box calls onSetSkipPushConfirm(false)", () => {
    const { onSetSkipPushConfirm } = renderPanel({ currentBranch: "feature/x" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    fireEvent.click(screen.getByRole("button", { name: /Push to feature\/x/ }));
    expect(onSetSkipPushConfirm).toHaveBeenCalledWith(false);
  });

  it("cancelling after checking the box does NOT call onSetSkipPushConfirm", () => {
    const { onSetSkipPushConfirm } = renderPanel({ currentBranch: "feature/x" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    fireEvent.click(screen.getByTestId("commit-panel-push-confirm-dont-ask"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSetSkipPushConfirm).not.toHaveBeenCalled();
  });

  it("resets the 'don't ask again' checkbox after the dialog closes via cancel", () => {
    renderPanel({ currentBranch: "feature/x" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    fireEvent.click(screen.getByTestId("commit-panel-push-confirm-dont-ask"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    const checkbox = screen.getByTestId("commit-panel-push-confirm-dont-ask") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it("normalizes mixed-case protected branch names ('Main', 'DEVELOP') for the warning copy", () => {
    renderPanel({ currentBranch: "Main" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    expect(screen.getByTestId("confirm-description").textContent).toContain("protected branch");
    cleanup();

    renderPanel({ currentBranch: "DEVELOP" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    expect(screen.getByTestId("confirm-description").textContent).toContain("protected branch");
  });

  it("treats 'master' and 'development' as protected for the warning copy", () => {
    renderPanel({ currentBranch: "master" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    expect(screen.getByTestId("confirm-description").textContent).toContain("protected branch");
    cleanup();

    renderPanel({ currentBranch: "development" });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    expect(screen.getByTestId("confirm-description").textContent).toContain("protected branch");
  });

  it("with hasRemote=false, does not open the dialog (no push to confirm)", () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const onCommitAndPush = vi.fn().mockResolvedValue(undefined);
    render(
      <CommitPanel
        stagedCount={1}
        isDetachedHead={false}
        hasConflicts={false}
        hasRemote={false}
        worktreePath="/repo"
        currentBranch="feature/x"
        commitMessage="fix: bug"
        onCommitMessageChange={vi.fn()}
        onCommit={onCommit}
        onCommitAndPush={onCommitAndPush}
        isPushing={false}
        pushProgress={new Map()}
        pushTargetBranch={null}
        skipPushConfirm={false}
        onSetSkipPushConfirm={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Commit \(/ }));
    expect(onCommit).toHaveBeenCalledWith("fix: bug");
    expect(onCommitAndPush).not.toHaveBeenCalled();
    expect(screen.queryByTestId("push-confirm-dialog")).toBeNull();
  });

  it("Cmd+Enter on the textarea routes through the confirm gate", () => {
    const { onCommitAndPush } = renderPanel({ currentBranch: "feature/x" });
    const textarea = screen.getByPlaceholderText(/Commit message/);
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    expect(onCommitAndPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("push-confirm-dialog")).toBeDefined();
  });

  it("with currentBranch=null, the dialog opens and confirming fires push exactly once", () => {
    const { onCommitAndPush } = renderPanel({ currentBranch: null });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    const dialog = screen.getByTestId("push-confirm-dialog");
    expect(dialog).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Push to branch/ }));
    expect(onCommitAndPush).toHaveBeenCalledTimes(1);
    expect(onCommitAndPush).toHaveBeenCalledWith("fix: bug");
  });

  it("persists the opt-out even when the push call rejects", () => {
    const onCommitAndPush = vi.fn().mockRejectedValue(new Error("network"));
    const { onSetSkipPushConfirm } = renderPanel({
      currentBranch: "feature/x",
      onCommitAndPush,
    });
    fireEvent.click(screen.getByRole("button", { name: /Commit & Push/ }));
    fireEvent.click(screen.getByTestId("commit-panel-push-confirm-dont-ask"));
    fireEvent.click(screen.getByRole("button", { name: /Push to feature\/x/ }));
    expect(onSetSkipPushConfirm).toHaveBeenCalledWith(true);
    // The push attempt itself was made.
    expect(onCommitAndPush).toHaveBeenCalledWith("fix: bug");
  });
});
