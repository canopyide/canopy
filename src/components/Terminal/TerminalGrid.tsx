import { useMemo, useCallback, useState, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useTerminalStore, type TerminalInstance } from "@/store";
import { useContextInjection } from "@/hooks/useContextInjection";
import { TerminalPane } from "./TerminalPane";
import { FilePickerModal } from "@/components/ContextInjection";
import { Terminal } from "lucide-react";
import { CanopyIcon, CodexIcon, ClaudeIcon, GeminiIcon } from "@/components/icons";
import { terminalInstanceService } from "@/services/TerminalInstanceService";
import { terminalClient } from "@/clients";
import { TerminalRefreshTier } from "@/types";

export interface TerminalGridProps {
  className?: string;
  defaultCwd?: string;
}

interface LauncherCardProps {
  title: string;
  description: string;
  shortcut?: string;
  icon: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}

function LauncherCard({
  title,
  description,
  shortcut,
  icon,
  onClick,
  primary,
}: LauncherCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center text-left p-3 rounded-xl border transition-all duration-200 min-h-[90px]", // Added min-h and flex items-center
        "bg-white/[0.02] hover:bg-white/[0.04]",
        primary
          ? "border-canopy-accent/20 hover:border-canopy-accent/50 hover:shadow-[0_0_15px_rgba(16,185,129,0.1)]"
          : "border-white/5 hover:border-white/10"
      )}
    >
      <div className="flex items-center justify-center p-2 rounded-lg mr-3 transition-colors">
        {icon}
      </div>

      <div className="flex-1">
        <div className="flex w-full items-center justify-between mb-1"> {/* mb-1 to reduce vertical space */}
          <h4
            className={cn(
              "font-medium text-base", // Increased font size for title
              primary ? "text-canopy-text" : "text-canopy-text/80 group-hover:text-canopy-text"
            )}
          >
            {title}
          </h4>
          {shortcut && (
            <span className="text-[10px] font-mono text-white/30 border border-white/10 rounded px-1.5 py-0.5 group-hover:text-white/50 group-hover:border-white/20 transition-colors">
              {shortcut}
            </span>
          )}
        </div>
        <p className="text-xs text-canopy-text/50 group-hover:text-canopy-text/70 transition-colors leading-relaxed">
          {description}
        </p>
      </div>
    </button>
  );
}

