/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { FileChangeDetail } from "@shared/types/git";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

vi.mock("@/components/ui/AppDialog", () => {
  const Dialog = ({
    children,
    isOpen,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
    onClose?: () => void;
    size?: string;
    dismissible?: boolean;
    maxHeight?: string;
    variant?: string;
    "data-testid"?: string;
  }) => (isOpen ? <div data-testid="commit-composer-dialog">{children}</div> : null);
  Dialog.Header = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Dialog.Title = ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>;
  Dialog.CloseButton = () => <button aria-label="Close dialog">×</button>;
  Dialog.Body = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Dialog.Footer = ({
    primaryAction,
    secondaryAction,
  }: {
    primaryAction?: {
      label: string;
      onClick: () => void;
      disabled?: boolean;
      loading?: boolean;
    };
    secondaryAction?: { label: string; onClick: () => void; disabled?: boolean };
    hint?: React.ReactNode;
  }) => (
    <div>
      {secondaryAction && (
        <button onClick={secondaryAction.onClick} disabled={secondaryAction.disabled}>
          {secondaryAction.label}
        </button>
      )}
      {primaryAction && (
        <button
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled || primaryAction.loading}
        >
          {primaryAction.label}
        </button>
      )}
    </div>
  );
  return { AppDialog: Dialog };
});

vi.mock("@/components/Worktree/DiffViewer", () => ({
  DiffViewer: ({ diff }: { diff: string }) => <div data-testid="mock-diff-viewer">{diff}</div>,
}));

vi.mock("@/components/Worktree/FileChangeList", () => ({
  FileChangeList: ({ changes }: { changes: FileChangeDetail[] }) => (
    <ul data-testid="mock-file-list">
      {changes.map((c) => (
        <li key={c.path}>{c.path}</li>
      ))}
    </ul>
  ),
}));

vi.mock("@/hooks/useDeferredLoading", () => ({
  // Make the loading skeleton appear synchronously in tests
  useDeferredLoading: (isPending: boolean) => isPending,
}));

vi.mock("@/services/ActionService", () => ({
  actionService: { dispatch: vi.fn() },
}));

import { CommitComposerDialog, type CommitComposerDialogProps } from "../CommitComposerDialog";

const baseProps: CommitComposerDialogProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  isSubmitting: false,
  commitMessage: "",
  onCommitMessageChange: vi.fn(),
  branch: "feature/x",
  tracking: "origin/feature/x",
  changes: [
    {
      path: "src/a.ts",
      status: "modified",
      insertions: 3,
      deletions: 1,
    },
  ],
  rootPath: "/repo",
  diff: "diff --git a/src/a.ts b/src/a.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n",
  isDiffLoading: false,
  diffError: null,
  submitError: null,
};

function makeProps(overrides: Partial<CommitComposerDialogProps> = {}): CommitComposerDialogProps {
  return { ...baseProps, ...overrides };
}

