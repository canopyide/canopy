import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { StagingStatus, GitStatus } from "@shared/types";
import type { CrossWorktreeFile } from "@shared/types/ipc/git";
import type { GitOperationReason } from "@shared/types/ipc/errors";
import { isClientAppError } from "@/utils/clientAppError";
import { debounce } from "@/utils/debounce";
import { useWorktreeStore } from "@/hooks/useWorktreeStore";
import { useShallow } from "zustand/react/shallow";
import { formatErrorMessage } from "@shared/utils/errorMessage";

export type DiffMode = "working-tree" | "base-branch";

export interface PushErrorState {
  reason: GitOperationReason;
  rawMessage: string;
}

export type PushBannerCta =
  | { kind: "settings-github"; label: string }
  | { kind: "retry"; label: string };

export interface PushBannerConfig {
  message: string;
  showRaw: boolean;
  cta?: PushBannerCta;
}

export function getPushBannerConfig(reason: GitOperationReason): PushBannerConfig {
  switch (reason) {
    case "auth-failed":
      return {
        message: "Authentication failed — check your credentials or SSH key.",
        showRaw: false,
        cta: { kind: "settings-github", label: "Open GitHub settings" },
      };
    case "push-rejected-outdated":
      return {
        message: "The remote has new commits. Pull or rebase before pushing.",
        showRaw: false,
      };
    case "push-rejected-policy":
      return {
        message: "The remote rejected this push (protected branch or repository rule).",
        showRaw: true,
      };
    case "hook-rejected":
      return {
        message: "A server-side hook rejected the push.",
        showRaw: true,
      };
    case "network-unavailable":
      return {
        message: "Could not reach the remote. Check your internet connection.",
        showRaw: false,
        cta: { kind: "retry", label: "Retry push" },
      };
    default:
      return { message: "Push failed. See details below.", showRaw: true };
  }
}

export function statusLabel(status: string): { label: string; className: string } {
  switch (status) {
    case "A":
      return { label: "A", className: "text-status-success" };
    case "D":
      return { label: "D", className: "text-status-error" };
    case "M":
      return { label: "M", className: "text-status-warning" };
    case "R":
      return { label: "R", className: "text-status-info" };
    case "C":
      return { label: "C", className: "text-github-merged" };
    default:
      return { label: status, className: "text-text-muted" };
  }
}

export interface WorktreePRInfo {
  prNumber: number;
  prUrl?: string;
  prState?: "open" | "closed" | "merged";
}

export interface UseReviewHubStateOptions {
  worktreePath: string;
  active: boolean;
}

