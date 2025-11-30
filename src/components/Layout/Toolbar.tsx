import { Button } from "@/components/ui/button";
import { RefreshCw, Settings, Terminal, AlertCircle, Maximize2, Minimize2 } from "lucide-react";
import { ClaudeIcon, GeminiIcon, CodexIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { getProjectGradient } from "@/lib/colorUtils";
import { BulkActionsMenu } from "@/components/Terminal";
import { useProjectStore } from "@/store/projectStore";
import { useTerminalStore } from "@/store/terminalStore";

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
}: ToolbarProps) {
  const currentProject = useProjectStore((state) => state.currentProject);
  const terminals = useTerminalStore((state) => state.terminals);

  // Show BulkActionsMenu when there are any terminals (actionable or not)
  const showBulkActions = terminals.length > 0;

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
      */}
      <div className="flex items-center gap-1 app-no-drag">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onLaunchAgent("claude")}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8"
          title="Launch Claude Agent (Ctrl+Shift+C)"
          aria-label="Launch Claude Agent"
        >
          <ClaudeIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onLaunchAgent("gemini")}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8"
          title="Launch Gemini Agent (Ctrl+Shift+G)"
          aria-label="Launch Gemini Agent"
        >
          <GeminiIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onLaunchAgent("codex")}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8"
          title="Launch Codex Agent"
          aria-label="Launch Codex Agent"
        >
          <CodexIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onLaunchAgent("shell")}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8"
          title="Open Shell Terminal"
          aria-label="Open Shell Terminal"
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
        Grouped by purpose: View/Health cluster | Settings/Actions cluster
      */}
      <div className="flex items-center gap-1 app-no-drag">
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
