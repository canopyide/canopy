import { useCallback, useState, useEffect, useMemo } from "react";
import type { WorktreeState, WorktreeMood } from "../../types";
import { ActivityLight } from "./ActivityLight";
import { AgentStatusIndicator } from "./AgentStatusIndicator";
import { FileChangeList } from "./FileChangeList";
import { TerminalCountBadge } from "./TerminalCountBadge";
import { ErrorBanner } from "../Errors/ErrorBanner";
import { useDevServer } from "../../hooks/useDevServer";
import { useWorktreeTerminals } from "../../hooks/useWorktreeTerminals";
import { useErrorStore, useTerminalStore, type RetryAction } from "../../store";
import { useRecipeStore } from "../../store/recipeStore";
import { cn } from "../../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ConfirmDialog } from "../Terminal/ConfirmDialog";

export interface WorktreeCardProps {
  worktree: WorktreeState;
  isActive: boolean;
  isFocused: boolean;
  onSelect: () => void;
  onCopyTree: () => void;
  onOpenEditor: () => void;
  onOpenIssue?: () => void;
  onOpenPR?: () => void;
  onToggleServer: () => void;
  /** Called when the inject context button is clicked */
  onInjectContext?: () => void;
  /** Whether context injection is currently in progress */
  isInjecting?: boolean;
  /** Called when user wants to create a new recipe */
  onCreateRecipe?: () => void;
}