describe("CommitComposerDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders nothing when closed", () => {
    render(<CommitComposerDialog {...makeProps({ isOpen: false })} />);
    expect(screen.queryByTestId("commit-composer-dialog")).toBeNull();
  });

  it("renders with an empty textarea when no commit message is provided", () => {
    render(<CommitComposerDialog {...makeProps({ commitMessage: "" })} />);
    const textarea = screen.getByLabelText("Commit message") as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("displays the prefilled commit message (e.g. from an AI note)", () => {
    render(<CommitComposerDialog {...makeProps({ commitMessage: "fix(thing): do X" })} />);
    const textarea = screen.getByLabelText("Commit message") as HTMLTextAreaElement;
    expect(textarea.value).toBe("fix(thing): do X");
  });

  it("disables the submit button when the message is empty", () => {
    render(<CommitComposerDialog {...makeProps({ commitMessage: "" })} />);
    const submit = screen.getByRole("button", { name: /Commit & push/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("disables the submit button when the message is whitespace only", () => {
    render(<CommitComposerDialog {...makeProps({ commitMessage: "   " })} />);
    const submit = screen.getByRole("button", { name: /Commit & push/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("enables the submit button with a non-empty message on a non-protected branch", () => {
    render(<CommitComposerDialog {...makeProps({ commitMessage: "fix: bug" })} />);
    const submit = screen.getByRole("button", { name: /Commit & push/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it("calls onConfirm with the trimmed message on submit", () => {
    const onConfirm = vi.fn();
    render(<CommitComposerDialog {...makeProps({ commitMessage: "  fix: bug  ", onConfirm })} />);
    fireEvent.click(screen.getByRole("button", { name: /Commit & push/ }));
    expect(onConfirm).toHaveBeenCalledWith("fix: bug");
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<CommitComposerDialog {...makeProps({ onClose })} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onConfirm or any git mutation when Cancel is clicked", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <CommitComposerDialog {...makeProps({ commitMessage: "fix: bug", onConfirm, onClose })} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("propagates textarea edits via onCommitMessageChange", () => {
    const onCommitMessageChange = vi.fn();
    render(
      <CommitComposerDialog {...makeProps({ commitMessage: "fix:", onCommitMessageChange })} />
    );
    const textarea = screen.getByLabelText("Commit message");
    fireEvent.change(textarea, { target: { value: "fix: thing" } });
    expect(onCommitMessageChange).toHaveBeenCalledWith("fix: thing");
  });

  it("on a protected branch, shows a warning and gates submit behind the 'I understand' checkbox", () => {
    const { container } = render(
      <CommitComposerDialog
        {...makeProps({
          branch: "develop",
          tracking: "origin/develop",
          commitMessage: "chore: bump",
        })}
      />
    );

    // Warning copy mentioning the protected branch
    expect(container.textContent).toContain("Committing directly to");
    expect(container.textContent).toContain("develop");

    const submit = screen.getByRole("button", { name: /Commit & push/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    expect(submit.disabled).toBe(false);
  });

  it("treats main and master as protected branches", () => {
    const mainRender = render(
      <CommitComposerDialog {...makeProps({ branch: "main", commitMessage: "x" })} />
    );
    expect(mainRender.container.textContent).toContain("Committing directly to");
    expect(
      (screen.getByRole("button", { name: /Commit & push/ }) as HTMLButtonElement).disabled
    ).toBe(true);

    cleanup();

    render(<CommitComposerDialog {...makeProps({ branch: "master", commitMessage: "x" })} />);
    expect(
      (screen.getByRole("button", { name: /Commit & push/ }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("does not show a protected-branch warning on a feature branch", () => {
    const { container } = render(
      <CommitComposerDialog
        {...makeProps({
          branch: "feature/whatever",
          commitMessage: "feat: x",
        })}
      />
    );
    expect(container.textContent).not.toContain("Committing directly to");
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("renders the diff when loaded", () => {
    render(<CommitComposerDialog {...makeProps({ commitMessage: "x" })} />);
    expect(screen.getByTestId("mock-diff-viewer")).toBeDefined();
  });

  it("shows a loading skeleton while the diff is loading", () => {
    render(
      <CommitComposerDialog
        {...makeProps({ isDiffLoading: true, diff: null, commitMessage: "x" })}
      />
    );
    expect(screen.getByLabelText("Loading diff")).toBeDefined();
    expect(screen.queryByTestId("mock-diff-viewer")).toBeNull();
  });

  it("renders a diff-error message instead of the diff viewer when diffError is set", () => {
    render(
      <CommitComposerDialog
        {...makeProps({
          diff: null,
          diffError: "EPERM: read denied",
          commitMessage: "fix: x",
        })}
      />
    );
    expect(screen.getByText(/Couldn't load diff preview/)).toBeDefined();
    expect(screen.queryByTestId("mock-diff-viewer")).toBeNull();
    // The user can still commit
    expect(
      (screen.getByRole("button", { name: /Commit & push/ }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it("displays the tracked file count in the header", () => {
    const changes: FileChangeDetail[] = [
      { path: "a.ts", status: "modified", insertions: 1, deletions: 0 },
      { path: "b.ts", status: "added", insertions: 1, deletions: 0 },
      { path: "untracked.txt", status: "untracked", insertions: null, deletions: null },
    ];
    const { container } = render(
      <CommitComposerDialog {...makeProps({ changes, commitMessage: "x" })} />
    );
    // Header shows tracked-only count (2 of 3)
    expect(container.textContent).toContain("2 files tracked");
  });

  it("shows a submit-error banner when submitError is set", () => {
    render(
      <CommitComposerDialog
        {...makeProps({ submitError: "Couldn't push to remote", commitMessage: "x" })}
      />
    );
    expect(screen.getByText("Couldn't push to remote")).toBeDefined();
  });

  it("disables submit and cancel while isSubmitting", () => {
    render(
      <CommitComposerDialog {...makeProps({ isSubmitting: true, commitMessage: "fix: x" })} />
    );
    expect(
      (screen.getByRole("button", { name: /Commit & push/ }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
});