export function useReviewHubState({ worktreePath, active }: UseReviewHubStateOptions) {
  const [status, setStatus] = useState<StagingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pushError, setPushError] = useState<PushErrorState | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    status: GitStatus;
  } | null>(null);
  const [diffMode, setDiffMode] = useState<DiffMode>("working-tree");
  const [baseBranchFiles, setBaseBranchFiles] = useState<CrossWorktreeFile[] | null>(null);
  const [baseBranchLoading, setBaseBranchLoading] = useState(false);
  const [baseBranchError, setBaseBranchError] = useState<string | null>(null);
  const [selectedBaseBranchFile, setSelectedBaseBranchFile] = useState<CrossWorktreeFile | null>(
    null
  );
  const refreshIdRef = useRef(0);
  const bgRefreshIdRef = useRef(0);
  const baseBranchRequestRef = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);
  const debouncedBgRefreshRef = useRef<ReturnType<typeof debounce> | null>(null);

  const mainBranch = useWorktreeStore(
    (state) =>
      Array.from(state.worktrees.values()).find((wt) => wt.isMainWorktree)?.branch ?? "main"
  );

  const worktreePR = useWorktreeStore(
    useShallow((state) => {
      for (const wt of state.worktrees.values()) {
        if (wt.path === worktreePath) {
          return wt.prNumber
            ? { prNumber: wt.prNumber, prUrl: wt.prUrl, prState: wt.prState }
            : null;
        }
      }
      return null;
    })
  );

  const refresh = useCallback(async () => {
    if (!worktreePath) return;
    const requestId = ++refreshIdRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await window.electron.git.getStagingStatus(worktreePath);
      if (refreshIdRef.current === requestId) {
        setStatus(result);
      }
    } catch (err) {
      if (refreshIdRef.current === requestId) {
        setLoadError(formatErrorMessage(err, "Failed to load staging status"));
      }
    } finally {
      if (refreshIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [worktreePath]);

  const backgroundRefresh = useCallback(async () => {
    if (!worktreePath) return;
    const requestId = ++bgRefreshIdRef.current;
    setIsBackgroundRefreshing(true);
    try {
      const result = await window.electron.git.getStagingStatus(worktreePath);
      if (bgRefreshIdRef.current === requestId) {
        setStatus(result);
        setLoadError(null);
      }
    } catch {
      // Keep existing data visible; silently drop background errors
    } finally {
      if (bgRefreshIdRef.current === requestId) {
        setIsBackgroundRefreshing(false);
      }
    }
  }, [worktreePath]);

  const fetchBaseBranch = useCallback(async () => {
    const currentBranch = status?.currentBranch;
    if (!currentBranch || !worktreePath) return;
    if (currentBranch === mainBranch) return;

    const requestId = ++baseBranchRequestRef.current;
    setBaseBranchLoading(true);
    setBaseBranchError(null);
    setBaseBranchFiles(null);
    setSelectedBaseBranchFile(null);

    try {
      const res = await window.electron.git.compareWorktrees(
        worktreePath,
        mainBranch,
        currentBranch,
        undefined,
        true
      );
      if (baseBranchRequestRef.current !== requestId) return;
      if (typeof res === "string") {
        setBaseBranchError("Unexpected result from comparison");
        return;
      }
      setBaseBranchFiles(res.files);
    } catch (err) {
      if (baseBranchRequestRef.current !== requestId) return;
      setBaseBranchError(formatErrorMessage(err, "Failed to load base branch diff"));
    } finally {
      if (baseBranchRequestRef.current === requestId) setBaseBranchLoading(false);
    }
  }, [worktreePath, mainBranch, status?.currentBranch]);

  useEffect(() => {
    if (active) {
      setActionError(null);
      setPushError(null);
      void refresh();
    } else {
      refreshIdRef.current++;
      bgRefreshIdRef.current++;
      baseBranchRequestRef.current++;
      setStatus(null);
      setLoadError(null);
      setActionError(null);
      setPushError(null);
      setSelectedFile(null);
      setCommitMessage("");
      setIsBackgroundRefreshing(false);
      setDiffMode("working-tree");
      setBaseBranchFiles(null);
      setBaseBranchError(null);
      setSelectedBaseBranchFile(null);
    }
  }, [active, refresh]);

  useEffect(() => {
    if (diffMode === "base-branch" && status?.currentBranch === mainBranch) {
      baseBranchRequestRef.current++;
      setDiffMode("working-tree");
      setBaseBranchFiles(null);
      setBaseBranchError(null);
      setSelectedBaseBranchFile(null);
    }
  }, [status?.currentBranch, mainBranch, diffMode]);

  useEffect(() => {
    if (!active) return;

    const debouncedBgRefresh = debounce(() => void backgroundRefresh(), 800);
    debouncedBgRefreshRef.current = debouncedBgRefresh;

    const unsubscribe = window.electron.worktree.onUpdate((state) => {
      if (state.path === worktreePath) {
        debouncedBgRefresh();
      }
    });

    return () => {
      unsubscribe();
      debouncedBgRefresh.cancel();
      debouncedBgRefreshRef.current = null;
    };
  }, [active, worktreePath, backgroundRefresh]);

  const handleStageFile = useCallback(
    async (filePath: string) => {
      setActionError(null);
      debouncedBgRefreshRef.current?.cancel();
      try {
        await window.electron.git.stageFile(worktreePath, filePath);
        await refresh();
      } catch (err) {
        setActionError(formatErrorMessage(err, "Failed to stage file"));
      }
    },
    [worktreePath, refresh]
  );

  const handleUnstageFile = useCallback(
    async (filePath: string) => {
      setActionError(null);
      debouncedBgRefreshRef.current?.cancel();
      try {
        await window.electron.git.unstageFile(worktreePath, filePath);
        await refresh();
      } catch (err) {
        setActionError(formatErrorMessage(err, "Failed to unstage file"));
      }
    },
    [worktreePath, refresh]
  );

  const handleStageAll = useCallback(async () => {
    setActionError(null);
    debouncedBgRefreshRef.current?.cancel();
    try {
      await window.electron.git.stageAll(worktreePath);
      await refresh();
    } catch (err) {
      setActionError(formatErrorMessage(err, "Failed to stage all files"));
    }
  }, [worktreePath, refresh]);

  const handleUnstageAll = useCallback(async () => {
    setActionError(null);
    debouncedBgRefreshRef.current?.cancel();
    try {
      await window.electron.git.unstageAll(worktreePath);
      await refresh();
    } catch (err) {
      setActionError(formatErrorMessage(err, "Failed to unstage all files"));
    }
  }, [worktreePath, refresh]);

  const handleCommit = useCallback(
    async (message: string) => {
      setActionError(null);
      debouncedBgRefreshRef.current?.cancel();
      try {
        await window.electron.git.commit(worktreePath, message);
        await refresh();
      } catch (err) {
        setActionError(formatErrorMessage(err, "Failed to commit changes"));
        throw err;
      }
    },
    [worktreePath, refresh]
  );

  const handleAbortOperation = useCallback(async () => {
    setActionError(null);
    debouncedBgRefreshRef.current?.cancel();
    try {
      await window.electron.git.abortRepositoryOperation(worktreePath);
      await refresh();
    } catch (err) {
      setActionError(formatErrorMessage(err, "Failed to abort repository operation"));
      throw err;
    }
  }, [worktreePath, refresh]);

  const handleContinueOperation = useCallback(async () => {
    setActionError(null);
    debouncedBgRefreshRef.current?.cancel();
    try {
      await window.electron.git.continueRepositoryOperation(worktreePath);
      await refresh();
    } catch (err) {
      setActionError(formatErrorMessage(err, "Failed to continue repository operation"));
      throw err;
    }
  }, [worktreePath, refresh]);

  const handleOpenInEditor = useCallback(
    async (filePath: string) => {
      setActionError(null);
      try {
        const base = worktreePath.replace(/\\/g, "/").replace(/\/+$/, "");
        const tail = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
        await window.electron.system.openInEditor({ path: `${base}/${tail}` });
      } catch (err) {
        setActionError(formatErrorMessage(err, "Failed to open file in editor"));
      }
    },
    [worktreePath]
  );

  const runPush = useCallback(async () => {
    try {
      await window.electron.git.push(worktreePath);
      setPushError(null);
    } catch (err) {
      // GitOperationError carries `gitReason` (auth-failed, push-rejected-*, etc.).
      // AppError carries `code` from a different union (RATE_LIMITED, etc.) — fall
      // back to "unknown" so getPushBannerConfig surfaces the raw message rather
      // than rendering an unmapped reason.
      const gitReason = (err as { gitReason?: GitOperationReason }).gitReason;
      const isRateLimited =
        isClientAppError(err) && (err as { code?: string }).code === "RATE_LIMITED";
      setPushError({
        reason: gitReason ?? "unknown",
        rawMessage: isRateLimited
          ? "Too many push attempts in a short window — wait a moment and try again."
          : formatErrorMessage(err, "Failed to push"),
      });
    }
  }, [worktreePath]);

  const handleCommitAndPush = useCallback(
    async (message: string) => {
      setActionError(null);
      setPushError(null);
      debouncedBgRefreshRef.current?.cancel();
      try {
        await window.electron.git.commit(worktreePath, message);
      } catch (err) {
        setActionError(formatErrorMessage(err, "Failed to commit changes"));
        throw err;
      }
      await refresh();
      await runPush();
    },
    [worktreePath, refresh, runPush]
  );

  const handleRetryPush = useCallback(async () => {
    setPushError(null);
    debouncedBgRefreshRef.current?.cancel();
    await runPush();
  }, [runPush]);

  useLayoutEffect(() => {
    if (scrollContainerRef.current && status) {
      scrollContainerRef.current.scrollTop = savedScrollTop.current;
    }
  }, [status]);

  const handleScrollContainer = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    savedScrollTop.current = e.currentTarget.scrollTop;
  }, []);

  const handleFileClick = useCallback((filePath: string, fileStatus: GitStatus) => {
    setSelectedFile({ path: filePath, status: fileStatus });
  }, []);

  const handleDiffModeChange = useCallback(
    (mode: DiffMode) => {
      setDiffMode(mode);
      if (mode === "base-branch" && baseBranchFiles === null && !baseBranchLoading) {
        void fetchBaseBranch();
      }
    },
    [baseBranchFiles, baseBranchLoading, fetchBaseBranch]
  );

  return {
    // State
    status,
    loading,
    isBackgroundRefreshing,
    loadError,
    actionError,
    pushError,
    commitMessage,
    selectedFile,
    diffMode,
    baseBranchFiles,
    baseBranchLoading,
    baseBranchError,
    selectedBaseBranchFile,
    mainBranch,
    worktreePR,
    // Refs
    scrollContainerRef,
    // Setters
    setCommitMessage,
    setSelectedFile,
    setSelectedBaseBranchFile,
    // Handlers
    refresh,
    fetchBaseBranch,
    handleStageFile,
    handleUnstageFile,
    handleStageAll,
    handleUnstageAll,
    handleCommit,
    handleCommitAndPush,
    handleAbortOperation,
    handleContinueOperation,
    handleOpenInEditor,
    handleRetryPush,
    handleScrollContainer,
    handleFileClick,
    handleDiffModeChange,
  };
}

export type ReviewHubStateReturn = ReturnType<typeof useReviewHubState>;
