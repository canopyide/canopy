/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { StagingStatus } from "@shared/types";
import type { WorktreeState } from "@shared/types";

const {
  getStagingStatusMock,
  onUpdateMock,
  debounceCancelSpy,
  compareWorktreesMock,
  openPRMock,
  abortRepositoryOperationMock,
  continueRepositoryOperationMock,
  scanConflictMarkersMock,
  checkoutOursTheirsMock,
  openInEditorMock,
  stageFileMock,
  commitMock,
  pushMock,
  pullRebaseMock,
  forcePushWithLeaseMock,
  listRemoteCommitsMock,
  listCommitsMock,
  actionDispatchMock,
  worktreeStoreData,
} = vi.hoisted(() => ({
  getStagingStatusMock: vi.fn(),
  onUpdateMock: vi.fn(),
  debounceCancelSpy: vi.fn(),
  compareWorktreesMock: vi.fn(),
  openPRMock: vi.fn().mockResolvedValue(undefined),
  abortRepositoryOperationMock: vi.fn().mockResolvedValue(undefined),
  continueRepositoryOperationMock: vi.fn().mockResolvedValue(undefined),
  scanConflictMarkersMock: vi.fn().mockResolvedValue([]),
  checkoutOursTheirsMock: vi.fn().mockResolvedValue(undefined),
  openInEditorMock: vi.fn().mockResolvedValue(undefined),
  stageFileMock: vi.fn().mockResolvedValue(undefined),
  commitMock: vi.fn(),
  pushMock: vi.fn(),
  pullRebaseMock: vi.fn(),
  forcePushWithLeaseMock: vi.fn(),
  listRemoteCommitsMock: vi.fn(),
  listCommitsMock: vi.fn().mockResolvedValue({ items: [], hasMore: false, total: 0 }),
  actionDispatchMock: vi.fn().mockResolvedValue({ ok: true }),
  worktreeStoreData: {
    current: new Map<string, Partial<WorktreeState>>([
      [
        "main-wt",
        {
          id: "main-wt",
          path: "/home/user/project",
          name: "main",
          branch: "main",
          isMainWorktree: true,
          isCurrent: false,
          worktreeId: "main-wt",
          worktreeChanges: null,
          lastActivityTimestamp: null,
        },
      ],
    ]),
  },
}));

vi.mock("@/utils/debounce", () => ({
  debounce: (fn: (...args: unknown[]) => void) => {
    const immediate = (...args: unknown[]) => fn(...args);
    immediate.cancel = debounceCancelSpy;
    immediate.flush = vi.fn();
    return immediate;
  },
}));

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return { ...actual, createPortal: (children: ReactNode) => children };
});

vi.mock("@/hooks", () => ({
  useOverlayState: vi.fn(),
  useTruncationDetection: vi.fn(() => ({ ref: vi.fn(), isTruncated: false })),
}));

const { fileDiffModalOpenHistory } = vi.hoisted(() => ({
  fileDiffModalOpenHistory: { value: [] as boolean[] },
}));
vi.mock("../../FileDiffModal", () => ({
  FileDiffModal: ({ isOpen }: { isOpen: boolean }) => {
    fileDiffModalOpenHistory.value.push(isOpen);
    return null;
  },
}));
vi.mock("../BaseBranchDiffModal", () => ({ BaseBranchDiffModal: () => null }));

vi.mock("@/hooks/useWorktreeStore", () => ({
  useWorktreeStore: (selector: (state: { worktrees: Map<string, WorktreeState> }) => unknown) =>
    selector({ worktrees: worktreeStoreData.current as Map<string, WorktreeState> }),
}));

vi.mock("@/clients/githubClient", () => ({
  githubClient: { openPR: openPRMock },
}));

