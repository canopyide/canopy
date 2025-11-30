import { useCallback, useState, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { WorktreeState } from "../../types";
import { AgentStatusIndicator } from "./AgentStatusIndicator";
import { FileChangeList } from "./FileChangeList";
import { ErrorBanner } from "../Errors/ErrorBanner";
import { useDevServer } from "../../hooks/useDevServer";
import { useWorktreeTerminals } from "../../hooks/useWorktreeTerminals";
import { useErrorStore, useTerminalStore, type RetryAction } from "../../store";
import { useRecipeStore } from "../../store/recipeStore";
import { useWorktreeSelectionStore } from "../../store/worktreeStore";
import { cn } from "../../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "../ui/dropdown-menu";
import { ConfirmDialog } from "../Terminal/ConfirmDialog";
import {
  AlertCircle,
  Loader2,
  Copy,
  Code,
  CircleDot,
  GitPullRequest,
  Play,
  Plus,
  MoreHorizontal,
  Terminal,
  Globe,
  GitCommitHorizontal,
  Folder,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

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
  /** Called when user wants to open Settings dialog with optional tab */
  onOpenSettings?: (tab?: "ai" | "general" | "troubleshooting") => void;
  /** User's home directory for path formatting */
  homeDir?: string;
}

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

function formatPath(targetPath: string, homeDir?: string): string {
  const home = homeDir || "";
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
  onCreateRecipe,
  onOpenSettings,
  homeDir,
}: WorktreeCardProps) {
  const mood = worktree.mood || "stable";

  // Expanded state from store (per-id subscription to avoid re-renders on other cards)
  const isExpanded = useWorktreeSelectionStore(
    useCallback((state) => state.expandedWorktrees.has(worktree.id), [worktree.id])
  );
  const toggleWorktreeExpanded = useWorktreeSelectionStore((state) => state.toggleWorktreeExpanded);

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
  const worktreeErrors = useErrorStore(
    useShallow((state) =>
      state.errors.filter((e) => e.context?.worktreeId === worktree.id && !e.dismissed)
    )
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

  const displayPath = formatPath(worktree.path, homeDir);
  const branchLabel = worktree.branch ?? worktree.name;
  const hasChanges = (worktree.worktreeChanges?.changedFileCount ?? 0) > 0;

  // AI Summary
  const renderAISummary = useCallback(() => {
    const { summary, aiStatus } = worktree;

    switch (aiStatus) {
      case "loading":
        return (
          <span className="inline-flex items-center gap-1.5 text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="italic">generating summary…</span>
          </span>
        );

      case "disabled":
        return (
          <span className="inline-flex items-center gap-1 text-gray-500">
            <span>AI disabled</span>
            {onOpenSettings && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings("ai");
                }}
                className="hover:text-canopy-accent hover:underline text-[0.7rem] px-1 border border-gray-700 rounded"
              >
                Enable
              </button>
            )}
          </span>
        );

      case "error":
        return <span className="text-[var(--color-status-error)]">Summary unavailable</span>;

      case "active": {
        if (summary) {
          return <span className="text-gray-300">{summary}</span>;
        }
        if (hasChanges) {
          return <span className="text-gray-400 italic">Changes detected...</span>;
        }
        return <span className="text-gray-500 italic">No recent changes</span>;
      }

      default:
        return null;
    }
  }, [worktree.aiStatus, worktree.summary, hasChanges, onOpenSettings]);

  // Server status helpers
  const getServerStatusIndicator = () => {
    if (!serverState) return null;
    switch (serverState.status) {
      case "stopped":
        return <span className="text-gray-600">○</span>;
      case "starting":
        return <span className="text-[var(--color-server-starting)]">◐</span>;
      case "running":
        return <span className="text-[var(--color-server-running)]">●</span>;
      case "error":
        return <span className="text-[var(--color-server-error)]">●</span>;
      default:
        return <span className="text-gray-600">○</span>;
    }
  };

  const getServerLabel = () => {
    if (!serverState) return null;
    if (serverState.status === "running" && serverState.url) {
      // Strip http:// and trailing slash for density
      return serverState.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    }
    if (serverState.status === "error") return "Error";
    if (serverState.status === "starting") return "Starting";
    return "Dev Server";
  };

  // Handler for expand/collapse toggle
  const handleToggleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleWorktreeExpanded(worktree.id);
    },
    [toggleWorktreeExpanded, worktree.id]
  );

  // Compute whether there's expandable content
  const hasExpandableContent =
    hasChanges ||
    effectiveNote ||
    !!worktree.summary ||
    worktree.aiStatus === "loading" ||
    hasDevScript ||
    worktreeErrors.length > 0;

  // Generate stable ID for aria-controls
  const detailsId = useMemo(() => `worktree-${worktree.id}-details`, [worktree.id]);

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg bg-card/30 border border-border/60 px-3 py-2 mb-2 cursor-pointer transition-all duration-200",
        isActive
          ? "border-canopy-accent/50 bg-canopy-accent/3"
          : "hover:border-canopy-accent/60 hover:bg-card/60",
        isFocused && "ring-1 ring-canopy-accent"
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
      {/* Content container */}
      <div className="flex flex-col gap-1">
        {/* Header: Identity + Actions */}
        <div className="flex items-start justify-between gap-2">
          {/* Left: identity + status */}
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-mono leading-none">
              {/* Expand/collapse chevron */}
              {hasExpandableContent && (
                <button
                  onClick={handleToggleExpand}
                  className="p-0.5 -ml-0.5 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
                  aria-label={isExpanded ? "Collapse details" : "Expand details"}
                  aria-expanded={isExpanded}
                  aria-controls={detailsId}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </button>
              )}
              <AgentStatusIndicator state={dominantAgentState} />
              {isActive && (
                <span
                  className="text-[var(--color-state-active)] text-[0.6rem]"
                  aria-label="Active worktree"
                >
                  ●
                </span>
              )}
              <span
                className={cn(
                  "truncate font-semibold",
                  mood === "active" ? "text-[var(--color-status-warning)]" : "text-gray-200"
                )}
              >
                {branchLabel}
              </span>
              {!worktree.branch && (
                <span className="text-[var(--color-status-warning)] text-[0.65rem]">
                  (detached)
                </span>
              )}

              {/* Issues/PRs in header line for extreme density */}
              {worktree.prNumber && (
                <span className="flex items-center gap-0.5 text-[0.65rem] text-[var(--color-status-success)] bg-green-500/10 px-1 rounded">
                  <GitPullRequest className="w-2.5 h-2.5" />
                  {worktree.prNumber}
                </span>
              )}
              {worktree.issueNumber && (
                <span className="flex items-center gap-0.5 text-[0.65rem] text-[var(--color-status-info)] bg-blue-500/10 px-1 rounded">
                  <CircleDot className="w-2.5 h-2.5" />
                  {worktree.issueNumber}
                </span>
              )}
            </div>
          </div>

          {/* Right: action icons */}
          <div className="flex items-center gap-0.5 -mt-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-canopy-accent"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => onCopyTree()}>
                  <Copy className="w-3 h-3 mr-2" />
                  Copy Context
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenEditor()}>
                  <Code className="w-3 h-3 mr-2" />
                  Open in Editor
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlePathClick()}>
                  <Folder className="w-3 h-3 mr-2" />
                  Reveal in Finder
                </DropdownMenuItem>

                {(worktree.issueNumber || worktree.prNumber) && <DropdownMenuSeparator />}

                {worktree.issueNumber && onOpenIssue && (
                  <DropdownMenuItem onClick={() => handleOpenIssue()}>
                    <CircleDot className="w-3 h-3 mr-2" />
                    Open Issue #{worktree.issueNumber}
                  </DropdownMenuItem>
                )}
                {worktree.prNumber && onOpenPR && (
                  <DropdownMenuItem onClick={() => handleOpenPR()}>
                    <GitPullRequest className="w-3 h-3 mr-2" />
                    Open PR #{worktree.prNumber}
                  </DropdownMenuItem>
                )}

                {(recipes.length > 0 || onCreateRecipe) && <DropdownMenuSeparator />}

                {recipes.length > 0 && (
                  <>
                    <DropdownMenuLabel>Recipes</DropdownMenuLabel>
                    {recipes.map((recipe) => (
                      <DropdownMenuItem
                        key={recipe.id}
                        onClick={() => handleRunRecipe(recipe.id)}
                        disabled={runningRecipeId !== null}
                      >
                        <Play className="w-3 h-3 mr-2" />
                        {recipe.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                {onCreateRecipe && (
                  <DropdownMenuItem onClick={onCreateRecipe}>
                    <Plus className="w-3 h-3 mr-2" />
                    Create Recipe...
                  </DropdownMenuItem>
                )}

                {totalTerminalCount > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Terminals</DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={handleCloseCompleted}
                      disabled={completedCount === 0}
                    >
                      Close Completed ({completedCount})
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCloseFailed} disabled={failedCount === 0}>
                      Close Failed ({failedCount})
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleCloseAllTerminals}
                      className="text-[var(--color-status-error)] focus:text-[var(--color-status-error)]"
                    >
                      Close All...
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* COMPACT SUMMARY ROW: Always visible metrics */}
        <div className="flex items-center gap-3 text-[0.7rem] text-gray-400 font-mono ml-4">
          {/* Terminals */}
          {terminalCounts.total > 0 && (
            <div className="flex items-center gap-1">
              <Terminal className="w-2.5 h-2.5" />
              <span>{terminalCounts.total}</span>
              {(terminalCounts.byState.working > 0 || terminalCounts.byState.waiting > 0) && (
                <div className="w-1 h-1 rounded-full bg-[var(--color-status-success)] animate-pulse" />
              )}
            </div>
          )}

          {/* Changes count (compact: just the count) */}
          {hasChanges && worktree.worktreeChanges && (
            <div className="flex items-center gap-1">
              <GitCommitHorizontal className="w-2.5 h-2.5" />
              <span className="text-[var(--color-status-success)]">
                +{worktree.worktreeChanges.insertions ?? 0}
              </span>
              <span className="text-gray-600">/</span>
              <span className="text-[var(--color-status-error)]">
                -{worktree.worktreeChanges.deletions ?? 0}
              </span>
            </div>
          )}

          {/* Dev server status indicator (compact) */}
          {hasDevScript && serverState && serverState.status !== "stopped" && (
            <div className="flex items-center gap-1">
              <Globe className="w-2.5 h-2.5" />
              {getServerStatusIndicator()}
            </div>
          )}

          {/* Error count */}
          {worktreeErrors.length > 0 && (
            <div className="flex items-center gap-1 text-[var(--color-status-error)]">
              <AlertCircle className="w-2.5 h-2.5" />
              <span>{worktreeErrors.length}</span>
            </div>
          )}
        </div>

        {/* EXPANDED CONTENT - shown when isExpanded is true */}
        <div
          id={detailsId}
          aria-hidden={!isExpanded}
          inert={!isExpanded ? ("" as unknown as boolean) : undefined}
          className={cn(
            "overflow-hidden transition-[max-height,opacity] duration-200",
            isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="pt-2 space-y-2">
            {/* Path (shown in expanded mode) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePathClick();
              }}
              className={cn(
                "text-[0.7rem] text-gray-500 hover:text-gray-400 hover:underline text-left font-mono truncate block ml-4",
                isFocused && "underline"
              )}
            >
              {displayPath}
            </button>

            {/* AI Summary Block */}
            <div className="text-xs leading-relaxed break-words ml-4">{renderAISummary()}</div>

            {/* Note (only if present) */}
            {effectiveNote && (
              <div
                className={cn(
                  "text-xs text-gray-400 bg-black/20 p-1.5 rounded border-l-2 border-gray-700 font-mono ml-4",
                  "line-clamp-none"
                )}
              >
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

            {/* File Changes List */}
            {hasChanges && worktree.worktreeChanges && (
              <div className="ml-4">
                <FileChangeList
                  changes={worktree.worktreeChanges.changes}
                  rootPath={worktree.worktreeChanges.rootPath}
                  maxVisible={5}
                />
              </div>
            )}

            {/* Dev Server Controls */}
            {hasDevScript && serverState && (
              <div className="flex items-center gap-2 text-xs text-gray-400 font-mono ml-4">
                <Globe className="w-3 h-3" />
                <div className="flex items-center gap-1">
                  {getServerStatusIndicator()}
                  <span className="truncate max-w-[120px]">{getServerLabel()}</span>
                </div>
                {/* Tiny Action Button for Dev Server */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!serverLoading && serverState.status !== "starting") {
                      onToggleServer();
                    }
                  }}
                  disabled={serverLoading || serverState.status === "starting"}
                  className={cn(
                    "ml-1 p-0.5 rounded hover:bg-gray-700 transition-colors",
                    serverLoading ? "opacity-50" : ""
                  )}
                  title={serverState.status === "running" ? "Stop Server" : "Start Server"}
                >
                  {serverState.status === "running" ? (
                    <div className="w-1.5 h-1.5 bg-[var(--color-status-error)] rounded-sm" />
                  ) : (
                    <Play className="w-2 h-2 fill-current" />
                  )}
                </button>
              </div>
            )}

            {/* Detailed Errors */}
            {worktreeErrors.length > 0 && (
              <div className="space-y-1 ml-4">
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
                  <div className="text-[0.65rem] text-gray-500 text-center">
                    +{worktreeErrors.length - 3} more errors
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

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
