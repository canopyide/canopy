import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  RefreshCw,
  Settings,
  Terminal,
  Plus,
  Command,
  AlertCircle,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { ClaudeIcon, GeminiIcon, CodexIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { getProjectGradient } from "@/lib/colorUtils";
import { BulkActionsMenu } from "@/components/Terminal";
import { useProjectStore } from "@/store/projectStore";

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
        Wrapped in app-no-drag so they remain clickable
      */}
      <div className="flex gap-2 app-no-drag">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onLaunchAgent("claude")}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent"
          title="Launch Claude (Ctrl+Shift+C)"
          aria-label="Launch Claude"
        >
          <ClaudeIcon className="h-4 w-4" />
          <span className="hidden lg:inline">Claude</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onLaunchAgent("gemini")}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent"
          title="Launch Gemini (Ctrl+Shift+G)"
          aria-label="Launch Gemini"
        >
          <GeminiIcon className="h-4 w-4" />
          <span className="hidden lg:inline">Gemini</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onLaunchAgent("codex")}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent"
          title="Launch Codex (Ctrl+Shift+X)"
          aria-label="Launch Codex"
        >
          <CodexIcon className="h-4 w-4" />
          <span className="hidden lg:inline">Codex</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onLaunchAgent("shell")}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent"
          title="Launch Shell (Ctrl+T)"
          aria-label="Launch Shell"
        >
          <Terminal className="h-4 w-4" />
          <span className="hidden lg:inline">Shell</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8"
              aria-label="Add new terminal"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onLaunchAgent("claude")}>
              <ClaudeIcon className="mr-2 h-4 w-4" />
              <span>Claude</span>
              <DropdownMenuShortcut>Ctrl+Shift+C</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onLaunchAgent("gemini")}>
              <GeminiIcon className="mr-2 h-4 w-4" />
              <span>Gemini</span>
              <DropdownMenuShortcut>Ctrl+Shift+G</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onLaunchAgent("codex")}>
              <CodexIcon className="mr-2 h-4 w-4" />
              <span>Codex</span>
              <DropdownMenuShortcut>Ctrl+Shift+X</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onLaunchAgent("shell")}>
              <Terminal className="mr-2 h-4 w-4" />
              <span>Shell</span>
              <DropdownMenuShortcut>Ctrl+T</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <Command className="mr-2 h-4 w-4" />
              <span>Custom Command...</span>
              <DropdownMenuShortcut>Ctrl+Shift+N</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <BulkActionsMenu />
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
        Wrapped in app-no-drag so they remain clickable
      */}
      <div className="flex gap-2 app-no-drag">
        {/* Focus mode toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleFocusMode}
          className={cn(
            "text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8",
            isFocusMode && "bg-canopy-accent/20 text-canopy-accent"
          )}
          title={isFocusMode ? "Exit Focus Mode (Cmd+K Z)" : "Enter Focus Mode (Cmd+K Z)"}
          aria-label={isFocusMode ? "Exit focus mode" : "Enter focus mode"}
          aria-pressed={isFocusMode}
        >
          {isFocusMode ? (
            <Minimize2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
        {/* Problems button with error count badge */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleProblems}
          className={cn(
            "text-canopy-text hover:bg-canopy-border hover:text-canopy-accent relative",
            errorCount > 0 && "text-[var(--color-status-error)]"
          )}
          title="Problems (Ctrl+Shift+P)"
          aria-label={`Problems: ${errorCount} error${errorCount !== 1 ? "s" : ""}`}
        >
          <AlertCircle className="h-4 w-4" />
          {errorCount > 0 && <span className="ml-1 text-xs">{errorCount}</span>}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onSettings}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8"
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
          aria-label="Refresh worktrees"
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        </Button>
      </div>
    </header>
  );
}
