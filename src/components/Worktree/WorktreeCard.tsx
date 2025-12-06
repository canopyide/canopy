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
  GitCommit,
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

  const [confirmDialog, setConfirmDialog] = useState({
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
  const rawLastCommitMessage = worktree.worktreeChanges?.lastCommitMessage;
  const firstLineLastCommitMessage = rawLastCommitMessage?.split("\n")[0].trim();

  // The summary often duplicates the last commit message.
  const isSummarySameAsCommit = useMemo(() => {
    if (!worktree.summary || !rawLastCommitMessage) return false;
    const s = worktree.summary.trim().toLowerCase();
    const c = rawLastCommitMessage.trim().toLowerCase();
    // Check if summary is equal to the raw message, or includes it, or vice versa.
    // Also check against the first line of the commit message.
    const firstLineC = firstLineLastCommitMessage?.toLowerCase();
    return s === c || s.includes(c) || c.includes(s) || (firstLineC && (s === firstLineC || s.includes(firstLineC)));
  }, [worktree.summary, rawLastCommitMessage, firstLineLastCommitMessage]);

  const effectiveSummary = isSummarySameAsCommit ? null : worktree.summary;

  // UX Logic: Teleporting Content
  // Clean State: Show commit in header only when contracted. When expanded, it "teleports" to details.
  // Dirty State: Never show commit in header (File changes take priority). Always show in details as context.
  const showCommitInHeader = !hasChanges && !isExpanded && !effectiveSummary;

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
  
          !!effectiveSummary ||
  
          showDevServer ||
  
          worktreeErrors.length > 0 ||
  
          showFooter ||
  
          !!rawLastCommitMessage; // Can expand to see details even if just clean
  
      
  
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
      <div className="px-3 py-4">
        <div className="flex flex-col gap-1.5">
          
          {/* Row 1: Activity Dot (Gutter) + Status Badges & Actions */}
          <div className="flex items-center gap-1.5">
            {/* Gutter: Activity Dot - Centered in w-5 to match Chevron */}
            <div className="w-5 shrink-0 flex items-center justify-center">
              <ActivityLight lastActivityTimestamp={worktree.lastActivityTimestamp} />
            </div>

            {/* Content: Badges + Actions */}
            <div className="flex items-center justify-between gap-2 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono leading-none">
                <AgentStatusIndicator state={dominantAgentState} />

                {worktree.issueNumber && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenIssue?.();
                    }}
                    className={cn(
                      "flex items-center gap-1 text-xs text-[var(--color-status-info)]",
                      "bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20",
                      "hover:bg-blue-500/20 transition-colors cursor-pointer"
                    )}
                    title="Open Issue on GitHub"
                  >
                    <CircleDot className="w-3 h-3" />
                    <span className="font-mono">#{worktree.issueNumber}</span>
                  </button>
                )}

                {worktree.prNumber && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenPR?.();
                    }}
                    className={cn(
                      "flex items-center gap-1 text-xs text-[var(--color-status-success)]",
                      "bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20",
                      "hover:bg-green-500/20 transition-colors cursor-pointer"
                    )}
                    title="Open Pull Request on GitHub"
                  >
                    <GitPullRequest className="w-3 h-3" />
                    <span className="font-mono">#{worktree.prNumber}</span>
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyTree();
                  }}
                  className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-white/10 rounded transition-colors"
                  title="Copy Context"
                  aria-label="Copy Context"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-white/10 rounded transition-colors"
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
          </div>

          {/* Row 2: Chevron (Gutter) + Branch Name */}
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-5 shrink-0 flex items-center justify-center pt-0.5">
              {hasExpandableContent ? (
                <button
                  onClick={handleToggleExpand}
                  className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
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
                <div className="w-4 h-4" /> 
              )}
            </div>

            <div className="min-w-0 flex-1 flex items-center gap-2">
              <span
                className={cn(
                  "truncate font-semibold text-[14px]",
                  isActive ? "text-white" : "text-gray-300"
                )}
                title={branchLabel}
              >
                {branchLabel}
              </span>
              {!worktree.branch && (
                <span className="text-amber-500 text-[10px] shrink-0">(detached)</span>
              )}
            </div>
          </div>

          {/* Row 3: Activity Body - Mutually Exclusive "Current Work" */}
          <div className="ml-[1.625rem]">
            {hasChanges ? (
              /* DIRTY STATE: Show Changes */
              <div className="flex flex-col gap-1">
                {/* 1. Distinct Summary (e.g. "Implementing auth") - Only if not commit msg */}
                {effectiveSummary && (
                  <div className="text-xs text-gray-300 truncate mb-0.5">{effectiveSummary}</div>
                )}

                {/* 2. File Changes List - HIDE WHEN EXPANDED to avoid duplication with Details */}
                {worktree.worktreeChanges && !isExpanded && (
                  <div className="mt-0.5">
                    <FileChangeList
                      changes={worktree.worktreeChanges.changes}
                      rootPath={worktree.worktreeChanges.rootPath}
                      maxVisible={isExpanded ? 8 : 3}
                    />
                  </div>
                )}

                {/* 3. Dirty Stats Footer (Insertions/Deletions) */}
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-400 font-mono min-h-[1.2em]">
                  {worktree.worktreeChanges && (
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

                  {/* Shared Footer Items (Terminals, Server, Errors) */}
                  {terminalCounts.total > 0 && (
                    <div className="flex items-center gap-1">
                      <Terminal className="w-2.5 h-2.5" />
                      <span>{terminalCounts.total}</span>
                      {terminalCounts.byState.working > 0 && (
                        <div className="w-1 h-1 rounded-full bg-[var(--color-status-success)] animate-pulse" />
                      )}
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
              </div>
            ) : (
              /* CLEAN STATE: Show Summary OR Last Commit (unless expanded) */
              <div className="flex flex-col gap-1">
                {/* 1. Activity Headline */}
                <div className="text-xs text-gray-400 truncate min-h-[1.2em]">
                  {effectiveSummary ? (
                    <span className="text-gray-300">{effectiveSummary}</span>
                  ) : showCommitInHeader && firstLineLastCommitMessage ? (
                    <div className="flex items-center gap-1.5 opacity-80">
                      <GitCommit className="w-3 h-3 shrink-0" />
                      <span className="truncate">{firstLineLastCommitMessage}</span>
                    </div>
                  ) : isExpanded ? (
                    /* Expanded: Commit "teleported" to details, show nothing here to avoid duplication */
                    null
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-600/80 select-none">
                      No Activity
                    </span>
                  )}
                </div>

                {/* 2. Clean Footer (Terminals, Server, Errors ONLY - No Git Stats) */}
                {(terminalCounts.total > 0 ||
                  (showDevServer && serverState && serverState.status !== "stopped") ||
                  worktreeErrors.length > 0) && (
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-400 font-mono">
                    {terminalCounts.total > 0 && (
                      <div className="flex items-center gap-1">
                        <Terminal className="w-2.5 h-2.5" />
                        <span>{terminalCounts.total}</span>
                        {terminalCounts.byState.working > 0 && (
                          <div className="w-1 h-1 rounded-full bg-[var(--color-status-success)] animate-pulse" />
                        )}
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
              </div>
            )}
          </div>

          {/* Expanded Details Section */}
          <div
            id={detailsId}
            aria-hidden={!isExpanded}
            inert={!isExpanded}
            className={cn(
              "overflow-hidden transition-[max-height,opacity] duration-300 ease-out ml-[1.625rem]",
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
              showFooter={false} // Footer is now handled in the main body
              isFocused={isFocused}
              onPathClick={handlePathClick}
              onToggleServer={onToggleServer}
              onDismissError={dismissError}
              onRetryError={handleErrorRetry}
              showLastCommit={true} // Always show in details (it's hidden in header when expanded OR when dirty)
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