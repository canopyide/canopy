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
  Bot,
  Sparkles,
  Plus,
  Command,
  AlertCircle,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BulkActionsMenu } from "@/components/Terminal";

interface ToolbarProps {
  onLaunchAgent: (type: "claude" | "gemini" | "shell") => void;
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
}

export function Toolbar({
  onLaunchAgent,
  onRefresh,
  onSettings,
  errorCount = 0,
  onToggleProblems,
  isFocusMode = false,
  onToggleFocusMode,
}: ToolbarProps) {
  return (
    <header className="h-12 flex items-center px-4 border-b border-canopy-border bg-canopy-sidebar drag-region shrink-0">
      {/* Space for traffic lights on macOS */}
      <div className="w-20 shrink-0" />

      {/* Agent launcher buttons */}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onLaunchAgent("claude")}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent"
          title="Launch Claude (Ctrl+Shift+C)"
        >
          <Bot className="h-4 w-4" />
          <span>Claude</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onLaunchAgent("gemini")}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent"
          title="Launch Gemini (Ctrl+Shift+G)"
        >
          <Sparkles className="h-4 w-4" />
          <span>Gemini</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onLaunchAgent("shell")}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent"
          title="Launch Shell (Ctrl+T)"
        >
          <Terminal className="h-4 w-4" />
          <span>Shell</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8"
              aria-label="Add new terminal"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onLaunchAgent("claude")}>
              <Bot className="mr-2 h-4 w-4" />
              <span>Claude</span>
              <DropdownMenuShortcut>Ctrl+Shift+C</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onLaunchAgent("gemini")}>
              <Sparkles className="mr-2 h-4 w-4" />
              <span>Gemini</span>
              <DropdownMenuShortcut>Ctrl+Shift+G</DropdownMenuShortcut>
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

      {/* Title - centered */}
      <div className="flex-1 flex justify-center">
        <span className="text-canopy-text font-semibold text-sm">Canopy Command Center</span>
      </div>

      {/* Right side actions */}
      <div className="flex gap-2">
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
            errorCount > 0 && "text-red-400"
          )}
          title="Problems (Ctrl+Shift+P)"
          aria-label={`Problems: ${errorCount} errors`}
        >
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {errorCount > 0 && <span className="ml-1 text-xs">{errorCount}</span>}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onSettings}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8"
          aria-label="Open settings"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8"
          aria-label="Refresh worktrees"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}