const MOOD_ACCENT_COLORS: Record<WorktreeMood, string> = {
  active: "bg-blue-400",
  stable: "bg-green-400",
  stale: "bg-yellow-500",
  error: "bg-red-400",
};

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function parseNoteWithLinks(text: string): Array<{ type: "text" | "link"; content: string }> {
  const segments: Array<{ type: "text" | "link"; content: string }> = [];
  let lastIndex = 0;
  const regex = new RegExp(URL_REGEX.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "link", content: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}

function formatPath(targetPath: string): string {
  const home = process.env.HOME || "";
  if (home && targetPath.startsWith(home)) {
    return targetPath.replace(home, "~");
  }
  return targetPath;
}

const MAIN_WORKTREE_NOTE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function WorktreeCard({
  worktree,
  isActive,
  isFocused,
  onSelect,
  onCopyTree,
  onOpenEditor,
  onOpenIssue,
  onOpenPR,
  onToggleServer,
  onInjectContext,
  isInjecting = false,
  onCreateRecipe,
}: WorktreeCardProps) {
  const mood = worktree.mood || "stable";
  const moodColorClass = MOOD_ACCENT_COLORS[mood];

  // Recipe store
  const getRecipesForWorktree = useRecipeStore((state) => state.getRecipesForWorktree);
  const runRecipe = useRecipeStore((state) => state.runRecipe);
  const recipes = getRecipesForWorktree(worktree.id);
  const [runningRecipeId, setRunningRecipeId] = useState<string | null>(null);

  // Terminal counts and agent state
  const { counts: terminalCounts, dominantAgentState } = useWorktreeTerminals(worktree.id);

  // Terminal bulk actions
  const bulkCloseByWorktree = useTerminalStore((state) => state.bulkCloseByWorktree);
  const completedCount = terminalCounts.byState.completed;
  const failedCount = terminalCounts.byState.failed;
  const totalTerminalCount = terminalCounts.total;

  // Confirmation dialog state for bulk close all
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const {
    state: serverState,
    hasDevScript,
    isLoading: serverLoading,
  } = useDevServer({
    worktreeId: worktree.id,
    worktreePath: worktree.path,
  });

  // Get errors for this worktree - subscribe to store changes
  const worktreeErrors = useErrorStore((state) =>
    state.errors.filter((e) => e.context?.worktreeId === worktree.id && !e.dismissed)
  );
  const dismissError = useErrorStore((state) => state.dismissError);
  const removeError = useErrorStore((state) => state.removeError);

  // Handle error retry
  const handleErrorRetry = useCallback(
    async (errorId: string, action: RetryAction, args?: Record<string, unknown>) => {
      if (window.electron?.errors?.retry) {
        try {
          await window.electron.errors.retry(errorId, action, args);
          // On successful retry, remove the error from the store
          removeError(errorId);
        } catch (error) {
          console.error("Error retry failed:", error);
          // Retry failed - the main process will send a new error event
        }
      }
    },
    [removeError]
  );

  // For main worktree, notes expire after 10 minutes (real-time)
  const [now, setNow] = useState(() => Date.now());
  const isMainWorktree = worktree.branch === "main" || worktree.branch === "master";

  // Set up timer to re-check note expiration for main worktree
  useEffect(() => {
    if (!isMainWorktree || !worktree.aiNote || !worktree.aiNoteTimestamp) {
      return;
    }

    const expiresAt = worktree.aiNoteTimestamp + MAIN_WORKTREE_NOTE_TTL_MS;
    const timeUntilExpiry = expiresAt - Date.now();

    if (timeUntilExpiry <= 0) {
      setNow(Date.now());
      return;
    }

    const timer = setTimeout(() => {
      setNow(Date.now());
    }, timeUntilExpiry);

    return () => clearTimeout(timer);
  }, [isMainWorktree, worktree.aiNote, worktree.aiNoteTimestamp]);

  // Calculate effective note (applying TTL for main worktree)
  const effectiveNote = useMemo(() => {
    const trimmed = worktree.aiNote?.trim();
    if (!trimmed) return undefined;

    if (isMainWorktree && worktree.aiNoteTimestamp) {
      const age = now - worktree.aiNoteTimestamp;
      if (age > MAIN_WORKTREE_NOTE_TTL_MS) {
        return undefined;
      }
    }

    return trimmed;
  }, [worktree.aiNote, isMainWorktree, worktree.aiNoteTimestamp, now]);

  const parsedNoteSegments = useMemo(() => {
    return effectiveNote ? parseNoteWithLinks(effectiveNote) : [];
  }, [effectiveNote]);

  const handlePathClick = useCallback(() => {
    if (window.electron?.system?.openPath) {
      window.electron.system.openPath(worktree.path);
    }
  }, [worktree.path]);

  const handleOpenIssue = useCallback(() => {
    if (worktree.issueNumber && onOpenIssue) {
      onOpenIssue();
    }
  }, [worktree.issueNumber, onOpenIssue]);

  const handleOpenPR = useCallback(() => {
    if (worktree.prNumber && onOpenPR) {
      onOpenPR();
    }
  }, [worktree.prNumber, onOpenPR]);

  const handleRunRecipe = useCallback(
    async (recipeId: string) => {
      // Prevent concurrent recipe executions
      if (runningRecipeId !== null) {
        return;
      }

      setRunningRecipeId(recipeId);
      try {
        await runRecipe(recipeId, worktree.path, worktree.id);
      } catch (error) {
        console.error("Failed to run recipe:", error);
        // TODO: Show user-facing error notification
      } finally {
        setRunningRecipeId(null);
      }
    },
    [runRecipe, worktree.path, worktree.id, runningRecipeId]
  );

  // Terminal bulk action handlers
  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleCloseCompleted = useCallback(() => {
    bulkCloseByWorktree(worktree.id, "completed");
  }, [bulkCloseByWorktree, worktree.id]);

  const handleCloseFailed = useCallback(() => {
    bulkCloseByWorktree(worktree.id, "failed");
  }, [bulkCloseByWorktree, worktree.id]);

  const handleCloseAllTerminals = useCallback(() => {
    setConfirmDialog({
      isOpen: true,
      title: "Close All Terminals",
      description: `This will close ${totalTerminalCount} terminal${totalTerminalCount !== 1 ? "s" : ""} for this worktree. This action cannot be undone.`,
      onConfirm: () => {
        bulkCloseByWorktree(worktree.id);
        closeConfirmDialog();
      },
    });
  }, [totalTerminalCount, bulkCloseByWorktree, worktree.id, closeConfirmDialog]);

  const displayPath = formatPath(worktree.path);
  const branchLabel = worktree.branch ?? worktree.name;
  const hasChanges = (worktree.worktreeChanges?.changedFileCount ?? 0) > 0;

  // Summary component
  let summaryContent: React.ReactNode;
  const isCommitMessage =
    worktree.summary?.startsWith("Last commit:") || worktree.summary?.startsWith("✅");

  if (worktree.summary) {
    if (isCommitMessage) {
      summaryContent = <span className="text-gray-500">{worktree.summary}</span>;
    } else if (hasChanges) {
      summaryContent = <span className="text-gray-300">{worktree.summary}</span>;
    } else {
      summaryContent = <span className="text-gray-500">{worktree.summary}</span>;
    }
  } else if (worktree.aiStatus === "loading") {
    summaryContent = <span className="text-gray-500">Generating summary...</span>;
  } else {
    const fallbackText = worktree.branch ? `Clean: ${worktree.branch}` : "Ready";
    summaryContent = <span className="text-gray-500">{fallbackText}</span>;
  }

  // Server status helpers
  const getServerStatusIndicator = () => {
    if (!serverState) return null;
    switch (serverState.status) {
      case "stopped":
        return <span className="text-gray-500">○</span>;
      case "starting":
        return <span className="text-[var(--color-server-starting)]">◐</span>;
      case "running":
        return <span className="text-[var(--color-server-running)]">●</span>;
      case "error":
        return <span className="text-[var(--color-server-error)]">●</span>;
      default:
        return <span className="text-gray-500">○</span>;
    }
  };

  const getServerStatusText = () => {
    if (!serverState) return null;
    switch (serverState.status) {
      case "stopped":
        return <span className="text-gray-500">Dev Server</span>;
      case "starting":
        return <span className="text-[var(--color-server-starting)]">Starting...</span>;
      case "running":
        return serverState.url ? (
          <span className="text-[var(--color-server-running)]">{serverState.url}</span>
        ) : (
          <span className="text-[var(--color-server-running)]">Running</span>
        );
      case "error":
        return (
          <span className="text-[var(--color-server-error)]">
            {serverState.errorMessage ? `Error: ${serverState.errorMessage.slice(0, 40)}` : "Error"}
          </span>
        );
      default:
        return <span className="text-gray-500">Dev Server</span>;
    }
  };

  const getServerButtonLabel = () => {
    if (!serverState) return "Start";
    switch (serverState.status) {
      case "stopped":
        return "Start";
      case "starting":
        return "...";
      case "running":
        return "Stop";
      case "error":
        return "Retry";
      default:
        return "Start";
    }
  };

  const getServerButtonColor = () => {
    if (!serverState) return "text-[var(--color-status-success)]";
    switch (serverState.status) {
      case "stopped":
        return "text-[var(--color-status-success)]"; // Start button (green = go)
      case "starting":
        return "text-[var(--color-status-warning)]";
      case "running":
        return "text-[var(--color-status-error)]"; // Stop button (red = stop)
      case "error":
        return "text-[var(--color-status-success)]"; // Retry button (green = try again)
      default:
        return "text-gray-400";
    }
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-card/40 border border-border/50 p-4 mb-3 cursor-pointer transition-all",
        isActive ? "bg-accent/10 border-accent/20 hover:bg-accent/15" : "hover:bg-card/60",
        isFocused && "ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900"
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Worktree: ${branchLabel}`}
    >
      {/* Left-edge status bar */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", moodColorClass)} />

      {/* Content with left padding to avoid status bar */}
      <div className="pl-2">
        {/* Action buttons */}
        <div className="flex gap-2 mb-3 border-b border-gray-700 pb-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopyTree();
            }}
            className="text-xs px-2 py-1 border border-gray-600 rounded hover:bg-gray-800 hover:border-gray-500 text-gray-300"
          >
            Copy
          </button>
          {onInjectContext && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInjectContext();
              }}
              disabled={isInjecting}
              className={cn(
                "text-xs px-2 py-1 border border-purple-600 rounded text-purple-400",
                isInjecting
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-purple-900 hover:border-purple-500"
              )}
              title="Inject context into focused terminal (Ctrl+Shift+I)"
            >
              {isInjecting ? "..." : "Inject"}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenEditor();
            }}
            className="text-xs px-2 py-1 border border-gray-600 rounded hover:bg-gray-800 hover:border-gray-500 text-gray-300"
          >
            Code
          </button>
          {worktree.issueNumber && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenIssue();
              }}
              className="text-xs px-2 py-1 border border-blue-600 rounded hover:bg-blue-900 hover:border-blue-500 text-[var(--color-status-info)]"
            >
              Issue
            </button>
          )}
          {worktree.prNumber && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenPR();
              }}
              className="text-xs px-2 py-1 border border-green-600 rounded hover:bg-green-900 hover:border-green-500 text-[var(--color-status-success)]"
            >
              PR
            </button>
          )}
          {/* Recipe dropdown */}
          {recipes.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  disabled={runningRecipeId !== null}
                  className={cn(
                    "text-xs px-2 py-1 border border-orange-600 rounded text-orange-400",
                    runningRecipeId !== null
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-orange-900 hover:border-orange-500"
                  )}
                >
                  {runningRecipeId ? "..." : "▶ Recipe"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                {recipes.map((recipe) => (
                  <DropdownMenuItem
                    key={recipe.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRunRecipe(recipe.id);
                    }}
                    disabled={runningRecipeId !== null}
                  >
                    {recipe.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onCreateRecipe && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateRecipe();
              }}
              className="text-xs px-2 py-1 border border-gray-600 rounded hover:bg-gray-800 hover:border-gray-500 text-gray-300"
              title="Create terminal recipe"
            >
              +Recipe
            </button>
          )}
          {/* Terminal bulk actions dropdown */}
          {totalTerminalCount > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs px-2 py-1 border border-cyan-600 rounded text-cyan-400 hover:bg-cyan-900 hover:border-cyan-500"
                  title="Terminal actions for this worktree"
                >
                  Terms ({totalTerminalCount})
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseCompleted();
                  }}
                  disabled={completedCount === 0}
                >
                  Close Completed ({completedCount})
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseFailed();
                  }}
                  disabled={failedCount === 0}
                >
                  Close Failed ({failedCount})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseAllTerminals();
                  }}
                  className="text-[var(--color-status-error)] focus:text-[var(--color-status-error)]"
                >
                  Close All...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Header: Activity light + Agent status + Branch */}
        <div className="mb-1 flex items-center gap-2">
          <ActivityLight timestamp={worktree.lastActivityTimestamp} />
          <AgentStatusIndicator state={dominantAgentState} />
          {isActive && <span className="text-[var(--color-state-active)]">●</span>}
          <span
            className={cn(
              "font-bold",
              mood === "active" ? "text-[var(--color-status-warning)]" : "text-gray-200"
            )}
          >
            {branchLabel}
          </span>
          {!worktree.branch && (
            <span className="text-[var(--color-status-warning)]">(detached)</span>
          )}
          {worktree.aiStatus === "disabled" && <span className="text-gray-500">[AI off]</span>}
          {worktree.aiStatus === "error" && (
            <span className="text-[var(--color-status-error)]">[AI err]</span>
          )}
        </div>

        {/* Path (clickable) */}
        <div className="mb-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePathClick();
            }}
            className={cn(
              "text-sm text-gray-500 hover:text-gray-400 hover:underline text-left",
              isFocused && "underline"
            )}
          >
            {displayPath}
          </button>
        </div>

        {/* Summary */}
        <div className="mt-3 text-sm">{summaryContent}</div>

        {/* Files */}
        {hasChanges && worktree.worktreeChanges && (
          <FileChangeList
            changes={worktree.worktreeChanges.changes}
            rootPath={worktree.worktreeChanges.rootPath}
            maxVisible={4}
          />
        )}

        {/* Server status */}
        {hasDevScript && serverState && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {getServerStatusIndicator()}
              {getServerStatusText()}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!serverLoading && serverState.status !== "starting") {
                  onToggleServer();
                }
              }}
              disabled={serverLoading || serverState.status === "starting"}
              className={cn(
                "text-xs px-2 py-1 border rounded font-bold",
                getServerButtonColor(),
                serverLoading || serverState.status === "starting"
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-gray-800"
              )}
            >
              [{getServerButtonLabel()}]
            </button>
          </div>
        )}

        {/* Terminal count badge */}
        <TerminalCountBadge counts={terminalCounts} />

        {/* Agent note */}
        {effectiveNote && (
          <div className="mt-3 text-sm text-gray-300">
            {parsedNoteSegments.map((segment, index) =>
              segment.type === "link" ? (
                <a
                  key={index}
                  href={segment.content}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-status-info)] underline hover:text-blue-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.electron?.system?.openExternal) {
                      e.preventDefault();
                      window.electron.system.openExternal(segment.content);
                    }
                  }}
                >
                  {segment.content}
                </a>
              ) : (
                <span key={index}>{segment.content}</span>
              )
            )}
          </div>
        )}

        {/* Inline errors for this worktree */}
        {worktreeErrors.length > 0 && (
          <div className="mt-3 space-y-2">
            {worktreeErrors.slice(0, 3).map((error) => (
              <ErrorBanner
                key={error.id}
                error={error}
                onDismiss={dismissError}
                onRetry={handleErrorRetry}
                compact
              />
            ))}
            {worktreeErrors.length > 3 && (
              <div className="text-xs text-gray-500">+{worktreeErrors.length - 3} more errors</div>
            )}
          </div>
        )}

        {/* Confirmation dialog for bulk close all terminals */}
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          description={confirmDialog.description}
          onConfirm={confirmDialog.onConfirm}
          onCancel={closeConfirmDialog}
        />
      </div>
    </div>
  );
}