function EmptyState({
  onLaunchAgent,
}: {
  onLaunchAgent: (type: "claude" | "gemini" | "codex" | "shell") => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-8 animate-in fade-in duration-500">
      <div className="max-w-3xl w-full flex flex-col items-center">
        {/* Brand Hero */}
        <div className="mb-10 flex flex-col items-center text-center">
          <CanopyIcon className="h-16 w-16 text-canopy-accent opacity-50 mb-6" />
          <h3 className="text-2xl font-bold text-canopy-text tracking-tight mb-2">
            Canopy Command Center
          </h3>
          <p className="text-sm text-canopy-text/50 max-w-md leading-relaxed">
            Orchestrate your development workflow with AI agents. Select a runtime to begin.
          </p>
        </div>

        {/* Launcher Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl mb-12">
          <LauncherCard
            title="Claude Code"
            description="Best for sustained, autonomous refactoring sessions."
            shortcut="Ctrl+Shift+C"
            icon={<ClaudeIcon className="h-5 w-5" />}
            onClick={() => onLaunchAgent("claude")}
            primary
          />
          <LauncherCard
            title="Codex CLI"
            description="Top-tier reasoning depth with context compaction."
            icon={<CodexIcon className="h-5 w-5" />}
            onClick={() => onLaunchAgent("codex")}
            primary
          />
          <LauncherCard
            title="Gemini CLI"
            description="Fast auto-routing and multi-modal image input."
            shortcut="Ctrl+Shift+G"
            icon={<GeminiIcon className="h-5 w-5" />}
            onClick={() => onLaunchAgent("gemini")}
            primary
          />
          <LauncherCard
            title="Terminal"
            description="Standard shell access."
            icon={<Terminal className="h-5 w-5" />}
            onClick={() => onLaunchAgent("shell")}
          />
        </div>


      </div>
    </div>
  );
}

export function TerminalGrid({ className, defaultCwd }: TerminalGridProps) {
  // Use useShallow to prevent infinite loops when destructuring store state
  const { terminals, focusedId, maximizedId } = useTerminalStore(
    useShallow((state) => ({
      terminals: state.terminals,
      focusedId: state.focusedId,
      maximizedId: state.maximizedId,
    }))
  );

  // Get actions separately - these are stable references
  const addTerminal = useTerminalStore((state) => state.addTerminal);
  const trashTerminal = useTerminalStore((state) => state.trashTerminal);
  const updateTitle = useTerminalStore((state) => state.updateTitle);
  const setFocused = useTerminalStore((state) => state.setFocused);
  const toggleMaximize = useTerminalStore((state) => state.toggleMaximize);
  const moveTerminalToDock = useTerminalStore((state) => state.moveTerminalToDock);

  // Filter to only show grid terminals (not docked or trashed ones)
  const gridTerminals = useMemo(
    () => terminals.filter((t) => t.location === "grid" || t.location === undefined),
    [terminals]
  );

  // Use context injection hook for progress tracking
  const { inject, cancel, isInjecting, progress } = useContextInjection();

  // File picker modal state
  const [filePickerState, setFilePickerState] = useState<{
    isOpen: boolean;
    worktreeId: string | null;
    terminalId: string | null;
  }>({
    isOpen: false,
    worktreeId: null,
    terminalId: null,
  });

  // Calculate grid columns based on grid terminal count (not docked ones)
  // Use a dynamic formula that scales with terminal count
  const gridCols = useMemo(() => {
    const count = gridTerminals.length;
    if (count <= 1) return 1;
    if (count <= 4) return 2;
    // For 5+ terminals, use ceiling of square root for balanced grid
    // This gives: 5-6 → 3 cols, 7-9 → 3 cols, 10-12 → 4 cols, etc.
    return Math.min(Math.ceil(Math.sqrt(count)), 4); // Cap at 4 columns max
  }, [gridTerminals.length]);

  // Handle launching an agent from empty state
  const handleLaunchAgent = useCallback(
    async (type: "claude" | "gemini" | "codex" | "shell") => {
      try {
        const cwd = defaultCwd || "";
        await addTerminal({ type, cwd });
      } catch (error) {
        console.error(`Failed to launch ${type}:`, error);
        // Error will be displayed via the error banner system
      }
    },
    [addTerminal, defaultCwd]
  );

  // Handle context injection - open file picker modal
  const handleInjectContext = useCallback((terminalId: string, worktreeId?: string) => {
    if (!worktreeId) return;
    setFilePickerState({
      isOpen: true,
      worktreeId,
      terminalId,
    });
  }, []);

  // Handle file picker confirmation
  const handleFilePickerConfirm = useCallback(
    async (selectedPaths: string[]) => {
      if (!filePickerState.terminalId || !filePickerState.worktreeId) return;

      // Close modal
      setFilePickerState({ isOpen: false, worktreeId: null, terminalId: null });

      // Inject with selected paths
      await inject(
        filePickerState.worktreeId,
        filePickerState.terminalId,
        selectedPaths.length > 0 ? selectedPaths : undefined
      );
    },
    [filePickerState, inject]
  );

  // Handle file picker cancel
  const handleFilePickerCancel = useCallback(() => {
    setFilePickerState({ isOpen: false, worktreeId: null, terminalId: null });
  }, []);

  // Batch-fit visible grid terminals when layout (gridCols/count) changes to avoid synchronous thrash
  useEffect(() => {
    const ids = gridTerminals.map((t) => t.id);
    let cancelled = false;

    const timeoutId = window.setTimeout(() => {
      let index = 0;
      const processNext = () => {
        if (cancelled || index >= ids.length) return;
        const id = ids[index++];
        const managed = terminalInstanceService.get(id);

        if (managed?.hostElement.isConnected) {
          const dims = terminalInstanceService.fit(id);
          if (dims) {
            terminalClient.resize(id, dims.cols, dims.rows);
            terminalInstanceService.applyRendererPolicy(
              id,
              TerminalRefreshTier.VISIBLE
            );
          }
        }
        requestAnimationFrame(processNext);
      };
      processNext();
    }, 150); // allow grid to settle

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [gridCols, gridTerminals.length]);

  // If maximized, only show that terminal (must be a grid terminal)
  if (maximizedId) {
    const terminal = gridTerminals.find((t: TerminalInstance) => t.id === maximizedId);
    if (terminal) {
      return (
        <div className={cn("h-full", className)}>
          <TerminalPane
            id={terminal.id}
            title={terminal.title}
            type={terminal.type}
            worktreeId={terminal.worktreeId}
            cwd={terminal.cwd}
            isFocused={true}
            isMaximized={true}
            isInjecting={isInjecting}
            injectionProgress={progress}
            agentState={terminal.agentState}
            stateDebugInfo={
              terminal.stateChangeTrigger
                ? {
                    trigger: terminal.stateChangeTrigger,
                    confidence: terminal.stateChangeConfidence ?? 0,
                  }
                : null
            }
            activity={
              terminal.activityHeadline
                ? {
                    headline: terminal.activityHeadline,
                    status: terminal.activityStatus ?? "working",
                    type: terminal.activityType ?? "interactive",
                  }
                : null
            }
            onFocus={() => setFocused(terminal.id)}
            onClose={() => trashTerminal(terminal.id)}
            onInjectContext={
              terminal.worktreeId
                ? () => handleInjectContext(terminal.id, terminal.worktreeId)
                : undefined
            }
            onCancelInjection={cancel}
            onToggleMaximize={() => toggleMaximize(terminal.id)}
            onTitleChange={(newTitle) => updateTitle(terminal.id, newTitle)}
          />
        </div>
      );
    }
  }

  // Empty state - show when no grid terminals (docked terminals don't count for empty)
  if (gridTerminals.length === 0) {
    return (
      <div className={cn("h-full", className)}>
        <EmptyState
          onLaunchAgent={handleLaunchAgent}
        />
      </div>
    );
  }

  return (
    <div
      className={cn("h-full bg-canopy-border", className)} // bg acts as divider lines
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gridAutoRows: "1fr",
        gap: "1px", // 1px gap reveals bg-canopy-border underneath = clean dividers
        padding: "0", // No outer padding
      }}
    >
      {gridTerminals.map((terminal: TerminalInstance) => (
        <TerminalPane
          key={terminal.id}
          id={terminal.id}
          title={terminal.title}
          type={terminal.type}
          worktreeId={terminal.worktreeId}
          cwd={terminal.cwd}
          isFocused={terminal.id === focusedId}
          isMaximized={false}
          isInjecting={isInjecting}
          injectionProgress={progress}
          agentState={terminal.agentState}
          stateDebugInfo={
            terminal.stateChangeTrigger
              ? {
                  trigger: terminal.stateChangeTrigger,
                  confidence: terminal.stateChangeConfidence ?? 0,
                }
              : null
          }
          activity={
            terminal.activityHeadline
              ? {
                  headline: terminal.activityHeadline,
                  status: terminal.activityStatus ?? "working",
                  type: terminal.activityType ?? "interactive",
                }
              : null
          }
          onFocus={() => setFocused(terminal.id)}
          onClose={() => trashTerminal(terminal.id)}
          onInjectContext={
            terminal.worktreeId
              ? () => handleInjectContext(terminal.id, terminal.worktreeId)
              : undefined
          }
          onCancelInjection={cancel}
          onToggleMaximize={() => toggleMaximize(terminal.id)}
          onTitleChange={(newTitle) => updateTitle(terminal.id, newTitle)}
          onMinimize={() => moveTerminalToDock(terminal.id)}
        />
      ))}

      {/* File Picker Modal */}
      {filePickerState.worktreeId && (
        <FilePickerModal
          isOpen={filePickerState.isOpen}
          worktreeId={filePickerState.worktreeId}
          onConfirm={handleFilePickerConfirm}
          onCancel={handleFilePickerCancel}
        />
      )}
    </div>
  );
}

export default TerminalGrid;
