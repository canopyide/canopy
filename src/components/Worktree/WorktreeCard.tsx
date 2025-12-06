import { useCallback, useState, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { WorktreeState, ProjectDevServerSettings } from "../../types";
import { ActivityLight } from "./ActivityLight";
import { AgentStatusIndicator } from "./AgentStatusIndicator";
import { BranchLabel } from "./BranchLabel";
import { FileChangeList } from "./FileChangeList";
import { LiveTimeAgo } from "./LiveTimeAgo";
import { TerminalCountBadge } from "./TerminalCountBadge";
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuLabel,
} from "../ui/context-menu";
import { ConfirmDialog } from "../Terminal/ConfirmDialog";
import {
  Copy,
  Code,
  CircleDot,
  GitPullRequest,
  Play,
  Plus,
  MoreHorizontal,
  Globe,
  Folder,
  ChevronDown,
  ChevronRight,
  GitCommit,
  Shield,
  Terminal,
} from "lucide-react";
import { ClaudeIcon, GeminiIcon, CodexIcon } from "@/components/icons";
import type { AgentType, UseAgentLauncherReturn } from "@/hooks/useAgentLauncher";

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
  onLaunchAgent?: (type: AgentType) => void;
  agentAvailability?: UseAgentLauncherReturn["availability"];
  agentSettings?: UseAgentLauncherReturn["agentSettings"];
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
  onLaunchAgent,
  agentAvailability,
  agentSettings,
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

  const handleLaunchAgent = useCallback(
    (type: AgentType, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
      }
      onLaunchAgent?.(type);
    },
    [onLaunchAgent]
  );

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
    return (
      s === c ||
      s.includes(c) ||
      c.includes(s) ||
      (firstLineC && (s === firstLineC || s.includes(firstLineC)))
    );
  }, [worktree.summary, rawLastCommitMessage, firstLineLastCommitMessage]);

  const effectiveSummary = isSummarySameAsCommit ? null : worktree.summary;

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

  const showMetaFooter =
    !!dominantAgentState ||
    terminalCounts.total > 0 ||
    !!worktree.issueNumber ||
    !!worktree.prNumber;

  const detailsId = useMemo(() => `worktree-${worktree.id}-details`, [worktree.id]);

  const workspaceScenario: "dirty" | "clean-feature" | "clean-main" = useMemo(() => {
    if (hasChanges) {
      return "dirty";
    }
    if (isMainWorktree) {
      return "clean-main";
    }
    return "clean-feature";
  }, [hasChanges, isMainWorktree]);

  const cardContent = (
    <div
      className={cn(
        "group relative border-b-2 border-white/5 transition-colors duration-200",
        isActive ? "bg-white/[0.03]" : "hover:bg-white/[0.02] bg-transparent",
        isFocused && "bg-white/[0.04]",
        // Current worktree accent: persistent left border indicating "you are here"
        worktree.isCurrent && "border-l-2 border-l-teal-500/50"
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
      aria-label={`Worktree: ${branchLabel}${worktree.isCurrent ? " (current)" : ""}`}
    >
      <div className="px-3 py-5">
        {/* Golden Gutter Grid Structure */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: hasExpandableContent ? "16px 1fr" : "0px 1fr",
            columnGap: "14px",
            rowGap: "4px",
          }}
        >
          {/* Row 1: Identity + Recency */}
          <div className="flex items-center justify-center">
            {hasExpandableContent && (
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
            )}
          </div>
          <div className="group/identity min-w-0 flex items-center justify-between gap-2 min-h-[22px] relative">
            <div className="flex items-baseline gap-1.5 min-w-0 pr-16">
              {isMainWorktree && (
                <Shield className="w-3.5 h-3.5 text-gray-600 opacity-30 shrink-0 self-center" />
              )}
              <BranchLabel
                label={branchLabel}
                isActive={isActive}
                isMainWorktree={isMainWorktree}
              />
              {!worktree.branch && (
                <span className="text-amber-500 text-[10px] font-medium shrink-0">(detached)</span>
              )}
            </div>

            {/* Activity + Live Time - Unified recency chip */}
            <div
              className={cn(
                "flex items-center gap-1.5 shrink-0 text-[10px] px-2 py-0.5 rounded-full",
                worktree.lastActivityTimestamp
                  ? "bg-white/[0.03] text-gray-400"
                  : "bg-transparent text-gray-600"
              )}
              title={
                worktree.lastActivityTimestamp
                  ? `Last activity: ${new Date(worktree.lastActivityTimestamp).toLocaleString()}`
                  : "No recent activity recorded"
              }
            >
              {worktree.lastActivityTimestamp && (
                <ActivityLight lastActivityTimestamp={worktree.lastActivityTimestamp} />
              )}
              <LiveTimeAgo timestamp={worktree.lastActivityTimestamp} className="font-medium" />
            </div>

            {/* Action Buttons - visible on hover/focus */}
            <div className="absolute right-0 flex items-center gap-0.5 opacity-0 group-hover/identity:opacity-100 group-focus-within/identity:opacity-100 focus-within:opacity-100 transition-opacity bg-gradient-to-l from-canopy-bg from-70% to-transparent pl-6 z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyTree();
                }}
                className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                title="Copy Context"
                aria-label="Copy Context"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
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

          {/* Row 2: Dynamic Activity Layer (Polymorphic) */}
          <div />
          <div className="flex flex-col gap-1 min-w-0 mt-1.5">
            {workspaceScenario === "dirty" && !isExpanded ? (
              <>
                {/* Diff summary pill */}
                {worktree.worktreeChanges && (
                  <div className="inline-flex items-center gap-2 text-[11px] font-mono text-gray-400 bg-white/[0.02] border border-white/5 rounded px-2 py-0.5">
                    <span>
                      {worktree.worktreeChanges.changedFileCount} file
                      {worktree.worktreeChanges.changedFileCount !== 1 ? "s" : ""}
                    </span>
                    {((worktree.worktreeChanges.insertions ?? 0) > 0 ||
                      (worktree.worktreeChanges.deletions ?? 0) > 0) && (
                      <>
                        <span className="text-gray-600">·</span>
                        {(worktree.worktreeChanges.insertions ?? 0) > 0 && (
                          <span className="text-[var(--color-status-success)]">
                            +{worktree.worktreeChanges.insertions}
                          </span>
                        )}
                        {(worktree.worktreeChanges.insertions ?? 0) > 0 &&
                          (worktree.worktreeChanges.deletions ?? 0) > 0 && (
                            <span className="text-gray-600">/</span>
                          )}
                        {(worktree.worktreeChanges.deletions ?? 0) > 0 && (
                          <span className="text-[var(--color-status-error)]">
                            -{worktree.worktreeChanges.deletions}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
                {worktree.worktreeChanges && (
                  <FileChangeList
                    changes={worktree.worktreeChanges.changes}
                    rootPath={worktree.worktreeChanges.rootPath}
                    maxVisible={3}
                  />
                )}
                {effectiveSummary && (
                  <div className="text-xs text-gray-400 truncate mt-0.5">{effectiveSummary}</div>
                )}
              </>
            ) : workspaceScenario === "clean-feature" ? (
              <>
                {effectiveNote && !isExpanded ? (
                  <div className="text-xs text-gray-300 truncate">{effectiveNote}</div>
                ) : !isExpanded && firstLineLastCommitMessage ? (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 opacity-80">
                    <GitCommit className="w-3 h-3 shrink-0" />
                    <span className="truncate">{firstLineLastCommitMessage}</span>
                  </div>
                ) : null}
              </>
            ) : workspaceScenario === "clean-main" && !isExpanded ? (
              <>
                {/* Last commit message - same as clean-feature */}
                {firstLineLastCommitMessage ? (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 opacity-80">
                    <GitCommit className="w-3 h-3 shrink-0" />
                    <span className="truncate">{firstLineLastCommitMessage}</span>
                    {/* Server indicator - only shown when running (terminal count is in footer) */}
                    {serverState?.status === "running" && serverState.port && (
                      <span
                        className="flex items-center gap-1 text-[10px] text-[var(--color-server-running)] bg-[var(--color-server-running)]/10 px-1.5 py-0.5 rounded border border-[var(--color-server-running)]/20 ml-2 shrink-0"
                        title="Dev server running"
                      >
                        <Globe className="w-2.5 h-2.5" />
                        <span className="font-mono">:{serverState.port}</span>
                      </span>
                    )}
                  </div>
                ) : effectiveNote ? (
                  <div className="text-xs text-gray-300 truncate">{effectiveNote}</div>
                ) : null}
              </>
            ) : null}
          </div>

          {/* Row 3: Expanded Details */}
          <div />
          <div
            id={detailsId}
            aria-hidden={!isExpanded}
            inert={!isExpanded}
            className={cn(
              "overflow-hidden transition-[max-height,opacity] duration-300 ease-out",
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
              isFocused={isFocused}
              terminalCounts={terminalCounts}
              onPathClick={handlePathClick}
              onToggleServer={onToggleServer}
              onDismissError={dismissError}
              onRetryError={handleErrorRetry}
              showLastCommit={true}
            />
          </div>

          {/* Row 4: Pinned Meta Footer */}
          {showMetaFooter && (
            <>
              <div />
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-[10px] font-mono">
                <div className="flex flex-wrap items-center gap-1.5">
                  <AgentStatusIndicator state={dominantAgentState} />
                  <TerminalCountBadge counts={terminalCounts} />
                </div>
                <div className="flex items-center gap-1.5">
                  {worktree.issueNumber && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenIssue?.();
                      }}
                      className={cn(
                        "flex items-center gap-1 text-[10px] text-[var(--color-status-info)]",
                        "bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20",
                        "hover:bg-blue-500/20 transition-colors cursor-pointer"
                      )}
                      title="Open Issue on GitHub"
                    >
                      <CircleDot className="w-2.5 h-2.5" />
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
                        "flex items-center gap-1 text-[10px]",
                        "px-1.5 py-0.5 rounded border",
                        "hover:brightness-125 transition-colors cursor-pointer",
                        // Color based on PR state (open=green, merged=purple, closed=red)
                        worktree.prState === "merged"
                          ? "text-purple-400 bg-purple-500/10 border-purple-500/20"
                          : worktree.prState === "closed"
                            ? "text-red-400 bg-red-500/10 border-red-500/20"
                            : "text-[var(--color-status-success)] bg-green-500/10 border-green-500/20"
                      )}
                      title={`PR #${worktree.prNumber} · ${worktree.prState ?? "open"}`}
                    >
                      <GitPullRequest className="w-2.5 h-2.5" />
                      <span className="font-mono">#{worktree.prNumber}</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
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
  );

  if (!onLaunchAgent) {
    return cardContent;
  }

  const isClaudeEnabled = agentAvailability?.claude && agentSettings?.claude.enabled;
  const isGeminiEnabled = agentAvailability?.gemini && agentSettings?.gemini.enabled;
  const isCodexEnabled = agentAvailability?.codex && agentSettings?.codex.enabled;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{cardContent}</ContextMenuTrigger>
      <ContextMenuContent onClick={(e) => e.stopPropagation()}>
        <ContextMenuLabel>Launch Agent</ContextMenuLabel>
        <ContextMenuItem onClick={() => handleLaunchAgent("claude")} disabled={!isClaudeEnabled}>
          <ClaudeIcon className="w-3.5 h-3.5 mr-2" />
          Claude
        </ContextMenuItem>
        <ContextMenuItem onClick={() => handleLaunchAgent("gemini")} disabled={!isGeminiEnabled}>
          <GeminiIcon className="w-3.5 h-3.5 mr-2" />
          Gemini
        </ContextMenuItem>
        <ContextMenuItem onClick={() => handleLaunchAgent("codex")} disabled={!isCodexEnabled}>
          <CodexIcon className="w-3.5 h-3.5 mr-2" />
          Codex
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => handleLaunchAgent("shell")}>
          <Terminal className="w-3.5 h-3.5 mr-2" />
          Open Shell
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
