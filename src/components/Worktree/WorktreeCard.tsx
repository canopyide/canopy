import { useCallback, useState, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { WorktreeState, ProjectDevServerSettings } from "../../types";
import { ActivityLight } from "./ActivityLight";
import { BranchLabel } from "./BranchLabel";
import { LiveTimeAgo } from "./LiveTimeAgo";
import { WorktreeDetails } from "./WorktreeDetails";
import { useDevServer } from "../../hooks/useDevServer";
import { useWorktreeTerminals } from "../../hooks/useWorktreeTerminals";
import {
  useErrorStore,
  useTerminalStore,
  type RetryAction,
  type TerminalInstance,
} from "../../store";
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
import { WorktreeDeleteDialog } from "./WorktreeDeleteDialog";
import {
  Copy,
  Code,
  CircleDot,
  GitPullRequest,
  Play,
  Plus,
  MoreHorizontal,
  Folder,
  ChevronDown,
  ChevronRight,
  GitCommit,
  Shield,
  Terminal,
  TerminalSquare,
  LayoutGrid,
  PanelBottom,
  ExternalLink,
  Trash2,
  Save,
} from "lucide-react";
import {
  ClaudeIcon,
  GeminiIcon,
  CodexIcon,
  NpmIcon,
  YarnIcon,
  PnpmIcon,
  BunIcon,
} from "@/components/icons";
import { getBrandColorHex } from "@/lib/colorUtils";
import type { TerminalType } from "@/types";
import type { AgentType, UseAgentLauncherReturn } from "@/hooks/useAgentLauncher";

function getTerminalIcon(type: TerminalType) {
  const brandColor = getBrandColorHex(type);
  const className = "w-3.5 h-3.5";

  switch (type) {
    case "claude":
      return <ClaudeIcon className={className} brandColor={brandColor} />;
    case "gemini":
      return <GeminiIcon className={className} brandColor={brandColor} />;
    case "codex":
      return <CodexIcon className={className} brandColor={brandColor} />;
    case "npm":
      return <NpmIcon className={className} />;
    case "yarn":
      return <YarnIcon className={className} />;
    case "pnpm":
      return <PnpmIcon className={className} />;
    case "bun":
      return <BunIcon className={className} />;
    default:
      return <TerminalSquare className={className} />;
  }
}

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
  onSaveLayout?: () => void;
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
  onSaveLayout,
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

  const { counts: terminalCounts, terminals: worktreeTerminals } = useWorktreeTerminals(
    worktree.id
  );
  const setFocused = useTerminalStore((state) => state.setFocused);

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

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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

  const handleTerminalSelect = useCallback(
    (terminal: TerminalInstance) => {
      setFocused(terminal.id);
    },
    [setFocused]
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
  const hasExpandableContent =
    hasChanges ||
    effectiveNote ||
    !!effectiveSummary ||
    showDevServer ||
    worktreeErrors.length > 0 ||
    terminalCounts.total > 0 ||
    !!rawLastCommitMessage;

  const showMetaFooter = terminalCounts.total > 0;

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

  type SpineState = "error" | "dirty" | "current" | "idle";
  const spineState: SpineState = useMemo(() => {
    if (worktreeErrors.length > 0) return "error";
    if (hasChanges) return "dirty";
    if (worktree.isCurrent) return "current";
    return "idle";
  }, [worktreeErrors.length, hasChanges, worktree.isCurrent]);

  const isIdleCard = spineState === "idle";

  const cardContent = (
    <div
      className={cn(
        "group relative border-b-2 border-white/5 transition-all duration-200",
        isActive ? "bg-white/[0.03]" : "hover:bg-white/[0.02] bg-transparent",
        isFocused && "bg-white/[0.04]",
        isIdleCard && !isActive && !isFocused && "opacity-70 hover:opacity-100",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent focus-visible:outline-offset-2"
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
      aria-label={`Worktree: ${branchLabel}${worktree.isCurrent ? " (current)" : ""}, Status: ${spineState}${worktreeErrors.length > 0 ? `, ${worktreeErrors.length} error${worktreeErrors.length !== 1 ? "s" : ""}` : ""}${hasChanges ? ", has uncommitted changes" : ""}`}
    >
      {/* Status Spine - multi-state health rail on left edge */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-[3px] transition-all duration-300",
          spineState === "error" && "bg-red-500",
          spineState === "dirty" && "bg-amber-500 shadow-[0_0_8px_rgba(251,191,36,0.4)]",
          spineState === "current" && "bg-teal-500",
          spineState === "idle" && "bg-transparent"
        )}
        aria-hidden="true"
      />
      <div className="px-3 py-5">
        {/* Header section with chevron gutter (grid layout) */}
        <div className="flex gap-3">
          {/* Chevron column */}
          <div className="flex items-start pt-0.5 w-5 shrink-0">
            {hasExpandableContent && (
              <button
                onClick={handleToggleExpand}
                className="p-0.5 text-canopy-text/60 hover:text-canopy-text transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent"
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

          {/* Main content column */}
          <div className="flex-1 min-w-0 space-y-1">
            {/* Row 1: Identity + Recency */}
            <div className="group/identity min-w-0 flex flex-col gap-1 relative">
              {/* Row 1: Branch name + recency */}
              <div className="flex items-center justify-between gap-2 min-h-[22px]">
                <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                  {isMainWorktree && (
                    <Shield className="w-3.5 h-3.5 text-canopy-text/40 opacity-30 shrink-0" />
                  )}
                  <BranchLabel
                    label={branchLabel}
                    isActive={isActive}
                    isMainWorktree={isMainWorktree}
                  />
                  {!worktree.branch && (
                    <span className="text-amber-500 text-[10px] font-medium shrink-0">
                      (detached)
                    </span>
                  )}
                </div>

                {/* Activity + Live Time - Unified recency chip */}
                <div
                  className={cn(
                    "flex items-center gap-1.5 shrink-0 text-[10px] px-2 py-0.5 rounded-full",
                    worktree.lastActivityTimestamp
                      ? "bg-white/[0.03] text-canopy-text/60"
                      : "bg-transparent text-canopy-text/40"
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
              </div>

              {/* Row 2: Context Badges (PR/Issue) - separate line */}
              {(worktree.issueNumber || worktree.prNumber) && (
                <div className="flex items-center gap-2">
                  {worktree.issueNumber && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenIssue?.();
                      }}
                      className="group/issue flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 hover:underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent"
                      title="Open Issue on GitHub"
                    >
                      <CircleDot className="w-2.5 h-2.5" />
                      <span className="font-mono">#{worktree.issueNumber}</span>
                      <ExternalLink className="w-3 h-3 opacity-60 group-hover/issue:opacity-100 transition-opacity" />
                    </button>
                  )}
                  {worktree.prNumber && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenPR?.();
                      }}
                      className={cn(
                        "group/pr flex items-center gap-1 text-[10px] hover:underline transition-colors",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent",
                        worktree.prState === "merged"
                          ? "text-purple-400 hover:text-purple-300"
                          : worktree.prState === "closed"
                            ? "text-red-400 hover:text-red-300"
                            : "text-green-400 hover:text-green-300"
                      )}
                      title={`PR #${worktree.prNumber} · ${worktree.prState ?? "open"}`}
                    >
                      <GitPullRequest className="w-2.5 h-2.5" />
                      <span className="font-mono">#{worktree.prNumber}</span>
                      <ExternalLink className="w-3 h-3 opacity-60 group-hover/pr:opacity-100 transition-opacity" />
                    </button>
                  )}
                </div>
              )}

              {/* Action Buttons - visible on hover/focus */}
              <div className="absolute right-0 flex items-center gap-0.5 opacity-0 group-hover/identity:opacity-100 group-focus-within/identity:opacity-100 focus-within:opacity-100 transition-opacity bg-gradient-to-l from-canopy-bg from-70% to-transparent pl-6 z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.currentTarget.blur();
                    onCopyTree();
                  }}
                  className="p-1 text-canopy-text/60 hover:text-white hover:bg-white/10 rounded transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent"
                  title="Copy Context"
                  aria-label="Copy Context"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 text-canopy-text/60 hover:text-white hover:bg-white/10 rounded transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent"
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
                    {onSaveLayout && totalTerminalCount > 0 && (
                      <DropdownMenuItem onClick={onSaveLayout}>
                        <Save className="w-3 h-3 mr-2" />
                        Save Layout as Recipe
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

                    {!isMainWorktree && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteDialog(true);
                          }}
                          className="text-[var(--color-status-error)] focus:text-[var(--color-status-error)]"
                        >
                          <Trash2 className="w-3 h-3 mr-2" />
                          Delete Worktree...
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>

        {/* Details Container - same styling for collapsed (pulse) and expanded */}
        {hasExpandableContent && (
          <div id={detailsId} className="mt-3 p-3 bg-white/[0.01] rounded-lg border border-white/5">
            {isExpanded ? (
              /* Expanded: full WorktreeDetails */
              <WorktreeDetails
                worktree={worktree}
                homeDir={homeDir}
                effectiveNote={effectiveNote}
                effectiveSummary={effectiveSummary}
                showDevServer={showDevServer}
                serverState={serverState}
                serverLoading={serverLoading}
                worktreeErrors={worktreeErrors}
                hasChanges={hasChanges}
                isFocused={isFocused}
                onPathClick={handlePathClick}
                onToggleServer={onToggleServer}
                onDismissError={dismissError}
                onRetryError={handleErrorRetry}
                showLastCommit={true}
              />
            ) : (
              /* Collapsed: Pulse line summary */
              <button
                onClick={handleToggleExpand}
                className="w-full flex items-center justify-between min-w-0 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent focus-visible:outline-offset-2"
              >
                {/* LEFT SLOT: Git Signal + Commit Message */}
                <div className="flex items-center gap-2 min-w-0 flex-1 text-[11px] font-mono text-canopy-text/60">
                  {workspaceScenario === "dirty" && worktree.worktreeChanges && (
                    <>
                      <span className="shrink-0">
                        {worktree.worktreeChanges.changedFileCount} file
                        {worktree.worktreeChanges.changedFileCount !== 1 ? "s" : ""}
                      </span>
                      {((worktree.worktreeChanges.insertions ?? 0) > 0 ||
                        (worktree.worktreeChanges.deletions ?? 0) > 0) && (
                        <>
                          <span className="text-canopy-text/40 shrink-0">·</span>
                          <span className="shrink-0">
                            {(worktree.worktreeChanges.insertions ?? 0) > 0 && (
                              <span className="text-[var(--color-status-success)]">
                                +{worktree.worktreeChanges.insertions}
                              </span>
                            )}
                            {(worktree.worktreeChanges.insertions ?? 0) > 0 &&
                              (worktree.worktreeChanges.deletions ?? 0) > 0 && (
                                <span className="text-canopy-text/40">/</span>
                              )}
                            {(worktree.worktreeChanges.deletions ?? 0) > 0 && (
                              <span className="text-[var(--color-status-error)]">
                                -{worktree.worktreeChanges.deletions}
                              </span>
                            )}
                          </span>
                        </>
                      )}
                      {/* Commit message in remaining space */}
                      {firstLineLastCommitMessage && (
                        <>
                          <span className="text-canopy-text/30 shrink-0">·</span>
                          <span className="truncate text-canopy-text/40">
                            {firstLineLastCommitMessage}
                          </span>
                        </>
                      )}
                    </>
                  )}
                  {workspaceScenario !== "dirty" && firstLineLastCommitMessage && (
                    <>
                      <GitCommit className="w-3 h-3 shrink-0 opacity-60" />
                      <span className="truncate">{firstLineLastCommitMessage}</span>
                    </>
                  )}
                </div>

                {/* RIGHT SLOT: Runtime Signal (server only) */}
                {serverState?.status === "running" && serverState.port && (
                  <div className="flex items-center shrink-0 ml-2">
                    <span
                      className="flex items-center gap-1 text-[10px] text-[var(--color-server-running)]"
                      title="Dev server running"
                    >
                      <div className="w-2 h-2 bg-[var(--color-server-running)] rounded-full animate-pulse" />
                      <span className="font-mono">:{serverState.port}</span>
                    </span>
                  </div>
                )}
              </button>
            )}
          </div>
        )}

        {/* Terminal Footer - clickable to open terminal switcher */}
        {showMetaFooter && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-full flex items-center justify-between mt-5 py-1.5 px-2 text-[10px] text-canopy-text/60 hover:text-canopy-text/80 bg-white/[0.02] rounded transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Left: Terminal icon + total count */}
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3 h-3" />
                  <span className="font-mono">{terminalCounts.total} active</span>
                </div>

                {/* Right: State breakdown */}
                <div className="flex items-center gap-3">
                  {terminalCounts.byState.working > 0 && (
                    <span className="flex items-center gap-1 text-[var(--color-status-success)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      {terminalCounts.byState.working} working
                    </span>
                  )}
                  {terminalCounts.byState.waiting > 0 && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {terminalCounts.byState.waiting} waiting
                    </span>
                  )}
                  {terminalCounts.byState.idle > 0 && (
                    <span className="flex items-center gap-1 text-canopy-text/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {terminalCounts.byState.idle} idle
                    </span>
                  )}
                  {terminalCounts.byState.completed > 0 && (
                    <span className="flex items-center gap-1 text-canopy-text/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {terminalCounts.byState.completed} completed
                    </span>
                  )}
                  {terminalCounts.byState.failed > 0 && (
                    <span className="flex items-center gap-1 text-red-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {terminalCounts.byState.failed} failed
                    </span>
                  )}
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Active Sessions ({worktreeTerminals.length})
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="max-h-[300px] overflow-y-auto">
                {worktreeTerminals.map((term) => (
                  <DropdownMenuItem
                    key={term.id}
                    onSelect={() => handleTerminalSelect(term)}
                    className="flex items-center gap-3 py-2 cursor-pointer"
                  >
                    <div className="shrink-0 opacity-80">{getTerminalIcon(term.type)}</div>
                    <div className="flex-1 min-w-0 flex flex-col">
                      <span className="text-sm font-medium truncate">{term.title}</span>
                      <span className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5">
                        {term.location === "dock" ? (
                          <>
                            <PanelBottom className="w-3 h-3" /> Docked
                          </>
                        ) : (
                          <>
                            <LayoutGrid className="w-3 h-3" /> Grid
                          </>
                        )}
                        {term.agentState && term.agentState !== "idle" && (
                          <>
                            <span>•</span>
                            <span
                              className={cn(
                                term.agentState === "working" &&
                                  "text-[var(--color-state-working)]",
                                term.agentState === "failed" && "text-[var(--color-status-error)]",
                                term.agentState === "completed" &&
                                  "text-[var(--color-status-success)]",
                                term.agentState === "waiting" && "text-[var(--color-state-waiting)]"
                              )}
                            >
                              {term.agentState}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          description={confirmDialog.description}
          onConfirm={confirmDialog.onConfirm}
          onCancel={closeConfirmDialog}
        />

        <WorktreeDeleteDialog
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          worktree={worktree}
        />
      </div>
    </div>
  );

  if (!onLaunchAgent) {
    return cardContent;
  }

  const isClaudeEnabled = agentAvailability?.claude && (agentSettings?.claude?.enabled ?? true);
  const isGeminiEnabled = agentAvailability?.gemini && (agentSettings?.gemini?.enabled ?? true);
  const isCodexEnabled = agentAvailability?.codex && (agentSettings?.codex?.enabled ?? true);

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
          Open Terminal
        </ContextMenuItem>
        {!isMainWorktree && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteDialog(true);
              }}
              className="text-[var(--color-status-error)] focus:text-[var(--color-status-error)]"
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Delete Worktree
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
