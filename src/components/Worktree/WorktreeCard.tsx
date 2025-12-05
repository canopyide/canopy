import { useCallback, useState, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { WorktreeState, ProjectDevServerSettings } from "../../types";
import { ActivityLight } from "./ActivityLight";
import { AgentStatusIndicator } from "./AgentStatusIndicator";
import { FileChangeList } from "./FileChangeList";
import { WorktreeDetails } from "./WorktreeDetails";
import { useDevServer } from "../../hooks/useDevServer";
import { useWorktreeTerminals } from "../../hooks/useWorktreeTerminals";
import { useErrorStore, useTerminalStore, type RetryAction } from "../../store";
import { useRecipeStore } from "../../store/recipeStore";
import { useWorktreeSelectionStore } from "../../store/worktreeStore";
import { systemClient, errorsClient } from "@/clients";
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
  onCreateRecipe?: () => void;
  homeDir?: string;
  devServerSettings?: ProjectDevServerSettings;
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
  homeDir,
  devServerSettings,
}: WorktreeCardProps) {
  const isExpanded = useWorktreeSelectionStore(
    useCallback((state) => state.expandedWorktrees.has(worktree.id), [worktree.id])
  );
  const toggleWorktreeExpanded = useWorktreeSelectionStore((state) => state.toggleWorktreeExpanded);

  const getRecipesForWorktree = useRecipeStore((state) => state.getRecipesForWorktree);
  const runRecipe = useRecipeStore((state) => state.runRecipe);
  const recipes = getRecipesForWorktree(worktree.id);
  const [runningRecipeId, setRunningRecipeId] = useState<string | null>(null);

  const { counts: terminalCounts, dominantAgentState } = useWorktreeTerminals(worktree.id);

  const bulkCloseByWorktree = useTerminalStore((state) => state.bulkCloseByWorktree);
  const completedCount = terminalCounts.byState.completed;
  const failedCount = terminalCounts.byState.failed;
  const totalTerminalCount = terminalCounts.total;

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
    isEnabled: devServerEnabled,
    isLoading: serverLoading,
  } = useDevServer({
    worktreeId: worktree.id,
    worktreePath: worktree.path,
    devServerSettings,
  });

  const worktreeErrors = useErrorStore(
    useShallow((state) =>
      state.errors.filter((e) => e.context?.worktreeId === worktree.id && !e.dismissed)
    )
  );
  const dismissError = useErrorStore((state) => state.dismissError);
  const removeError = useErrorStore((state) => state.removeError);

  const handleErrorRetry = useCallback(
    async (errorId: string, action: RetryAction, args?: Record<string, unknown>) => {
      try {
        await errorsClient.retry(errorId, action, args);
        removeError(errorId);
      } catch (error) {
        console.error("Error retry failed:", error);
      }
    },
    [removeError]
  );

  const [now, setNow] = useState(() => Date.now());
  const isMainWorktree = worktree.branch === "main" || worktree.branch === "master";

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

  const handlePathClick = useCallback(() => {
    systemClient.openPath(worktree.path);
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
      if (runningRecipeId !== null) {
        return;
      }

      setRunningRecipeId(recipeId);
      try {
        await runRecipe(recipeId, worktree.path, worktree.id);
      } catch (error) {
        console.error("Failed to run recipe:", error);
      } finally {
        setRunningRecipeId(null);
      }
    },
    [runRecipe, worktree.path, worktree.id, runningRecipeId]
  );

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
      title: "Close All Sessions",
      description: `This will close ${totalTerminalCount} session${totalTerminalCount !== 1 ? "s" : ""} (including agents and shells) for this worktree. This action cannot be undone.`,
      onConfirm: () => {
        bulkCloseByWorktree(worktree.id);
        closeConfirmDialog();
      },
    });
  }, [totalTerminalCount, bulkCloseByWorktree, worktree.id, closeConfirmDialog]);

  const branchLabel = worktree.branch ?? worktree.name;
  const hasChanges = (worktree.worktreeChanges?.changedFileCount ?? 0) > 0;

  const { summary } = worktree;

  const renderSummary = useCallback(() => {
    if (summary) {
      return <span className="text-gray-300">{summary}</span>;
    }
    if (hasChanges) {
      return <span className="text-gray-400 italic">Changes detected...</span>;
    }
    return <span className="text-gray-500 italic">No recent changes</span>;
  }, [summary, hasChanges]);

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

  const handleToggleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleWorktreeExpanded(worktree.id);
    },
    [toggleWorktreeExpanded, worktree.id]
  );

  const showDevServer = devServerEnabled && hasDevScript;
  const showFooter =
    terminalCounts.total > 0 ||
    (hasChanges && !!worktree.worktreeChanges) ||
    (showDevServer && serverState && serverState.status !== "stopped") ||
    worktreeErrors.length > 0;
  const hasExpandableContent =
    hasChanges ||
    effectiveNote ||
    !!worktree.summary ||
    showDevServer ||
    worktreeErrors.length > 0 ||
    showFooter;

  const detailsId = useMemo(() => `worktree-${worktree.id}-details`, [worktree.id]);

  return (
    <div
      className={cn(
        "group relative border-b border-white/5 transition-colors duration-200",
        isActive ? "bg-white/[0.04]" : "hover:bg-white/[0.02] bg-transparent",
        isFocused && "ring-1 ring-inset ring-[#10b981]/50"
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
      <div className="px-4 py-3">
        <div className="flex flex-col gap-1">
          {/* Header Row: Expand, Activity, Agent Status, Branch, Menu */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              {/* Left-aligned Expand Chevron */}
              {hasExpandableContent ? (
                <button
                  onClick={handleToggleExpand}
                  className="mt-0.5 p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
                  aria-label={isExpanded ? "Collapse details" : "Expand details"}
                  aria-expanded={isExpanded}
                  aria-controls={detailsId}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
              ) : (
                <div className="w-5" />
              )}

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 text-xs font-mono leading-none">
                  <ActivityLight lastActivityTimestamp={worktree.lastActivityTimestamp} />
                  <AgentStatusIndicator state={dominantAgentState} />
                  <span
                    className={cn(
                      "truncate font-semibold text-[13px]",
                      isActive ? "text-white" : "text-gray-300"
                    )}
                  >
                    {branchLabel}
                  </span>
                  {!worktree.branch && (
                    <span className="text-amber-500 text-[10px]">(detached)</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyTree();
                }}
                className="p-1.5 text-gray-500 hover:text-gray-200 transition-colors"
                title="Copy Context"
                aria-label="Copy Context"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 text-gray-500 hover:text-gray-200"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={4}
                  onClick={(e) => e.stopPropagation()}
                >
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
                      <DropdownMenuLabel>Sessions</DropdownMenuLabel>
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

          {/* PR/Issue Badges Row - Dedicated second row */}
          {(worktree.prNumber || worktree.issueNumber) && (
            <div className="flex items-center gap-2 mt-1 ml-7">
              {worktree.prNumber && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenPR?.();
                  }}
                  className={cn(
                    "flex items-center gap-1.5 text-xs text-[var(--color-status-success)]",
                    "bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20",
                    "hover:bg-green-500/20 transition-colors cursor-pointer"
                  )}
                  title="Open Pull Request on GitHub"
                >
                  <GitPullRequest className="w-3 h-3" />
                  <span className="font-mono">#{worktree.prNumber}</span>
                </button>
              )}
              {worktree.issueNumber && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenIssue?.();
                  }}
                  className={cn(
                    "flex items-center gap-1.5 text-xs text-[var(--color-status-info)]",
                    "bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20",
                    "hover:bg-blue-500/20 transition-colors cursor-pointer"
                  )}
                  title="Open Issue on GitHub"
                >
                  <CircleDot className="w-3 h-3" />
                  <span className="font-mono">#{worktree.issueNumber}</span>
                </button>
              )}
            </div>
          )}

          {/* File Changes Preview - Only show if we have changes OR if expanded */}
          {worktree.worktreeChanges && (hasChanges || isExpanded) && (
            <div className="mt-2 ml-7">
              {hasChanges ? (
                <FileChangeList
                  changes={worktree.worktreeChanges.changes}
                  rootPath={worktree.worktreeChanges.rootPath}
                  maxVisible={isExpanded ? 8 : 2}
                />
              ) : (
                <div className="text-xs text-gray-500 italic">No file changes</div>
              )}
            </div>
          )}

          {/* Footer Row: Stats - Only render when there's content to show */}
          {showFooter && (
            <div className="flex items-center gap-4 mt-2 ml-7 text-xs text-gray-400 font-mono">
              {terminalCounts.total > 0 && (
                <div className="flex items-center gap-1">
                  <Terminal className="w-2.5 h-2.5" />
                  <span>{terminalCounts.total}</span>
                  {terminalCounts.byState.working > 0 && (
                    <div className="w-1 h-1 rounded-full bg-[var(--color-status-success)] animate-pulse" />
                  )}
                </div>
              )}

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

              {showDevServer && serverState && serverState.status !== "stopped" && (
                <div className="flex items-center gap-1">
                  <Globe className="w-2.5 h-2.5" />
                  {getServerStatusIndicator()}
                </div>
              )}

              {worktreeErrors.length > 0 && (
                <div className="flex items-center gap-1 text-[var(--color-status-error)]">
                  <AlertCircle className="w-2.5 h-2.5" />
                  <span>{worktreeErrors.length}</span>
                </div>
              )}
            </div>
          )}

          {/* Expanded Details Section */}
          <div
            id={detailsId}
            aria-hidden={!isExpanded}
            inert={!isExpanded}
            className={cn(
              "overflow-hidden transition-[max-height,opacity] duration-300 ease-out ml-7",
              isExpanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <WorktreeDetails
              worktree={worktree}
              homeDir={homeDir}
              effectiveNote={effectiveNote}
              showDevServer={showDevServer}
              serverState={serverState}
              serverLoading={serverLoading}
              worktreeErrors={worktreeErrors}
              hasChanges={hasChanges}
              showFooter={showFooter}
              isFocused={isFocused}
              onPathClick={handlePathClick}
              onToggleServer={onToggleServer}
              onDismissError={dismissError}
              onRetryError={handleErrorRetry}
              renderSummary={renderSummary}
            />
          </div>

          <ConfirmDialog
            isOpen={confirmDialog.isOpen}
            title={confirmDialog.title}
            description={confirmDialog.description}
            onConfirm={confirmDialog.onConfirm}
            onCancel={closeConfirmDialog}
          />
        </div>
      </div>
    </div>
  );
}