vi.mock("@/services/ActionService", () => ({
  actionService: { dispatch: actionDispatchMock },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    "aria-disabled": ariaDisabled,
    "aria-label": ariaLabel,
    "data-testid": testId,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-disabled"?: boolean;
    variant?: string;
    size?: string;
    className?: string;
    "aria-label"?: string;
    "data-testid"?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={ariaDisabled}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/split-button", () => ({
  SplitButton: ({
    primaryLabel,
    primaryIcon,
    onPrimaryClick,
    menuItems,
    ariaDisabled,
    disabledReason,
    isBusy,
  }: {
    primaryLabel: string;
    primaryIcon?: ReactNode;
    onPrimaryClick: () => void;
    menuItems: { label: string; icon?: ReactNode; shortcut?: string; onClick: () => void }[];
    ariaDisabled?: boolean;
    disabledReason?: ReactNode;
    isBusy?: boolean;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <div data-testid="split-button">
      <button
        type="button"
        onClick={onPrimaryClick}
        aria-disabled={ariaDisabled}
        data-testid="split-button-primary"
      >
        {primaryIcon}
        {primaryLabel}
      </button>
      <button
        type="button"
        aria-label="More commit actions"
        aria-disabled={ariaDisabled}
        data-testid="split-button-chevron"
      >
        v
      </button>
      {disabledReason && ariaDisabled && (
        <div data-testid="split-button-tooltip">{disabledReason}</div>
      )}
      <div data-testid="split-button-menu">
        {menuItems.map((item) => (
          <button
            type="button"
            key={item.label}
            onClick={item.onClick}
            disabled={ariaDisabled || isBusy}
            data-testid={`split-button-menu-item-${item.label}`}
          >
            {item.label}
            {item.shortcut && <span>{item.shortcut}</span>}
          </button>
        ))}
      </div>
    </div>
  ),
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
    cancelLabel,
  }: {
    isOpen: boolean;
    title: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    onConfirm: () => void;
    onClose?: () => void;
    confirmLabel: string;
    cancelLabel?: string;
    variant: "default" | "destructive" | "info";
  }) => {
    if (!isOpen) return null;
    return (
      <div role="alertdialog" aria-label={typeof title === "string" ? title : "confirm"}>
        <div>{title}</div>
        {description && <div>{description}</div>}
        {children && <div>{children}</div>}
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        {onClose && (
          <button type="button" onClick={onClose}>
            {cancelLabel ?? "Cancel"}
          </button>
        )}
      </div>
    );
  },
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children, asChild }: { children: ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <button type="button">{children}</button>,
  DropdownMenuContent: ({
    children,
    align: _align,
    className: _className,
  }: {
    children: ReactNode;
    align?: string;
    className?: string;
  }) => <div role="menu">{children}</div>,
  DropdownMenuRadioGroup: ({
    children,
    value,
    onValueChange: _onValueChange,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => <div data-value={value}>{children}</div>,
  DropdownMenuRadioItem: ({ children, value: _value }: { children: ReactNode; value: string }) => (
    <div role="menuitemradio">{children}</div>
  ),
  DropdownMenuCheckboxItem: ({
    children,
    checked,
    onCheckedChange,
  }: {
    children: ReactNode;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <div
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className="cursor-pointer"
    >
      {children}
    </div>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock("@/components/ui/EmptyState", () => ({
  EmptyState: ({
    variant,
    title,
    action,
  }: {
    variant: string;
    title: string;
    action?: ReactNode;
  }) => (
    <div data-testid={`empty-state-${variant}`}>
      <p>{title}</p>
      {action && <div>{action}</div>}
    </div>
  ),
}));

import { ReviewHub } from "../ReviewHub";

const WORKTREE_PATH = "/home/user/project";

const makeStatus = (overrides?: Partial<StagingStatus>): StagingStatus => ({
  staged: [{ path: "src/index.ts", status: "modified", insertions: 5, deletions: 2 }],
  unstaged: [{ path: "src/app.ts", status: "modified", insertions: 3, deletions: 1 }],
  conflicted: [],
  conflictedFiles: [],
  isDetachedHead: false,
  currentBranch: "feature/test",
  hasRemote: false,
  repoState: "DIRTY",
  rebaseStep: null,
  rebaseTotalSteps: null,
  rebaseSequence: null,
  ...overrides,
});

const makeWorktreeState = (path = WORKTREE_PATH): WorktreeState =>
  ({
    id: path,
    path,
    worktreeId: path,
    name: "test",
    isCurrent: true,
    worktreeChanges: null,
    lastActivityTimestamp: null,
  }) as unknown as WorktreeState;

describe("ReviewHub", () => {
  let capturedUpdateCallback: ((state: WorktreeState) => void) | null = null;
  const mockUnsubscribe = vi.fn();

  beforeEach(() => {
    capturedUpdateCallback = null;
    debounceCancelSpy.mockReset();

    worktreeStoreData.current = new Map([
      [
        "main-wt",
        {
          id: "main-wt",
          path: "/home/user/project",
          name: "main",
          branch: "main",
          isMainWorktree: true,
          isCurrent: false,
          worktreeId: "main-wt",
          worktreeChanges: null,
          lastActivityTimestamp: null,
        },
      ],
    ]);

    getStagingStatusMock.mockResolvedValue(makeStatus());
    onUpdateMock.mockImplementation((callback: (state: WorktreeState) => void) => {
      capturedUpdateCallback = callback;
      return mockUnsubscribe;
    });

    compareWorktreesMock.mockResolvedValue({ branch1: "main", branch2: "feature/test", files: [] });

    abortRepositoryOperationMock.mockReset().mockResolvedValue(undefined);
    continueRepositoryOperationMock.mockReset().mockResolvedValue(undefined);
    scanConflictMarkersMock.mockReset().mockResolvedValue([]);
    checkoutOursTheirsMock.mockReset().mockResolvedValue(undefined);
    openInEditorMock.mockReset().mockResolvedValue(undefined);
    stageFileMock.mockReset().mockResolvedValue(undefined);
    commitMock.mockReset().mockResolvedValue({ hash: "abc123", summary: "commit" });
    pushMock.mockReset().mockResolvedValue(undefined);
    pullRebaseMock.mockReset().mockResolvedValue(undefined);
    forcePushWithLeaseMock.mockReset().mockResolvedValue(undefined);
    listRemoteCommitsMock.mockReset().mockResolvedValue([]);
    listCommitsMock.mockReset().mockResolvedValue({ items: [], hasMore: false, total: 0 });
    actionDispatchMock.mockReset().mockResolvedValue({ ok: true });

    Object.defineProperty(window, "electron", {
      value: {
        git: {
          getStagingStatus: getStagingStatusMock,
          stageFile: stageFileMock,
          unstageFile: vi.fn().mockResolvedValue(undefined),
          stageAll: vi.fn().mockResolvedValue(undefined),
          unstageAll: vi.fn().mockResolvedValue(undefined),
          commit: commitMock,
          push: pushMock,
          pullRebase: pullRebaseMock,
          forcePushWithLease: forcePushWithLeaseMock,
          listRemoteCommits: listRemoteCommitsMock,
          listCommits: listCommitsMock,
          compareWorktrees: compareWorktreesMock,
          abortRepositoryOperation: abortRepositoryOperationMock,
          continueRepositoryOperation: continueRepositoryOperationMock,
          scanConflictMarkers: scanConflictMarkersMock,
          checkoutOursTheirs: checkoutOursTheirsMock,
          onPushProgress: vi.fn().mockReturnValue(vi.fn()),
        },
        system: { openInEditor: openInEditorMock },
        worktree: { onUpdate: onUpdateMock },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetches status once on open", async () => {
    render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(getStagingStatusMock).toHaveBeenCalledTimes(1);
      expect(getStagingStatusMock).toHaveBeenCalledWith(WORKTREE_PATH);
    });
  });

  it("renders staged and unstaged files after initial load", async () => {
    render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

    await waitFor(() => {
      screen.getByText("index.ts");
      screen.getByText("app.ts");
    });
  });

  it("subscribes to worktree updates on open", async () => {
    render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

    await waitFor(() => expect(onUpdateMock).toHaveBeenCalledTimes(1));
    expect(capturedUpdateCallback).not.toBeNull();
  });

  it("triggers background refresh when matching worktree emits update", async () => {
    render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
    await waitFor(() => expect(getStagingStatusMock).toHaveBeenCalledTimes(1));

    const updatedStatus = makeStatus({
      staged: [{ path: "new.ts", status: "added", insertions: 10, deletions: 0 }],
      unstaged: [],
    });
    getStagingStatusMock.mockResolvedValue(updatedStatus);

    await act(async () => {
      capturedUpdateCallback!(makeWorktreeState());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getStagingStatusMock).toHaveBeenCalledTimes(2);
      screen.getByText("new.ts");
    });
  });

  it("ignores worktree update events for a different path", async () => {
    render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
    await waitFor(() => expect(getStagingStatusMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      capturedUpdateCallback!(makeWorktreeState("/home/user/other-project"));
      await Promise.resolve();
    });

    expect(getStagingStatusMock).toHaveBeenCalledTimes(1);
  });

  it("preserves commit message during a background resync", async () => {
    render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
    await waitFor(() => screen.getByPlaceholderText("Commit message…"));

    const textarea = screen.getByPlaceholderText("Commit message…");
    fireEvent.change(textarea, { target: { value: "My commit message" } });
    expect((textarea as HTMLTextAreaElement).value).toBe("My commit message");

    getStagingStatusMock.mockResolvedValue(makeStatus());
    await act(async () => {
      capturedUpdateCallback!(makeWorktreeState());
      await Promise.resolve();
    });
    await waitFor(() => expect(getStagingStatusMock).toHaveBeenCalledTimes(2));

    expect((textarea as HTMLTextAreaElement).value).toBe("My commit message");
  });

  it("keeps existing file rows visible during background refresh (no blank flash)", async () => {
    render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("index.ts"));

    let resolveRefresh!: (value: StagingStatus) => void;
    getStagingStatusMock.mockReturnValue(
      new Promise<StagingStatus>((resolve) => {
        resolveRefresh = resolve;
      })
    );

    act(() => {
      capturedUpdateCallback!(makeWorktreeState());
    });

    screen.getByText("index.ts");

    await act(async () => {
      resolveRefresh(makeStatus());
      await Promise.resolve();
    });
  });

  it("unsubscribes when closed", async () => {
    const { rerender } = render(
      <ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />
    );
    await waitFor(() => expect(onUpdateMock).toHaveBeenCalled());

    rerender(<ReviewHub isOpen={false} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it("cancels debounce before explicit stage actions", async () => {
    render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("app.ts"));

    // Click the "Stage src/app.ts" button (unstaged file) — aria-label starts with "Stage"
    const stageBtn = screen.getByRole("button", { name: /^Stage src\/app\.ts/i });
    fireEvent.click(stageBtn);

    await waitFor(() => expect(debounceCancelSpy).toHaveBeenCalled());
  });

  it("manual refresh button still works independently", async () => {
    render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
    await waitFor(() => expect(getStagingStatusMock).toHaveBeenCalledTimes(1));

    const refreshButton = screen.getByRole("button", { name: /refresh/i });
    act(() => fireEvent.click(refreshButton));

    await waitFor(() => expect(getStagingStatusMock).toHaveBeenCalledTimes(2));
  });

  it("resets commit message on close then reopen", async () => {
    const { rerender } = render(
      <ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />
    );
    await waitFor(() => screen.getByPlaceholderText("Commit message…"));

    const textarea = screen.getByPlaceholderText("Commit message…");
    fireEvent.change(textarea, { target: { value: "draft message" } });
    expect((textarea as HTMLTextAreaElement).value).toBe("draft message");

    rerender(<ReviewHub isOpen={false} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
    rerender(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

    await waitFor(() => {
      const ta = screen.getByPlaceholderText("Commit message…") as HTMLTextAreaElement;
      expect(ta.value).toBe("");
    });
  });

  it("background refresh error keeps existing file list visible", async () => {
    render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("index.ts"));

    getStagingStatusMock.mockRejectedValue(new Error("network error"));

    await act(async () => {
      capturedUpdateCallback!(makeWorktreeState());
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    screen.getByText("index.ts");
  });

  it("removes old rows after background refresh replaces status", async () => {
    render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("index.ts"));

    const statusWithNewFiles = makeStatus({
      staged: [{ path: "new-feature.ts", status: "added", insertions: 10, deletions: 0 }],
      unstaged: [],
    });
    getStagingStatusMock.mockResolvedValue(statusWithNewFiles);

    await act(async () => {
      capturedUpdateCallback!(makeWorktreeState());
      await Promise.resolve();
    });

    await waitFor(() => screen.getByText("new-feature.ts"));
    expect(screen.queryByText("index.ts")).toBeNull();
    expect(screen.queryByText("app.ts")).toBeNull();
  });

  it("background refresh clears a prior loadError on success", async () => {
    getStagingStatusMock.mockRejectedValue(new Error("git error"));
    render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("git error"));

    getStagingStatusMock.mockResolvedValue(makeStatus());

    await act(async () => {
      capturedUpdateCallback!(makeWorktreeState());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByText("git error")).toBeNull();
      screen.getByText("index.ts");
    });
  });

  it("foreground and background requests use independent IDs, neither suppresses the other", async () => {
    render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("index.ts"));

    // Trigger a background refresh (fires immediately due to mocked debounce)
    await act(async () => {
      capturedUpdateCallback!(makeWorktreeState());
      await Promise.resolve();
    });

    // Then trigger an explicit manual refresh
    const refreshButton = screen.getByRole("button", { name: /refresh/i });
    act(() => fireEvent.click(refreshButton));

    await waitFor(() => {
      // Both should have fired — total calls: 1 initial + 1 bg + 1 manual = 3
      expect(getStagingStatusMock).toHaveBeenCalledTimes(3);
      screen.getByText("index.ts");
    });
  });

  describe("file row chrome (issue #7783)", () => {
    it("separates stage and inspect click targets — toggling stage does not open the diff", async () => {
      // Render via ReviewHub so the row is wired into the real component.
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("app.ts"));

      // The stage toggle is `aria-label="Stage src/app.ts"`. Clicking it must
      // call the stage IPC and must NOT advance to the diff view.
      const stageBtn = screen.getByRole("button", { name: /^Stage src\/app\.ts/i });
      fireEvent.click(stageBtn);

      await waitFor(() => expect(stageFileMock).toHaveBeenCalledWith(WORKTREE_PATH, "src/app.ts"));

      // The inspect button has aria-label "View diff: src/app.ts". It must be
      // a separate, independently-clickable element.
      const inspectBtn = screen.getByRole("button", { name: /^View diff: src\/app\.ts/i });
      expect(inspectBtn).not.toBe(stageBtn);
      expect(inspectBtn.contains(stageBtn)).toBe(false);
      expect(stageBtn.contains(inspectBtn)).toBe(false);
      // Inspect button captures the row's interactive surface.
      expect(inspectBtn.className).toMatch(/flex-1/);
    });

    it("renders +N/-M churn from staging entries", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeStatus({
          staged: [{ path: "src/big.ts", status: "modified", insertions: 42, deletions: 7 }],
          unstaged: [],
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("big.ts"));

      const churn = screen.getByTestId("file-stage-row-churn");
      expect(churn.textContent).toContain("+42");
      expect(churn.textContent).toContain("-7");
    });

    it("omits the deletions span when the value is zero", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeStatus({
          staged: [{ path: "new.ts", status: "added", insertions: 10, deletions: 0 }],
          unstaged: [],
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("new.ts"));

      const churn = screen.getByTestId("file-stage-row-churn");
      expect(churn.textContent).toContain("+10");
      expect(churn.textContent).not.toContain("-0");
    });

    it("hides churn entirely when both insertions and deletions are null", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeStatus({
          staged: [],
          unstaged: [
            { path: "untracked.ts", status: "untracked", insertions: null, deletions: null },
          ],
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("untracked.ts"));

      expect(screen.queryByTestId("file-stage-row-churn")).toBeNull();
    });

    it("dims the filename text on generated/lockfile rows but keeps the stage toggle full-opacity", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeStatus({
          staged: [],
          unstaged: [
            { path: "package-lock.json", status: "modified", insertions: 1, deletions: 1 },
          ],
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("package-lock.json"));

      const baseSpan = screen.getByTestId("file-stage-row-base");
      // Dimming applied to the base name span.
      expect(baseSpan.className).toMatch(/text-daintree-text\/40/);

      // Stage toggle stays at full opacity — no /40 dimming applied to it.
      const stageBtn = screen.getByRole("button", { name: /^Stage package-lock\.json/i });
      expect(stageBtn.className).not.toMatch(/text-daintree-text\/40/);
    });

    it("does not dim hand-written source files", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeStatus({
          staged: [],
          unstaged: [
            { path: "src/component.tsx", status: "modified", insertions: 3, deletions: 2 },
          ],
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("component.tsx"));

      const baseSpan = screen.getByTestId("file-stage-row-base");
      expect(baseSpan.className).not.toMatch(/text-daintree-text\/40/);
    });
  });

  describe("base-branch diff mode", () => {
    it("defaults to working-tree mode showing staged and unstaged sections", async () => {
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("index.ts"));

      expect(
        screen.getByRole("button", { name: /working tree/i }).getAttribute("aria-pressed")
      ).toBe("true");
      expect(screen.getByRole("button", { name: /vs main/i }).getAttribute("aria-pressed")).toBe(
        "false"
      );
    });

    it("does not call compareWorktrees on initial open", async () => {
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("index.ts"));

      expect(compareWorktreesMock).not.toHaveBeenCalled();
    });

    it("calls compareWorktrees with useMergeBase when switching to base-branch mode", async () => {
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("index.ts"));

      const toggle = screen.getByRole("button", { name: /vs main/i });
      act(() => fireEvent.click(toggle));

      await waitFor(() => {
        expect(compareWorktreesMock).toHaveBeenCalledWith(
          WORKTREE_PATH,
          "main",
          "feature/test",
          undefined,
          true
        );
      });
    });

    it("shows changed file list in base-branch mode", async () => {
      compareWorktreesMock.mockResolvedValue({
        branch1: "main",
        branch2: "feature/test",
        files: [
          { status: "M", path: "src/component.tsx" },
          { status: "A", path: "src/new-file.ts" },
        ],
      });

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("index.ts"));

      const toggle = screen.getByRole("button", { name: /vs main/i });
      act(() => fireEvent.click(toggle));

      await waitFor(() => {
        screen.getByText("component.tsx");
        screen.getByText("new-file.ts");
      });
    });

    it("shows empty state when no files changed vs base branch", async () => {
      compareWorktreesMock.mockResolvedValue({
        branch1: "main",
        branch2: "feature/test",
        files: [],
      });

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("index.ts"));

      const toggle = screen.getByRole("button", { name: /vs main/i });
      act(() => fireEvent.click(toggle));

      await waitFor(() => {
        screen.getByText(/no changes vs main/i);
      });
    });

    it("shows error message when compareWorktrees fails", async () => {
      compareWorktreesMock.mockRejectedValue(new Error("branch not found"));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("index.ts"));

      const toggle = screen.getByRole("button", { name: /vs main/i });
      act(() => fireEvent.click(toggle));

      await waitFor(() => {
        screen.getByText("branch not found");
      });
    });

    it("does not show commit panel in base-branch mode", async () => {
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const toggle = screen.getByRole("button", { name: /vs main/i });
      act(() => fireEvent.click(toggle));

      await waitFor(() => expect(compareWorktreesMock).toHaveBeenCalled());

      expect(screen.queryByPlaceholderText("Commit message…")).toBeNull();
    });

    it("resets to working-tree mode when closed and reopened", async () => {
      const { rerender } = render(
        <ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />
      );
      await waitFor(() => screen.getByText("index.ts"));

      // Switch to base-branch mode
      act(() => fireEvent.click(screen.getByRole("button", { name: /vs main/i })));
      await waitFor(() => expect(compareWorktreesMock).toHaveBeenCalled());

      // Close and reopen
      rerender(<ReviewHub isOpen={false} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      rerender(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /working tree/i }).getAttribute("aria-pressed")
        ).toBe("true");
      });
    });

    it("disables vs-branch button when current branch matches main branch", async () => {
      getStagingStatusMock.mockResolvedValue(makeStatus({ currentBranch: "main" }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("index.ts"));

      const toggle = screen.getByRole("button", { name: /vs main/i });
      expect(toggle.hasAttribute("disabled")).toBe(true);
    });

    it("does not call compareWorktrees when current branch matches main branch", async () => {
      getStagingStatusMock.mockResolvedValue(makeStatus({ currentBranch: "main" }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("index.ts"));

      const toggle = screen.getByRole("button", { name: /vs main/i });
      fireEvent.click(toggle);

      expect(compareWorktreesMock).not.toHaveBeenCalled();
    });

    it("does not refetch base-branch diff on repeated toggle to base-branch mode", async () => {
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("index.ts"));

      // First toggle
      act(() => fireEvent.click(screen.getByRole("button", { name: /vs main/i })));
      await waitFor(() => expect(compareWorktreesMock).toHaveBeenCalledTimes(1));

      // Toggle back to working-tree
      act(() => fireEvent.click(screen.getByRole("button", { name: /working tree/i })));

      // Toggle again to base-branch — should NOT re-fetch since files are cached
      act(() => fireEvent.click(screen.getByRole("button", { name: /vs main/i })));

      // Still only 1 call
      expect(compareWorktreesMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("focus retention", () => {
    it("commit textarea retains focus during background resync", async () => {
      const onClose = vi.fn();
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={onClose} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));
      await act(async () => {});

      const textarea = screen.getByPlaceholderText("Commit message…") as HTMLTextAreaElement;
      act(() => textarea.focus());
      expect(document.activeElement).toBe(textarea);

      // Trigger a background resync which re-renders the component
      getStagingStatusMock.mockResolvedValue(makeStatus());
      await act(async () => {
        capturedUpdateCallback!(makeWorktreeState());
        await Promise.resolve();
      });
      await waitFor(() => expect(getStagingStatusMock).toHaveBeenCalledTimes(2));

      expect(document.activeElement).toBe(textarea);
    });

    it("Escape reads latest state through useEffectEvent", async () => {
      const onClose = vi.fn();
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={onClose} />);
      await waitFor(() => screen.getByText("index.ts"));

      // Click the file row button to open its diff (sets selectedFile)
      const fileRow = screen.getByText("index.ts").closest("button")!;
      fireEvent.click(fileRow);

      // First Escape should clear selectedFile, not close modal
      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });

      expect(onClose).not.toHaveBeenCalled();

      // Second Escape should close the modal
      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("PR state indicator", () => {
    function setWorktreePR(prData: {
      prNumber: number;
      prUrl: string;
      prState: "open" | "merged" | "closed";
      prCiStatus?: "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED";
    }) {
      const existing = worktreeStoreData.current.get("main-wt")!;
      worktreeStoreData.current.set("main-wt", { ...existing, ...prData });
    }

    it("shows PR badge with number and state when worktree has a PR", async () => {
      setWorktreePR({
        prNumber: 42,
        prUrl: "https://github.com/test/repo/pull/42",
        prState: "open",
      });
      getStagingStatusMock.mockResolvedValue(makeStatus({ hasRemote: true }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => {
        screen.getByRole("button", { name: /view pull request #42/i });
        screen.getByText("#42");
        screen.getByText("open");
      });
    });

    it("opens PR in browser when external-link button is clicked", async () => {
      setWorktreePR({
        prNumber: 42,
        prUrl: "https://github.com/test/repo/pull/42",
        prState: "open",
      });
      getStagingStatusMock.mockResolvedValue(makeStatus({ hasRemote: true }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByRole("button", { name: /view pull request #42/i }));

      // Clicking the pill text does not open the PR
      fireEvent.click(screen.getByText("#42"));
      expect(openPRMock).not.toHaveBeenCalled();

      // Clicking the external-link button opens the PR
      fireEvent.click(screen.getByRole("button", { name: /view pull request #42/i }));
      expect(openPRMock).toHaveBeenCalledWith("https://github.com/test/repo/pull/42");
    });

    it("shows 'No PR' when branch has remote but no PR", async () => {
      getStagingStatusMock.mockResolvedValue(makeStatus({ hasRemote: true }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => {
        screen.getByText("No PR");
      });
    });

    it("does not show PR indicator when branch has no remote, even with PR data", async () => {
      setWorktreePR({
        prNumber: 42,
        prUrl: "https://github.com/test/repo/pull/42",
        prState: "open",
      });
      getStagingStatusMock.mockResolvedValue(makeStatus({ hasRemote: false }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));
      expect(screen.queryByText("No PR")).toBeNull();
      expect(screen.queryByText("#42")).toBeNull();
    });

    it("shows closed state for closed PRs", async () => {
      setWorktreePR({
        prNumber: 77,
        prUrl: "https://github.com/test/repo/pull/77",
        prState: "closed",
      });
      getStagingStatusMock.mockResolvedValue(makeStatus({ hasRemote: true }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => {
        screen.getByText("#77");
        screen.getByText("closed");
      });
    });

    it("shows merged state for merged PRs", async () => {
      setWorktreePR({
        prNumber: 99,
        prUrl: "https://github.com/test/repo/pull/99",
        prState: "merged",
      });
      getStagingStatusMock.mockResolvedValue(makeStatus({ hasRemote: true }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => {
        screen.getByText("#99");
        screen.getByText("merged");
      });
    });

    it("shows CI status when prCiStatus is set", async () => {
      setWorktreePR({
        prNumber: 42,
        prUrl: "https://github.com/test/repo/pull/42",
        prState: "open",
        prCiStatus: "FAILURE",
      });
      getStagingStatusMock.mockResolvedValue(makeStatus({ hasRemote: true }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => {
        screen.getByText("failing");
        screen.getByLabelText(/ci failing/i);
      });
    });

    it("omits CI status when prCiStatus is undefined", async () => {
      setWorktreePR({
        prNumber: 42,
        prUrl: "https://github.com/test/repo/pull/42",
        prState: "open",
      });
      getStagingStatusMock.mockResolvedValue(makeStatus({ hasRemote: true }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("#42"));
      expect(screen.queryByText("passing")).toBeNull();
      expect(screen.queryByText("failing")).toBeNull();
      expect(screen.queryByText("pending")).toBeNull();
    });
  });

  describe("conflict mode", () => {
    const makeMergingStatus = (overrides?: Partial<StagingStatus>): StagingStatus =>
      makeStatus({
        staged: [],
        unstaged: [],
        conflicted: ["src/app.ts"],
        conflictedFiles: [{ path: "src/app.ts", xy: "UU", label: "both modified" }],
        repoState: "MERGING",
        ...overrides,
      });

    it("renders the conflict panel instead of staging sections when merging", async () => {
      getStagingStatusMock.mockResolvedValue(makeMergingStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-panel"));
      screen.getByText(/Resolve Merge Conflicts/i);
      expect(screen.queryByText(/^Staged$/i)).toBeNull();
      expect(screen.queryByPlaceholderText("Commit message…")).toBeNull();
    });

    it("shows rebase step progress in the banner", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeMergingStatus({
          repoState: "REBASING",
          rebaseStep: 3,
          rebaseTotalSteps: 8,
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-rebase-progress"));
      expect(screen.getByTestId("conflict-rebase-progress").textContent).toMatch(/Step 3 of 8/);
    });

    it("renders the rebase sequence rail when rebaseSequence is populated", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeMergingStatus({
          repoState: "REBASING",
          rebaseStep: 2,
          rebaseTotalSteps: 4,
          rebaseSequence: {
            backend: "merge",
            entries: [
              { action: "pick", sha: "aaa1111", subject: "first", state: "done" },
              { action: "pick", sha: "bbb2222", subject: "second", state: "current" },
              { action: "fixup", sha: "ccc3333", subject: "third", state: "pending" },
              { action: "pick", sha: "ddd4444", subject: "fourth", state: "pending" },
            ],
          },
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      const rail = await screen.findByTestId("conflict-rebase-sequence");
      expect(within(rail).getAllByTestId(/^rebase-entry-/)).toHaveLength(4);
      expect(within(rail).getByTestId("rebase-entry-current").textContent).toContain("bbb2222");
      expect(within(rail).getByTestId("rebase-entry-current").textContent).toContain("second");
    });

    it("does not render the rebase sequence rail when rebaseSequence is null (apply backend)", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeMergingStatus({
          repoState: "REBASING",
          rebaseStep: 1,
          rebaseTotalSteps: 3,
          rebaseSequence: null,
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-rebase-progress"));
      expect(screen.queryByTestId("conflict-rebase-sequence")).toBeNull();
    });

    it("disables Continue when conflicted files remain", async () => {
      getStagingStatusMock.mockResolvedValue(makeMergingStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByRole("button", { name: /^Continue /i }));
      expect(screen.getByRole("button", { name: /^Continue /i }).hasAttribute("disabled")).toBe(
        true
      );
    });

    it("enables Continue when all conflicts are resolved", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeMergingStatus({
          conflicted: [],
          conflictedFiles: [],
          staged: [{ path: "src/app.ts", status: "modified", insertions: 1, deletions: 1 }],
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByRole("button", { name: /^Continue /i }));
      expect(screen.getByRole("button", { name: /^Continue /i }).hasAttribute("disabled")).toBe(
        false
      );
    });

    it("stages a file when Mark resolved is clicked", async () => {
      getStagingStatusMock.mockResolvedValue(makeMergingStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-panel"));
      const resolveBtn = screen.getByRole("button", {
        name: /Mark src\/app\.ts as resolved/i,
      });
      fireEvent.click(resolveBtn);

      await waitFor(() => {
        expect(stageFileMock).toHaveBeenCalledWith(WORKTREE_PATH, "src/app.ts");
      });
    });

    it("opens the file in the external editor with the absolute path", async () => {
      getStagingStatusMock.mockResolvedValue(makeMergingStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-panel"));
      const openBtn = screen.getByRole("button", {
        name: /Open src\/app\.ts in external editor/i,
      });
      fireEvent.click(openBtn);

      await waitFor(() => {
        expect(openInEditorMock).toHaveBeenCalledWith({
          path: `${WORKTREE_PATH}/src/app.ts`,
        });
      });
    });

    it("forwards the first-marker line to the external editor when the scan finds one", async () => {
      getStagingStatusMock.mockResolvedValue(makeMergingStatus());
      scanConflictMarkersMock.mockResolvedValue([
        { path: "src/app.ts", hunkCount: 2, firstMarkerLine: 17 },
      ]);

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-panel"));
      await waitFor(() =>
        expect(scanConflictMarkersMock).toHaveBeenCalledWith(WORKTREE_PATH, ["src/app.ts"])
      );

      const openBtn = await screen.findByRole("button", {
        name: /Open src\/app\.ts in external editor/i,
      });
      fireEvent.click(openBtn);

      await waitFor(() => {
        expect(openInEditorMock).toHaveBeenCalledWith({
          path: `${WORKTREE_PATH}/src/app.ts`,
          line: 17,
        });
      });
    });

    it("checks out ours when Take ours is clicked", async () => {
      getStagingStatusMock.mockResolvedValue(makeMergingStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-panel"));
      const takeOurs = screen.getByRole("button", { name: /Take ours for src\/app\.ts/i });
      fireEvent.click(takeOurs);

      await waitFor(() => {
        expect(checkoutOursTheirsMock).toHaveBeenCalledWith(WORKTREE_PATH, "src/app.ts", "ours");
      });
    });

    it("checks out theirs when Take theirs is clicked", async () => {
      getStagingStatusMock.mockResolvedValue(makeMergingStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-panel"));
      const takeTheirs = screen.getByRole("button", { name: /Take theirs for src\/app\.ts/i });
      fireEvent.click(takeTheirs);

      await waitFor(() => {
        expect(checkoutOursTheirsMock).toHaveBeenCalledWith(WORKTREE_PATH, "src/app.ts", "theirs");
      });
    });

    it("renders the Abort action inside the operation chrome, not the footer", async () => {
      getStagingStatusMock.mockResolvedValue(makeMergingStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-panel"));
      // The Abort control is now sized `xs` (text-[10px]); Continue is the
      // only `sm` primary in the footer region. Verify both exist and that
      // there is exactly one Continue and exactly one Abort.
      expect(screen.getAllByRole("button", { name: /^Continue /i })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: /^Abort /i })).toHaveLength(1);
    });

    it("keeps the Resolved section collapsed by default and expands on click", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeMergingStatus({
          staged: [{ path: "src/done.ts", status: "modified", insertions: 1, deletions: 0 }],
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-panel"));
      expect(screen.queryByTestId("conflict-resolved-list")).toBeNull();

      fireEvent.click(screen.getByTestId("conflict-resolved-toggle"));
      await waitFor(() => screen.getByTestId("conflict-resolved-list"));
      screen.getByText("done.ts");
    });

    it("builds dynamic abort copy with staged count and rebase progress", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeMergingStatus({
          repoState: "REBASING",
          rebaseStep: 4,
          rebaseTotalSteps: 7,
          staged: [
            { path: "a.ts", status: "modified", insertions: 1, deletions: 0 },
            { path: "b.ts", status: "modified", insertions: 1, deletions: 0 },
          ],
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByRole("button", { name: /^Abort /i }));
      fireEvent.click(screen.getByRole("button", { name: /^Abort /i }));

      const dialog = await screen.findByRole("alertdialog");
      // 2 staged + replayed = rebaseStep - 1 = 3 of 7
      expect(dialog.textContent).toMatch(/Discards 2 staged resolutions/);
      expect(dialog.textContent).toMatch(/reverts 3 of 7 replayed commits/);
    });

    it("rolls back optimistic resolution and keeps Continue disabled when mark-resolved fails", async () => {
      getStagingStatusMock.mockResolvedValue(makeMergingStatus());
      stageFileMock.mockRejectedValueOnce(new Error("permission denied"));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-panel"));
      const resolveBtn = screen.getByRole("button", {
        name: /Mark src\/app\.ts as resolved/i,
      });
      fireEvent.click(resolveBtn);

      // After the rejection the row must reappear (rollback) and Continue must
      // remain disabled — the unresolved conflict is still present.
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Mark src\/app\.ts as resolved/i })).toBeTruthy();
      });
      expect(screen.getByRole("button", { name: /^Continue /i }).hasAttribute("disabled")).toBe(
        true
      );
    });

    it("rolls back optimistic resolution when Take ours fails", async () => {
      getStagingStatusMock.mockResolvedValue(makeMergingStatus());
      checkoutOursTheirsMock.mockRejectedValueOnce(new Error("checkout failed"));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-panel"));
      const takeOurs = screen.getByRole("button", { name: /Take ours for src\/app\.ts/i });
      fireEvent.click(takeOurs);

      await waitFor(() => {
        // The row reappears after rollback — the Take ours button is still rendered.
        expect(screen.getByRole("button", { name: /Take ours for src\/app\.ts/i })).toBeTruthy();
      });
    });

    it("disables Continue while a checkout IPC call is still in flight", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeMergingStatus({
          conflictedFiles: [
            { path: "src/app.ts", xy: "UU", label: "both modified" },
            { path: "src/other.ts", xy: "UU", label: "both modified" },
          ],
          conflicted: ["src/app.ts", "src/other.ts"],
        })
      );
      // Pending promise — the IPC call never resolves during the test.
      let resolveCheckout: (() => void) | undefined;
      checkoutOursTheirsMock.mockImplementationOnce(
        () => new Promise<void>((resolve) => (resolveCheckout = () => resolve()))
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-panel"));
      const takeOurs = screen.getByRole("button", { name: /Take ours for src\/app\.ts/i });
      fireEvent.click(takeOurs);

      // After the click, the optimistic row disappears for `src/app.ts` —
      // only `src/other.ts` remains conflicted. Continue must still be
      // disabled because the checkout IPC is pending.
      await waitFor(() => {
        const continueBtn = screen.getByRole("button", { name: /^Continue /i });
        expect(continueBtn.hasAttribute("disabled")).toBe(true);
      });

      // Cleanup so the pending promise doesn't leak across tests.
      resolveCheckout?.();
    });

    it("renders a hunk-count badge once the scan resolves", async () => {
      getStagingStatusMock.mockResolvedValue(makeMergingStatus());
      scanConflictMarkersMock.mockResolvedValue([
        { path: "src/app.ts", hunkCount: 3, firstMarkerLine: 12 },
      ]);

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-panel"));
      const badge = await screen.findByTestId("conflict-hunk-count-src/app.ts");
      expect(badge.textContent).toBe("3");
    });

    it("opens confirm dialog before aborting and calls abort on confirm", async () => {
      getStagingStatusMock.mockResolvedValue(makeMergingStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByRole("button", { name: /^Abort /i }));
      fireEvent.click(screen.getByRole("button", { name: /^Abort /i }));

      const dialog = await screen.findByRole("alertdialog");
      expect(abortRepositoryOperationMock).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole("button", { name: /Abort merge/i }));

      await waitFor(() => {
        expect(abortRepositoryOperationMock).toHaveBeenCalledWith(WORKTREE_PATH);
      });
    });

    it("invokes continue when Continue is clicked", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeMergingStatus({
          conflicted: [],
          conflictedFiles: [],
          staged: [{ path: "src/app.ts", status: "modified", insertions: 1, deletions: 1 }],
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByRole("button", { name: /^Continue /i }));
      fireEvent.click(screen.getByRole("button", { name: /^Continue /i }));

      await waitFor(() => {
        expect(continueRepositoryOperationMock).toHaveBeenCalledWith(WORKTREE_PATH);
      });
    });

    it("renders cherry-pick operation labels", async () => {
      getStagingStatusMock.mockResolvedValue(makeMergingStatus({ repoState: "CHERRY_PICKING" }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-panel"));
      screen.getByText(/Resolve Cherry-pick Conflicts/i);
      screen.getByRole("button", { name: /^Abort cherry-pick/i });
      screen.getByRole("button", { name: /^Continue cherry-pick/i });
    });

    it("renders revert operation labels", async () => {
      getStagingStatusMock.mockResolvedValue(makeMergingStatus({ repoState: "REVERTING" }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByTestId("conflict-panel"));
      screen.getByText(/Resolve Revert Conflicts/i);
      screen.getByRole("button", { name: /^Abort revert/i });
      screen.getByRole("button", { name: /^Continue revert/i });
    });

    it("renders normal staging UI when repoState is DIRTY with conflicts", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeStatus({
          conflicted: ["src/weird.ts"],
          conflictedFiles: [{ path: "src/weird.ts", xy: "UU", label: "both modified" }],
          repoState: "DIRTY",
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));
      expect(screen.queryByTestId("conflict-panel")).toBeNull();
    });
  });

  describe("commit panel", () => {
    it("renders split button when hasRemote is true", async () => {
      getStagingStatusMock.mockResolvedValue(makeStatus({ hasRemote: true }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      expect(screen.getByTestId("split-button")).toBeDefined();
      const primary = screen.getByTestId("split-button-primary");
      expect(primary.textContent).toMatch(/Commit & Push/);
    });

    it("renders single Commit button when hasRemote is false", async () => {
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      expect(screen.queryByTestId("split-button")).toBeNull();
      expect(screen.getByRole("button", { name: /Commit \(1\)/i })).toBeDefined();
    });

    it("uses aria-disabled instead of native disabled on commit button when blocked", async () => {
      getStagingStatusMock.mockResolvedValue(makeStatus({ staged: [], hasRemote: false }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const btn = screen.getByRole("button", { name: /Commit \(0\)/i });
      expect(btn.getAttribute("aria-disabled")).toBe("true");
      expect(btn.hasAttribute("disabled")).toBe(false);
    });

    it("uses aria-disabled on split button primary when blocked", async () => {
      getStagingStatusMock.mockResolvedValue(makeStatus({ staged: [], hasRemote: true }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const primary = screen.getByTestId("split-button-primary");
      expect(primary.getAttribute("aria-disabled")).toBe("true");
    });

    it("shows tooltip content when blocked and hasRemote is false", async () => {
      getStagingStatusMock.mockResolvedValue(makeStatus({ staged: [], hasRemote: false }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      // The TooltipContent is mocked but the blocker list renders as ReactNode
      // Since our Tooltip mock renders children, the tooltip content reveals via DOM
      expect(screen.getByText("Cannot commit")).toBeDefined();
    });

    it("shows tooltip content in split button when blocked and hasRemote is true", async () => {
      getStagingStatusMock.mockResolvedValue(makeStatus({ staged: [], hasRemote: true }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      expect(screen.getByTestId("split-button-tooltip")).toBeDefined();
    });

    it("reentrancy guard prevents double-commit via rapid clicks", async () => {
      commitMock.mockResolvedValue({ hash: "abc", summary: "ok" });

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…");
      fireEvent.change(textarea, { target: { value: "feat: test double click" } });

      const btn = screen.getByRole("button", { name: /Commit \(1\)/i });
      fireEvent.click(btn);
      fireEvent.click(btn);

      await waitFor(() => expect(commitMock).toHaveBeenCalledTimes(1));
    });

    it("Cmd+Enter fires primary commit when not blocked", async () => {
      commitMock.mockResolvedValue({ hash: "abc", summary: "ok" });

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…");
      fireEvent.change(textarea, { target: { value: "feat: keyboard shortcut" } });
      fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

      await waitFor(() => expect(commitMock).toHaveBeenCalledTimes(1));
    });

    it("Cmd+Shift+Enter fires commit (alternate) when hasRemote", async () => {
      commitMock.mockResolvedValue({ hash: "abc", summary: "ok" });
      getStagingStatusMock.mockResolvedValue(makeStatus({ hasRemote: true }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…");
      fireEvent.change(textarea, { target: { value: "feat: shift shortcut" } });
      fireEvent.keyDown(textarea, { key: "Enter", metaKey: true, shiftKey: true });

      await waitFor(() => expect(commitMock).toHaveBeenCalledTimes(1));
      expect(pushMock).not.toHaveBeenCalled();
    });
  });

  describe("push error banner", () => {
    async function triggerCommitAndPush() {
      getStagingStatusMock.mockResolvedValue(makeStatus({ hasRemote: true }));
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…");
      fireEvent.change(textarea, { target: { value: "feat: do the thing" } });

      const commitPushBtn = screen.getByRole("button", { name: /Commit & Push/i });
      await act(async () => {
        fireEvent.click(commitPushBtn);
        await Promise.resolve();
      });
    }

    it("shows auth-failed banner with Open GitHub settings CTA and dispatches settings tab", async () => {
      const rawError = "fatal: Authentication failed for 'https://github.com/foo/bar.git/'";
      pushMock.mockRejectedValue(
        Object.assign(new Error(rawError), {
          name: "GitOperationError",
          gitReason: "auth-failed",
        })
      );

      await triggerCommitAndPush();

      const banner = await screen.findByTestId("review-hub-push-error");
      expect(banner.getAttribute("data-reason")).toBe("auth-failed");
      expect(banner.textContent).toMatch(/Push failed/i);
      expect(banner.textContent).toMatch(/credentials or SSH key/i);
      expect(banner.textContent).not.toContain(rawError);
      expect(screen.queryByTestId("review-hub-push-error-details")).toBeNull();
      expect(screen.queryByTestId("review-hub-push-error-toggle")).toBeNull();

      const cta = screen.getByTestId("review-hub-push-error-cta");
      expect(cta.textContent).toMatch(/Open GitHub settings/i);
      fireEvent.click(cta);

      expect(actionDispatchMock).toHaveBeenCalledWith(
        "app.settings.openTab",
        { tab: "github" },
        { source: "user" }
      );
    });

    it("shows push-rejected-outdated banner with Pull-and-rebase primary CTA only when leaseSha is missing", async () => {
      pushMock.mockRejectedValue(
        Object.assign(new Error("! [rejected] main -> main (non-fast-forward)"), {
          name: "GitOperationError",
          gitReason: "push-rejected-outdated",
        })
      );

      await triggerCommitAndPush();

      const banner = await screen.findByTestId("review-hub-push-error");
      expect(banner.getAttribute("data-reason")).toBe("push-rejected-outdated");
      expect(banner.textContent).toMatch(/Pull and rebase, or force push to overwrite/i);
      // Primary CTA renders even without leaseSha — it just doesn't get the
      // force-push secondary CTA (would silently degrade to plain --force).
      const primary = screen.getByTestId("review-hub-push-error-cta");
      expect(primary.textContent).toMatch(/Pull and rebase/i);
      expect(screen.queryByTestId("review-hub-push-error-secondary-cta")).toBeNull();
      expect(screen.queryByTestId("review-hub-push-error-details")).toBeNull();
      expect(screen.queryByTestId("review-hub-push-error-toggle")).toBeNull();
    });

    it("shows both Pull-and-rebase primary and Force-push secondary CTAs when leaseSha is present", async () => {
      pushMock.mockRejectedValue(
        Object.assign(new Error("! [rejected] feature/x -> feature/x (non-fast-forward)"), {
          name: "GitOperationError",
          gitReason: "push-rejected-outdated",
          leaseSha: "abc1234567890abc1234567890abc1234567890a",
          branchName: "feature/x",
        })
      );

      await triggerCommitAndPush();

      const banner = await screen.findByTestId("review-hub-push-error");
      expect(banner.getAttribute("data-reason")).toBe("push-rejected-outdated");
      const primary = screen.getByTestId("review-hub-push-error-cta");
      expect(primary.textContent).toMatch(/Pull and rebase/i);
      const secondary = screen.getByTestId("review-hub-push-error-secondary-cta");
      expect(secondary.textContent).toMatch(/Force push/i);
    });

    it("Pull-and-rebase CTA invokes pullRebase, refreshes status, and clears the banner on success", async () => {
      pushMock.mockRejectedValue(
        Object.assign(new Error("! [rejected]"), {
          name: "GitOperationError",
          gitReason: "push-rejected-outdated",
          leaseSha: "abc123",
          branchName: "feature/x",
        })
      );

      await triggerCommitAndPush();
      await screen.findByTestId("review-hub-push-error");

      pullRebaseMock.mockResolvedValueOnce(undefined);

      await act(async () => {
        fireEvent.click(screen.getByTestId("review-hub-push-error-cta"));
        await Promise.resolve();
      });

      await waitFor(() => expect(pullRebaseMock).toHaveBeenCalledWith(WORKTREE_PATH));
      await waitFor(() => expect(screen.queryByTestId("review-hub-push-error")).toBeNull());
      // refresh() called: once on initial load + once after commit (in
      // handleCommitAndPush) + once after pull-rebase success.
      expect(getStagingStatusMock).toHaveBeenCalledTimes(3);
    });

    it("Pull-and-rebase failure surfaces conflict-unresolved through the banner", async () => {
      pushMock.mockRejectedValue(
        Object.assign(new Error("! [rejected]"), {
          name: "GitOperationError",
          gitReason: "push-rejected-outdated",
          leaseSha: "abc123",
          branchName: "feature/x",
        })
      );

      await triggerCommitAndPush();
      await screen.findByTestId("review-hub-push-error");

      pullRebaseMock.mockRejectedValueOnce(
        Object.assign(new Error("CONFLICT (content): Merge conflict in foo.ts"), {
          name: "GitOperationError",
          gitReason: "conflict-unresolved",
        })
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("review-hub-push-error-cta"));
        await Promise.resolve();
      });

      await waitFor(() =>
        expect(screen.getByTestId("review-hub-push-error").getAttribute("data-reason")).toBe(
          "conflict-unresolved"
        )
      );
    });

    it("Force-push CTA opens the confirmation dialog with loaded remote commits and confirm calls forcePushWithLease", async () => {
      pushMock.mockRejectedValue(
        Object.assign(new Error("! [rejected]"), {
          name: "GitOperationError",
          gitReason: "push-rejected-outdated",
          leaseSha: "deadbeef",
          branchName: "feature/x",
        })
      );
      listRemoteCommitsMock.mockResolvedValueOnce([
        { hash: "abcd1234567", date: "2026-01-01", message: "first remote commit", author: "Bob" },
        { hash: "efgh1234567", date: "2026-01-02", message: "second remote commit", author: "Bob" },
      ]);

      await triggerCommitAndPush();
      await screen.findByTestId("review-hub-push-error");

      await act(async () => {
        fireEvent.click(screen.getByTestId("review-hub-push-error-secondary-cta"));
        await Promise.resolve();
      });

      // Dialog opens; commit list loads.
      await waitFor(() =>
        expect(listRemoteCommitsMock).toHaveBeenCalledWith(WORKTREE_PATH, "feature/x", 20)
      );
      await waitFor(() => screen.getByText("first remote commit"));

      const dialog = screen.getByRole("alertdialog");
      const confirmBtn = within(dialog).getByRole("button", { name: /Force push/i });

      await act(async () => {
        fireEvent.click(confirmBtn);
        await Promise.resolve();
      });

      await waitFor(() =>
        expect(forcePushWithLeaseMock).toHaveBeenCalledWith(WORKTREE_PATH, "feature/x", "deadbeef")
      );
      await waitFor(() => expect(screen.queryByTestId("review-hub-push-error")).toBeNull());
    });

    it("Force-push CTA is suppressed when leaseSha is absent", async () => {
      pushMock.mockRejectedValue(
        Object.assign(new Error("! [rejected]"), {
          name: "GitOperationError",
          gitReason: "push-rejected-outdated",
          // no leaseSha
          branchName: "feature/x",
        })
      );

      await triggerCommitAndPush();
      await screen.findByTestId("review-hub-push-error");

      expect(screen.queryByTestId("review-hub-push-error-secondary-cta")).toBeNull();
    });

    it("shows push-rejected-policy banner with collapsed raw stderr and GH code", async () => {
      const rawError = "GH006: Protected branch update failed for refs/heads/main.";
      pushMock.mockRejectedValue(
        Object.assign(new Error(rawError), {
          name: "GitOperationError",
          gitReason: "push-rejected-policy",
        })
      );

      await triggerCommitAndPush();

      const banner = await screen.findByTestId("review-hub-push-error");
      expect(banner.getAttribute("data-reason")).toBe("push-rejected-policy");
      expect(banner.textContent).toMatch(/protected branch/i);
      expect(screen.queryByTestId("review-hub-push-error-cta")).toBeNull();
      expect(screen.getByTestId("review-hub-push-error-code").textContent).toBe("GH006");
      expect(screen.queryByTestId("review-hub-push-error-details")).toBeNull();

      const toggle = screen.getByTestId("review-hub-push-error-toggle");
      expect(toggle.textContent).toMatch(/Show details/i);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(toggle);
      expect(screen.getByTestId("review-hub-push-error-details").textContent).toBe(rawError);
      expect(toggle.textContent).toMatch(/Hide details/i);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
    });

    it("shows hook-rejected banner with collapsed raw stderr", async () => {
      const rawError = "[remote rejected] main -> main (pre-receive hook declined)";
      pushMock.mockRejectedValue(
        Object.assign(new Error(rawError), {
          name: "GitOperationError",
          gitReason: "hook-rejected",
        })
      );

      await triggerCommitAndPush();

      const banner = await screen.findByTestId("review-hub-push-error");
      expect(banner.getAttribute("data-reason")).toBe("hook-rejected");
      expect(banner.textContent).toMatch(/server-side hook rejected/i);
      expect(screen.queryByTestId("review-hub-push-error-details")).toBeNull();
      fireEvent.click(screen.getByTestId("review-hub-push-error-toggle"));
      expect(screen.getByTestId("review-hub-push-error-details").textContent).toBe(rawError);
    });

    it("shows network-unavailable banner with Retry button that re-pushes without re-committing", async () => {
      const rawError = "Could not resolve host: github.com";
      pushMock.mockRejectedValueOnce(
        Object.assign(new Error(rawError), {
          name: "GitOperationError",
          gitReason: "network-unavailable",
        })
      );

      await triggerCommitAndPush();

      const banner = await screen.findByTestId("review-hub-push-error");
      expect(banner.getAttribute("data-reason")).toBe("network-unavailable");
      expect(banner.textContent).toMatch(/internet connection/i);
      expect(banner.textContent).not.toContain(rawError);
      expect(screen.queryByTestId("review-hub-push-error-toggle")).toBeNull();
      expect(commitMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledTimes(1);

      pushMock.mockResolvedValueOnce(undefined);

      const retryBtn = screen.getByTestId("review-hub-push-error-cta");
      expect(retryBtn.textContent?.trim()).toBe("Retry");
      await act(async () => {
        fireEvent.click(retryBtn);
        await Promise.resolve();
      });

      await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(2));
      expect(commitMock).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByTestId("review-hub-push-error")).toBeNull());
    });

    it("renders the banner with the unknown reason when push rejects (throws)", async () => {
      pushMock.mockRejectedValueOnce(new Error("Could not resolve host: github.com"));

      await triggerCommitAndPush();

      const banner = await screen.findByTestId("review-hub-push-error");
      expect(banner.getAttribute("data-reason")).toBe("unknown");
      // "Push failed" appears exactly once — the title prepends it, so the
      // unknown message must not repeat it.
      expect(banner.textContent?.match(/Push failed/gi) ?? []).toHaveLength(1);
      expect(screen.queryByTestId("review-hub-push-error-details")).toBeNull();
      fireEvent.click(screen.getByTestId("review-hub-push-error-toggle"));
      expect(screen.getByTestId("review-hub-push-error-details").textContent).toBe(
        "Could not resolve host: github.com"
      );
    });

    it("updates the banner when a retry fails with a different reason", async () => {
      pushMock.mockRejectedValueOnce(
        Object.assign(new Error("Could not resolve host: github.com"), {
          name: "GitOperationError",
          gitReason: "network-unavailable",
        })
      );

      await triggerCommitAndPush();

      await screen.findByTestId("review-hub-push-error");

      pushMock.mockRejectedValueOnce(
        Object.assign(new Error("[remote rejected] main -> main (pre-receive hook declined)"), {
          name: "GitOperationError",
          gitReason: "hook-rejected",
        })
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("review-hub-push-error-cta"));
        await Promise.resolve();
      });

      await waitFor(() =>
        expect(screen.getByTestId("review-hub-push-error").getAttribute("data-reason")).toBe(
          "hook-rejected"
        )
      );
      expect(screen.queryByTestId("review-hub-push-error-cta")).toBeNull();
    });

    it("clears the push banner when the modal is closed and reopened", async () => {
      pushMock.mockRejectedValue(
        Object.assign(new Error("Authentication failed"), {
          name: "GitOperationError",
          gitReason: "auth-failed",
        })
      );

      getStagingStatusMock.mockResolvedValue(makeStatus({ hasRemote: true }));
      const { rerender } = render(
        <ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />
      );
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      fireEvent.change(screen.getByPlaceholderText("Commit message…"), {
        target: { value: "feat: thing" },
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Commit & Push/i }));
        await Promise.resolve();
      });
      await screen.findByTestId("review-hub-push-error");

      rerender(<ReviewHub isOpen={false} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      rerender(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => expect(screen.queryByTestId("review-hub-push-error")).toBeNull());
    });

    it("does not call push when commit itself fails", async () => {
      commitMock.mockRejectedValueOnce(new Error("nothing to commit"));
      getStagingStatusMock.mockResolvedValue(makeStatus({ hasRemote: true }));

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      fireEvent.change(screen.getByPlaceholderText("Commit message…"), {
        target: { value: "feat: thing" },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Commit & Push/i }));
        await Promise.resolve();
      });

      expect(pushMock).not.toHaveBeenCalled();
      expect(screen.queryByTestId("review-hub-push-error")).toBeNull();
      await waitFor(() => screen.getByText("nothing to commit"));
    });

    it("falls back to generic copy + collapsed raw stderr for an unclassified failure", async () => {
      const rawError = "unexpected: something weird happened";
      pushMock.mockRejectedValue(new Error(rawError));

      await triggerCommitAndPush();

      const banner = await screen.findByTestId("review-hub-push-error");
      expect(banner.getAttribute("data-reason")).toBe("unknown");
      expect(banner.textContent).toMatch(/Push failed/i);
      expect(screen.queryByTestId("review-hub-push-error-details")).toBeNull();
      expect(screen.queryByTestId("review-hub-push-error-cta")).toBeNull();
      fireEvent.click(screen.getByTestId("review-hub-push-error-toggle"));
      expect(screen.getByTestId("review-hub-push-error-details").textContent).toBe(rawError);
    });

    it("shows a rate-limit message when push throws AppError(RATE_LIMITED)", async () => {
      pushMock.mockRejectedValue(
        Object.assign(new Error("Rate limit exceeded"), {
          name: "AppError",
          code: "RATE_LIMITED",
        })
      );

      await triggerCommitAndPush();

      const banner = await screen.findByTestId("review-hub-push-error");
      expect(banner.getAttribute("data-reason")).toBe("unknown");
      expect(screen.queryByTestId("review-hub-push-error-details")).toBeNull();
      fireEvent.click(screen.getByTestId("review-hub-push-error-toggle"));
      expect(screen.getByTestId("review-hub-push-error-details").textContent).toMatch(
        /Too many push attempts/i
      );
    });

    it("does not render the banner on successful push", async () => {
      pushMock.mockResolvedValue(undefined);

      await triggerCommitAndPush();

      await waitFor(() => expect(pushMock).toHaveBeenCalled());
      expect(screen.queryByTestId("review-hub-push-error")).toBeNull();
    });

    it("shows the 'Push failed' title across reasons", async () => {
      pushMock.mockRejectedValue(
        Object.assign(new Error("Authentication failed"), {
          name: "GitOperationError",
          gitReason: "auth-failed",
        })
      );

      await triggerCommitAndPush();

      const banner = await screen.findByTestId("review-hub-push-error");
      expect(banner.textContent).toMatch(/Push failed/i);
    });

    it("extracts and displays a GH code when present in the raw message", async () => {
      pushMock.mockRejectedValue(
        Object.assign(new Error("GH013: Repository rule violations found."), {
          name: "GitOperationError",
          gitReason: "push-rejected-policy",
        })
      );

      await triggerCommitAndPush();

      await screen.findByTestId("review-hub-push-error");
      expect(screen.getByTestId("review-hub-push-error-code").textContent).toBe("GH013");
      // Code stays visible without expanding the toggle.
      expect(screen.queryByTestId("review-hub-push-error-details")).toBeNull();
    });

    it("does not render a GH code element when none is present", async () => {
      pushMock.mockRejectedValue(
        Object.assign(new Error("[remote rejected] main -> main (pre-receive hook declined)"), {
          name: "GitOperationError",
          gitReason: "hook-rejected",
        })
      );

      await triggerCommitAndPush();

      await screen.findByTestId("review-hub-push-error");
      expect(screen.queryByTestId("review-hub-push-error-code")).toBeNull();
    });

    it("hides raw output entirely for hide-policy reasons (no toggle)", async () => {
      pushMock.mockRejectedValue(
        Object.assign(new Error("fatal: Authentication failed for 'https://github.com/'"), {
          name: "GitOperationError",
          gitReason: "auth-failed",
        })
      );

      await triggerCommitAndPush();

      await screen.findByTestId("review-hub-push-error");
      expect(screen.queryByTestId("review-hub-push-error-toggle")).toBeNull();
      expect(screen.queryByTestId("review-hub-push-error-details")).toBeNull();
    });

    it("resets the details toggle when a retry surfaces a new push error", async () => {
      // First failure: network-unavailable has a Retry CTA but no toggle.
      pushMock.mockRejectedValueOnce(
        Object.assign(new Error("Could not resolve host: github.com"), {
          name: "GitOperationError",
          gitReason: "network-unavailable",
        })
      );

      await triggerCommitAndPush();

      await screen.findByTestId("review-hub-push-error");
      expect(screen.queryByTestId("review-hub-push-error-toggle")).toBeNull();

      // Retry rejects with a collapse-policy reason; the new banner must start collapsed
      // (i.e. the toggle state from any prior banner doesn't leak in).
      const retryError = "[remote rejected] main -> main (pre-receive hook declined)";
      pushMock.mockRejectedValueOnce(
        Object.assign(new Error(retryError), {
          name: "GitOperationError",
          gitReason: "hook-rejected",
        })
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("review-hub-push-error-cta"));
        await Promise.resolve();
      });

      await waitFor(() =>
        expect(screen.getByTestId("review-hub-push-error").getAttribute("data-reason")).toBe(
          "hook-rejected"
        )
      );
      expect(screen.queryByTestId("review-hub-push-error-details")).toBeNull();
      const toggle = screen.getByTestId("review-hub-push-error-toggle");
      expect(toggle.textContent).toMatch(/Show details/i);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(toggle);
      expect(screen.getByTestId("review-hub-push-error-details").textContent).toBe(retryError);
    });
  });

  describe("section toolbar", () => {
    const multiFileStatus = (): StagingStatus => ({
      staged: [
        { path: "src/index.ts", status: "modified", insertions: null, deletions: null },
        { path: "src/utils.ts", status: "added", insertions: null, deletions: null },
        { path: "package-lock.json", status: "modified", insertions: null, deletions: null },
      ],
      unstaged: [
        { path: "src/app.ts", status: "modified", insertions: null, deletions: null },
        { path: "src/legacy.ts", status: "deleted", insertions: null, deletions: null },
        { path: "docs/readme.md", status: "untracked", insertions: null, deletions: null },
      ],
      conflicted: [],
      conflictedFiles: [],
      isDetachedHead: false,
      currentBranch: "feature/test",
      hasRemote: false,
      repoState: "DIRTY",
      rebaseStep: null,
      rebaseTotalSteps: null,
      rebaseSequence: null,
    });

    it("renders filter input in both section headers", async () => {
      getStagingStatusMock.mockResolvedValue(multiFileStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));
      const filters = screen.getAllByPlaceholderText("Filter…");
      expect(filters).toHaveLength(2);
    });

    it("renders view-options dropdown triggers in both section headers", async () => {
      getStagingStatusMock.mockResolvedValue(multiFileStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));
      const viewOptionBtns = screen.getAllByLabelText("View options");
      expect(viewOptionBtns).toHaveLength(2);
    });

    it("shows count chip with total file count", async () => {
      getStagingStatusMock.mockResolvedValue(multiFileStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));
      // Verify the section headers show "Staged" and "Changes" labels with counts
      screen.getByText("Staged");
      screen.getByText("Changes");
      // Both sections have 3 files each, and the bulk buttons also show counts
      screen.getByText("Stage all (3)");
      screen.getByText("Unstage all (3)");
    });

    it("renders Stage all (N) button with correct count", async () => {
      getStagingStatusMock.mockResolvedValue(multiFileStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));
      screen.getByText("Stage all (3)");
      screen.getByText("Unstage all (3)");
    });

    it("filters files when typing in filter input", async () => {
      getStagingStatusMock.mockResolvedValue(multiFileStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));

      const filters = screen.getAllByPlaceholderText("Filter…");
      // Type in the Changes filter to find only legacy.ts
      fireEvent.change(filters[1]!, { target: { value: "legacy" } });

      await waitFor(() => {
        expect(screen.queryByText("app.ts")).toBeNull();
        expect(screen.queryByText("readme.md")).toBeNull();
        screen.getByText("legacy.ts");
      });
    });

    it("shows Stage shown (N) when filter is active", async () => {
      getStagingStatusMock.mockResolvedValue(multiFileStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));

      const filters = screen.getAllByPlaceholderText("Filter…");
      fireEvent.change(filters[1]!, { target: { value: "legacy" } });

      await waitFor(() => screen.getByText("Stage shown (1)"));
    });

    it("shows filtered-empty state when no files match filter", async () => {
      getStagingStatusMock.mockResolvedValue(multiFileStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));

      const filters = screen.getAllByPlaceholderText("Filter…");
      fireEvent.change(filters[0]!, { target: { value: "zzz_nonexistent" } });

      await waitFor(() => screen.getByTestId("empty-state-filtered-empty"));
      screen.getByText('No staged files matching "zzz_nonexistent"');
    });

    it("shows Clear filter link in filtered-empty state", async () => {
      getStagingStatusMock.mockResolvedValue(multiFileStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));

      const filters = screen.getAllByPlaceholderText("Filter…");
      fireEvent.change(filters[1]!, { target: { value: "zzz" } });

      await waitFor(() => screen.getByText("Clear filter"));
    });

    it("hides generated files when showGenerated is toggled off", async () => {
      getStagingStatusMock.mockResolvedValue(multiFileStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => {
        // package-lock.json should be visible by default
        screen.getByText("package-lock.json");
      });

      // Simulate toggling showGenerated off in Staged section
      // Since DropdownMenu is mocked, we directly call the onCheckedChange via
      // finding the checkbox item and clicking it
      const checkboxes = screen.getAllByRole("menuitemcheckbox");
      // First checkbox is for Staged section "Show generated files"
      fireEvent.click(checkboxes[0]!);

      await waitFor(() => {
        expect(screen.queryByText("package-lock.json")).toBeNull();
      });
    });

    it("uses stageAll IPC when no filter is active", async () => {
      getStagingStatusMock.mockResolvedValue(multiFileStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));

      const stageAllBtn = screen.getByTestId("review-hub-stage-all");
      fireEvent.click(stageAllBtn);

      await waitFor(() => {
        expect(window.electron.git.stageAll).toHaveBeenCalledWith(WORKTREE_PATH);
      });
    });

    it("uses per-file stageFile when filter is active", async () => {
      getStagingStatusMock.mockResolvedValue(multiFileStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));

      const filters = screen.getAllByPlaceholderText("Filter…");
      fireEvent.change(filters[1]!, { target: { value: "legacy" } });

      await waitFor(() => screen.getByText("Stage shown (1)"));

      const stageBtn = screen.getByTestId("review-hub-stage-all");
      fireEvent.click(stageBtn);

      await waitFor(() => {
        expect(stageFileMock).toHaveBeenCalledWith(WORKTREE_PATH, "src/legacy.ts");
        expect(window.electron.git.stageAll).not.toHaveBeenCalled();
      });
    });

    it("uses unstageAll IPC when no filter is active", async () => {
      getStagingStatusMock.mockResolvedValue(multiFileStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));

      const unstageAllBtn = screen.getByTestId("review-hub-unstage-all");
      fireEvent.click(unstageAllBtn);

      await waitFor(() => {
        expect(window.electron.git.unstageAll).toHaveBeenCalledWith(WORKTREE_PATH);
      });
    });

    it("passes density prop to FileStageRow (comfortable by default)", async () => {
      getStagingStatusMock.mockResolvedValue(multiFileStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));

      // The rows render with the comfortable density by default (py-1.5)
      const stagedContainer = screen.getByText("index.ts").closest(".flex.flex-col");
      expect(stagedContainer?.className).toMatch(/gap-0\.5/);
    });

    it("shows bulk button hidden when no files in section", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeStatus({
          staged: [{ path: "src/a.ts", status: "modified", insertions: null, deletions: null }],
          unstaged: [],
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("No unstaged changes"));
      // Stage all button (for Changes section) should be hidden when there are no unstaged files
      expect(screen.queryByTestId("review-hub-stage-all")).toBeNull();
      // Unstage all button (for Staged section) should be visible with 1 file
      screen.getByTestId("review-hub-unstage-all");
    });

    it("filter input uses ref for typing (no re-render on each keystroke)", async () => {
      getStagingStatusMock.mockResolvedValue(multiFileStatus());

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));

      const filters = screen.getAllByPlaceholderText("Filter…");
      // Just typing should not crash or cause focus loss — the debounce ref handles it
      fireEvent.change(filters[0]!, { target: { value: "src" } });

      // The input value is set via ref, not state, so it shouldn't cause thrashing
      // Verify the input has the value
      expect((filters[0]! as HTMLInputElement).value).toBe("src");
    });

    it("shows No staged files when section is empty but filter is not active", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeStatus({
          staged: [],
          unstaged: [{ path: "src/b.ts", status: "modified", insertions: null, deletions: null }],
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => {
        screen.getByText("No staged files");
        screen.getByText("b.ts");
      });
    });

    it("renders files sorted by path ascending by default", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeStatus({
          staged: [
            { path: "ccc.ts", status: "added", insertions: null, deletions: null },
            { path: "aaa.ts", status: "modified", insertions: null, deletions: null },
            { path: "bbb.ts", status: "deleted", insertions: null, deletions: null },
          ],
          unstaged: [],
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("aaa.ts"));

      // Path asc sort: aaa.ts DOM position < bbb.ts < ccc.ts
      const rows = screen.getAllByText(/\.ts$/).filter((el) => el.tagName === "SPAN");
      const texts = rows.map((el) => el.textContent);
      const aaaIdx = texts.indexOf("aaa.ts");
      const bbbIdx = texts.indexOf("bbb.ts");
      const cccIdx = texts.indexOf("ccc.ts");
      expect(aaaIdx).toBeLessThan(bbbIdx);
      expect(bbbIdx).toBeLessThan(cccIdx);
    });

    it("detects lock files as generated", async () => {
      getStagingStatusMock.mockResolvedValue(
        makeStatus({
          staged: [
            { path: "package-lock.json", status: "modified", insertions: null, deletions: null },
            { path: "yarn.lock", status: "modified", insertions: null, deletions: null },
            { path: "src/app.ts", status: "modified", insertions: null, deletions: null },
          ],
          unstaged: [],
        })
      );

      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => {
        screen.getByText("package-lock.json");
        screen.getByText("yarn.lock");
        screen.getByText("app.ts");
      });

      // Toggle showGenerated off in Staged section
      const checkboxes = screen.getAllByRole("menuitemcheckbox");
      fireEvent.click(checkboxes[0]!);

      await waitFor(() => {
        expect(screen.queryByText("package-lock.json")).toBeNull();
        expect(screen.queryByText("yarn.lock")).toBeNull();
        screen.getByText("app.ts");
      });
    });
  });

  describe("commit message overflow", () => {
    it("shows warning when any line exceeds 72 characters", async () => {
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…");
      // Subject line within limit, but body line exceeds 72
      fireEvent.change(textarea, {
        target: {
          value:
            "feat: short subject\n\nThe quick brown fox jumps over the lazy dog and then some more text goes here yes indeed wow",
        },
      });

      expect(screen.getByText("Line over 72 chars")).toBeTruthy();
      expect(textarea.className).toContain("border-status-warning");
    });

    it("shows warning when subject line alone exceeds 72 characters", async () => {
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…");
      // Subject line exceeds 72 chars — should trigger overflow
      fireEvent.change(textarea, {
        target: {
          value:
            "feat: this is a very long subject line that goes way beyond seventy two characters and should trigger the warning",
        },
      });

      expect(screen.getByText("Line over 72 chars")).toBeTruthy();
      expect(textarea.className).toContain("border-status-warning");
    });

    it("does not show warning when all lines are 72 characters or fewer", async () => {
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…");
      fireEvent.change(textarea, {
        target: { value: "feat: short subject\n\nA normal body line." },
      });

      expect(screen.queryByText("Line over 72 chars")).toBeNull();
      expect(textarea.className).toContain("border-divider");
      expect(textarea.className).not.toContain("border-status-warning");
    });

    it("shows subject line length counter", async () => {
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…");
      fireEvent.change(textarea, {
        target: { value: "fix: resolve bug" },
      });

      expect(screen.getByText("16/72")).toBeTruthy();
    });
  });

  describe("commit history arrow-key cycling", () => {
    function renderOpen() {
      return render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
    }

    it("fetches and cycles through recent commits on ArrowUp from caret 0", async () => {
      listCommitsMock.mockResolvedValue({
        items: [
          {
            hash: "abc1234",
            shortHash: "abc1234",
            message: "feat: most recent commit",
            author: { name: "Test", email: "test@example.com" },
            date: "2026-05-10",
          },
          {
            hash: "def5678",
            shortHash: "def5678",
            message: "fix: older commit",
            body: "Detailed body text.",
            author: { name: "Test", email: "test@example.com" },
            date: "2026-05-09",
          },
        ],
        hasMore: false,
        total: 2,
      });

      renderOpen();
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…") as HTMLTextAreaElement;

      // Position cursor at 0 (empty textarea)
      textarea.setSelectionRange(0, 0);

      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      expect(listCommitsMock).toHaveBeenCalledWith({
        cwd: WORKTREE_PATH,
        limit: 8,
      });

      // Wait for the async fetch to resolve and re-render
      await act(async () => {
        await Promise.resolve();
      });

      // After fetch, the textarea should show the most recent commit message
      expect(textarea.value).toBe("feat: most recent commit");

      // ArrowUp again → next older commit (with body)
      textarea.setSelectionRange(0, 0);
      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      expect(textarea.value).toBe("fix: older commit\n\nDetailed body text.");

      // ArrowUp again → no more commits, stays at last
      textarea.setSelectionRange(0, 0);
      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      expect(textarea.value).toBe("fix: older commit\n\nDetailed body text.");
    });

    it("ArrowDown unwinds through history and restores original draft", async () => {
      listCommitsMock.mockResolvedValue({
        items: [
          {
            hash: "abc1234",
            shortHash: "abc1234",
            message: "feat: most recent commit",
            author: { name: "Test", email: "test@example.com" },
            date: "2026-05-10",
          },
        ],
        hasMore: false,
        total: 1,
      });

      renderOpen();
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…") as HTMLTextAreaElement;

      // Type a draft first
      fireEvent.change(textarea, { target: { value: "my draft message" } });
      textarea.setSelectionRange(0, 0);

      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      await act(async () => {
        await Promise.resolve();
      });

      expect(textarea.value).toBe("feat: most recent commit");

      // ArrowDown → back to draft
      textarea.setSelectionRange(0, 0);
      fireEvent.keyDown(textarea, { key: "ArrowDown" });
      expect(textarea.value).toBe("my draft message");
    });

    it("does not intercept ArrowUp when caret is not at position 0", async () => {
      renderOpen();
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…") as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: "some text" } });
      // Caret in middle of text
      textarea.setSelectionRange(4, 4);

      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      expect(listCommitsMock).not.toHaveBeenCalled();
    });

    it("resets history index when user types manually after cycling", async () => {
      listCommitsMock.mockResolvedValue({
        items: [
          {
            hash: "abc1234",
            shortHash: "abc1234",
            message: "feat: first commit",
            author: { name: "Test", email: "test@example.com" },
            date: "2026-05-10",
          },
          {
            hash: "def5678",
            shortHash: "def5678",
            message: "feat: second commit",
            author: { name: "Test", email: "test@example.com" },
            date: "2026-05-09",
          },
        ],
        hasMore: false,
        total: 2,
      });

      renderOpen();
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…") as HTMLTextAreaElement;

      textarea.setSelectionRange(0, 0);
      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      await act(async () => {
        await Promise.resolve();
      });
      expect(textarea.value).toBe("feat: first commit");

      // Type manually — should reset history index and start fresh on next ArrowUp
      fireEvent.change(textarea, { target: { value: "typed after cycling" } });

      textarea.setSelectionRange(0, 0);
      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      // Should show most recent again (cycling from start), not the second-oldest
      expect(textarea.value).toBe("feat: first commit");

      textarea.setSelectionRange(0, 0);
      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      expect(textarea.value).toBe("feat: second commit");
    });

    it("ArrowUp does nothing when there is no commit history", async () => {
      listCommitsMock.mockResolvedValue({ items: [], hasMore: false, total: 0 });

      renderOpen();
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…") as HTMLTextAreaElement;

      textarea.setSelectionRange(0, 0);
      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      await act(async () => {
        await Promise.resolve();
      });

      expect(textarea.value).toBe("");
    });

    it("ArrowDown does nothing when not in history mode", async () => {
      renderOpen();
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…") as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: "no history here" } });
      textarea.setSelectionRange(0, 0);

      fireEvent.keyDown(textarea, { key: "ArrowDown" });
      // Should remain unchanged
      expect(textarea.value).toBe("no history here");
    });

    it("does not intercept ArrowUp with modifier keys", async () => {
      renderOpen();
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…") as HTMLTextAreaElement;

      textarea.setSelectionRange(0, 0);

      fireEvent.keyDown(textarea, { key: "ArrowUp", altKey: true });
      expect(listCommitsMock).not.toHaveBeenCalled();
    });

    it("sets ruler background styling on textarea", async () => {
      renderOpen();
      await waitFor(() => screen.getByPlaceholderText("Commit message…"));

      const textarea = screen.getByPlaceholderText("Commit message…") as HTMLTextAreaElement;

      const styleAttr = textarea.getAttribute("style") ?? "";
      expect(styleAttr).toContain("linear-gradient");
      expect(styleAttr).toContain("72ch");
      expect(styleAttr).toContain("rgba");
      expect(styleAttr).toContain("background-origin: content-box");
      expect(styleAttr).toContain("background-attachment: local");
    });
  });

  describe("per-file Viewed checkbox", () => {
    it("renders an unchecked Viewed checkbox next to each file row", async () => {
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));

      const viewedCheckboxes = screen.getAllByRole("checkbox", { name: /Mark .* as viewed/ });
      // One per file (1 staged + 1 unstaged from makeStatus).
      expect(viewedCheckboxes).toHaveLength(2);
      for (const cb of viewedCheckboxes) {
        expect((cb as HTMLInputElement).checked).toBe(false);
      }
    });

    it("toggles a file's Viewed state when its checkbox is clicked", async () => {
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));

      const indexCheckbox = screen.getByRole("checkbox", {
        name: "Mark src/index.ts as viewed",
      }) as HTMLInputElement;
      expect(indexCheckbox.checked).toBe(false);

      fireEvent.click(indexCheckbox);

      // After being checked, the aria-label flips so we now look for the inverse.
      const stillThere = screen.getByRole("checkbox", {
        name: "Mark src/index.ts as not viewed",
      }) as HTMLInputElement;
      expect(stillThere.checked).toBe(true);
    });

    it("does not open the diff modal when the Viewed checkbox is clicked", async () => {
      fileDiffModalOpenHistory.value = [];
      render(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));

      const indexCheckbox = screen.getByRole("checkbox", {
        name: "Mark src/index.ts as viewed",
      });
      fileDiffModalOpenHistory.value = [];

      fireEvent.click(indexCheckbox);

      // FileDiffModal is rendered with isOpen=true only when selectedFile is set.
      // After the checkbox click, none of its renders should have isOpen=true.
      expect(fileDiffModalOpenHistory.value.some((o) => o === true)).toBe(false);
    });

    it("resets Viewed state when the modal closes and reopens", async () => {
      const { rerender } = render(
        <ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />
      );

      await waitFor(() => screen.getByText("index.ts"));

      fireEvent.click(screen.getByRole("checkbox", { name: "Mark src/index.ts as viewed" }));

      rerender(<ReviewHub isOpen={false} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);
      rerender(<ReviewHub isOpen={true} worktreePath={WORKTREE_PATH} onClose={vi.fn()} />);

      await waitFor(() => screen.getByText("index.ts"));

      const reopened = screen.getByRole("checkbox", {
        name: "Mark src/index.ts as viewed",
      }) as HTMLInputElement;
      expect(reopened.checked).toBe(false);
    });
  });
});
