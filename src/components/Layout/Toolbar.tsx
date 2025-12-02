import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  RefreshCw,
  Settings,
  Terminal,
  AlertCircle,
  Maximize2,
  Minimize2,
  GitCommit,
  GitPullRequest,
  AlertTriangle,
  CircleHelp,
} from "lucide-react";
import { ClaudeIcon, GeminiIcon, CodexIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { getProjectGradient, getBrandColorHex } from "@/lib/colorUtils";
import { BulkActionsMenu } from "@/components/Terminal";
import { GitHubResourceList } from "@/components/GitHub";
import { useProjectStore } from "@/store/projectStore";
import { useTerminalStore } from "@/store/terminalStore";
import { useRepositoryStats } from "@/hooks/useRepositoryStats";
import type { CliAvailability, AgentSettings } from "@shared/types";

interface ToolbarProps {
  onLaunchAgent: (type: "claude" | "gemini" | "codex" | "shell") => void;
  onRefresh: () => void;
  onSettings: () => void;
  /** Number of active errors */
  errorCount?: number;
  /** Called when problems button is clicked */
  onToggleProblems?: () => void;
  /** Whether focus mode is active */
  isFocusMode?: boolean;
  /** Called when focus mode button is clicked */
  onToggleFocusMode?: () => void;
  /** Whether worktree refresh is in progress */
  isRefreshing?: boolean;
  /** Called when welcome/help button is clicked */
  onShowWelcome?: () => void;
  /** CLI availability status for agent buttons */
  agentAvailability?: CliAvailability;
  /** Agent settings (to check enabled status) */
  agentSettings?: AgentSettings | null;
}

export function Toolbar({
  onLaunchAgent,
  onRefresh,
  onSettings,
  errorCount = 0,
  onToggleProblems,
  isFocusMode = false,
  onToggleFocusMode,
  isRefreshing = false,
  onShowWelcome,
  agentAvailability,
  agentSettings,
}: ToolbarProps) {
  const currentProject = useProjectStore((state) => state.currentProject);
  const terminals = useTerminalStore((state) => state.terminals);
  const { stats, error: statsError, refresh: refreshStats } = useRepositoryStats();

  // Popover states for GitHub lists
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [prsOpen, setPrsOpen] = useState(false);

  // Show BulkActionsMenu when there are any terminals (actionable or not)
  const showBulkActions = terminals.length > 0;

  // Helper to check if an agent should be shown in the toolbar
  // Must be installed (availability check) AND enabled in settings (user preference)
  const shouldShowAgent = (type: "claude" | "gemini" | "codex"): boolean => {
    // Must be installed (system check) - default to false if availability not yet loaded
    if (!agentAvailability?.[type]) return false;
    // Must be enabled in settings (default true if settings not loaded yet)
    if (agentSettings && agentSettings[type].enabled === false) return false;
    return true;
  };

  return (
    <header className="relative h-12 flex items-center px-4 shrink-0 app-drag-region bg-canopy-sidebar border-b border-canopy-border shadow-sm">
      {/* 1. RESIZE STRIP:
        Invisible strip at the very top to allow resizing from the top edge on non-macOS systems
      */}
      <div className="window-resize-strip" />

      {/* 2. TRAFFIC LIGHT SPACER (macOS):
        Keeps content away from window controls.
      */}
      <div className="w-20 shrink-0" />

      {/* 3. LEFT ACTIONS:
        Wrapped in app-no-drag so they remain clickable.
        Agent launchers are icon-only for clean appearance.
        Each agent shows its brand color on hover and keyboard focus.
      */}
      <div className="flex items-center gap-1 app-no-drag">
        {shouldShowAgent("claude") && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onLaunchAgent("claude")}
            className="text-canopy-text hover:bg-canopy-border h-8 w-8 transition-colors hover:text-canopy-accent focus-visible:text-canopy-accent"
            title="Start Claude (Opus 4.5 for deep work)"
            aria-label="Start Claude Agent"
          >
            <ClaudeIcon className="h-4 w-4" brandColor={getBrandColorHex("claude")} />
          </Button>
        )}
        {shouldShowAgent("gemini") && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onLaunchAgent("gemini")}
            className="text-canopy-text hover:bg-canopy-border h-8 w-8 transition-colors hover:text-canopy-accent focus-visible:text-canopy-accent"
            title="Start Gemini (Auto-routing enabled)"
            aria-label="Start Gemini Agent"
          >
            <GeminiIcon className="h-4 w-4" brandColor={getBrandColorHex("gemini")} />
          </Button>
        )}
        {shouldShowAgent("codex") && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onLaunchAgent("codex")}
            className="text-canopy-text hover:bg-canopy-border h-8 w-8 transition-colors hover:text-canopy-accent focus-visible:text-canopy-accent"
            title="Start Codex (GPT-5.1 Max)"
            aria-label="Start Codex Agent"
          >
            <CodexIcon className="h-4 w-4" brandColor={getBrandColorHex("codex")} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onLaunchAgent("shell")}
          className="text-canopy-text hover:bg-canopy-border h-8 w-8 transition-colors hover:text-canopy-accent focus-visible:text-canopy-accent"
          title="Open Shell"
          aria-label="Open Shell"
        >
          <Terminal className="h-4 w-4" />
        </Button>
        {/* BulkActionsMenu only visible when there are terminals to act on */}
        {showBulkActions && <BulkActionsMenu />}
      </div>

      {/* 4. CENTER TITLE (The "Grip" Area):
        This flex-1 area expands to fill empty space. By NOT putting app-no-drag here,
        this entire center section becomes the primary handle for moving the window.
      */}
      <div className="flex-1 flex justify-center items-center h-full opacity-70 hover:opacity-100 transition-opacity">
        {currentProject ? (
          <div
            className="flex items-center gap-2 px-3 py-1 rounded-md select-none"
            style={{
              background: getProjectGradient(currentProject.color),
            }}
          >
            <span className="text-lg" aria-label="Project emoji">
              {currentProject.emoji}
            </span>
            <span className="text-xs font-medium text-white tracking-wide drop-shadow-md">
              {currentProject.name}
            </span>
          </div>
        ) : (
          <span className="text-xs font-medium text-canopy-text tracking-wide select-none">
            Canopy Command Center
          </span>
        )}
      </div>

      {/* 5. RIGHT ACTIONS:
        Wrapped in app-no-drag so they remain clickable.
        Grouped by purpose: GitHub Stats | View/Health cluster | Settings/Actions cluster
      */}
      <div className="flex items-center gap-1 app-no-drag">
        {/* GitHub Stats - show even with errors for consistent layout */}
        {stats && currentProject && (
          <>
            <div className="flex items-center gap-1">
              {/* Issues Popover */}
              <Popover open={issuesOpen} onOpenChange={setIssuesOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={statsError ? refreshStats : undefined}
                    className={cn(
                      "text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-7 px-2 gap-1.5",
                      (stats.issueCount === 0 || statsError) && "opacity-50",
                      statsError && "text-[var(--color-status-error)]",
                      issuesOpen && "bg-canopy-border text-canopy-accent"
                    )}
                    title={
                      statsError
                        ? `GitHub error: ${statsError} (click to retry)`
                        : "Browse GitHub Issues"
                    }
                    aria-label={
                      statsError ? "GitHub stats error" : `${stats.issueCount ?? 0} open issues`
                    }
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">{stats.issueCount ?? "?"}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="end" sideOffset={8}>
                  <GitHubResourceList
                    type="issue"
                    projectPath={currentProject.path}
                    onClose={() => setIssuesOpen(false)}
                  />
                </PopoverContent>
              </Popover>

              {/* PRs Popover */}
              <Popover open={prsOpen} onOpenChange={setPrsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={statsError ? refreshStats : undefined}
                    className={cn(
                      "text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-7 px-2 gap-1.5",
                      (stats.prCount === 0 || statsError) && "opacity-50",
                      statsError && "text-[var(--color-status-error)]",
                      prsOpen && "bg-canopy-border text-canopy-accent"
                    )}
                    title={
                      statsError
                        ? `GitHub error: ${statsError} (click to retry)`
                        : "Browse GitHub Pull Requests"
                    }
                    aria-label={
                      statsError ? "GitHub stats error" : `${stats.prCount ?? 0} open pull requests`
                    }
                  >
                    <GitPullRequest className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">{stats.prCount ?? "?"}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="end" sideOffset={8}>
                  <GitHubResourceList
                    type="pr"
                    projectPath={currentProject.path}
                    onClose={() => setPrsOpen(false)}
                  />
                </PopoverContent>
              </Popover>

              <div
                className={cn(
                  "flex items-center gap-1.5 px-2 h-7 rounded-md",
                  (stats.commitCount === 0 || statsError) && "opacity-50",
                  statsError && "text-[var(--color-status-error)]"
                )}
                title={
                  statsError ? `GitHub error: ${statsError}` : "Total commits in current branch"
                }
                aria-label={statsError ? "GitHub stats error" : `${stats.commitCount} commits`}
              >
                <GitCommit className="h-3.5 w-3.5 text-canopy-text" />
                <span className="text-xs font-medium text-canopy-text">{stats.commitCount}</span>
              </div>
            </div>
            {/* Visual divider */}
            <div className="w-px h-6 bg-canopy-border" />
          </>
        )}

        {/* View & Health cluster */}
        <div className="flex items-center gap-1">
          {/* Focus mode toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleFocusMode}
            className={cn(
              "text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8",
              isFocusMode && "bg-canopy-accent/20 text-canopy-accent"
            )}
            title={
              isFocusMode ? "Exit Focus Mode (Cmd/Ctrl+K, Z)" : "Toggle Focus Mode (Cmd/Ctrl+K, Z)"
            }
            aria-label={isFocusMode ? "Exit focus mode" : "Enter focus mode"}
            aria-pressed={isFocusMode}
          >
            {isFocusMode ? (
              <Minimize2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
          {/* Problems button with error count indicator */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleProblems}
            className={cn(
              "text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8 relative",
              errorCount > 0 && "text-[var(--color-status-error)]"
            )}
            title="Show Problems Panel (Ctrl+Shift+M)"
            aria-label={`Problems: ${errorCount} error${errorCount !== 1 ? "s" : ""}`}
          >
            <AlertCircle className="h-4 w-4" />
            {errorCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-[var(--color-status-error)] rounded-full" />
            )}
          </Button>
        </div>

        {/* Visual divider */}
        <div className="w-px h-6 bg-canopy-border" />

        {/* Settings & Actions cluster */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onShowWelcome}
            className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8"
            title="Welcome & Help"
            aria-label="Show welcome screen"
          >
            <CircleHelp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onSettings}
            className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8"
            title="Open Settings"
            aria-label="Open settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isRefreshing}
            className={cn(
              "text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8",
              isRefreshing && "cursor-not-allowed opacity-50"
            )}
            title="Refresh Worktrees"
            aria-label="Refresh worktrees"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </div>
    </header>
  );
}
