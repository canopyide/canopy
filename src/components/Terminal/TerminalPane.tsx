/**
 * TerminalPane Component
 *
 * Wraps XtermAdapter with a compact monospace header bar in tiling window manager style.
 * The header uses monospace fonts to match terminal content and minimal height for a
 * sleek, integrated appearance.
 *
 * Structure:
 * ┌─────────────────────────────────────────────────┐
 * │ 🖥️ Shell - feature/auth           [📋] [×]     │  <- Header (32px, monospace)
 * ├─────────────────────────────────────────────────┤
 * │                                                  │
 * │  user@machine:~/project$                        │  <- XtermAdapter
 * │                                                  │
 * └─────────────────────────────────────────────────┘
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { Terminal, Command, X, Maximize2, Minimize2, Copy, Loader2 } from "lucide-react";
import { ClaudeIcon, GeminiIcon, CodexIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { XtermAdapter } from "./XtermAdapter";
import { ArtifactOverlay } from "./ArtifactOverlay";
import { ErrorBanner } from "../Errors/ErrorBanner";
import { useErrorStore, useTerminalStore, type RetryAction } from "@/store";
import { useContextInjection, type CopyTreeProgress } from "@/hooks/useContextInjection";
import type { AgentState } from "@/types";

export type TerminalType = "shell" | "claude" | "gemini" | "codex" | "custom";

export interface TerminalPaneProps {
  /** Unique terminal identifier */
  id: string;
  /** Display title for the terminal */
  title: string;
  /** Type of terminal (affects icon display) */
  type: TerminalType;
  /** Associated worktree ID (enables inject context button) */
  worktreeId?: string;
  /** Working directory for the terminal */
  cwd: string;
  /** Whether this terminal pane has focus */
  isFocused: boolean;
  /** Whether this terminal is maximized */
  isMaximized?: boolean;
  /** Whether context injection is in progress */
  isInjecting?: boolean;
  /** Current injection progress (if injecting) */
  injectionProgress?: CopyTreeProgress | null;
  /** Current agent state (for agent terminals) */
  agentState?: AgentState;
  /** Called when the pane is clicked/focused */
  onFocus: () => void;
  /** Called when the close button is clicked */
  onClose: () => void;
  /** Called when inject context button is clicked */
  onInjectContext?: () => void;
  /** Called when cancel injection button is clicked */
  onCancelInjection?: () => void;
  /** Called when double-click on header or maximize button clicked */
  onToggleMaximize?: () => void;
  /** Called when user edits the terminal title */
  onTitleChange?: (newTitle: string) => void;
}

/**
 * Get terminal icon based on type - Custom brand icons for AI agents
 */
function getTerminalIcon(type: TerminalType, className?: string) {
  const props = { className: cn("w-3.5 h-3.5", className), "aria-hidden": "true" as const };
  switch (type) {
    case "claude":
      return <ClaudeIcon {...props} />;
    case "gemini":
      return <GeminiIcon {...props} />;
    case "codex":
      return <CodexIcon {...props} />;
    case "custom":
      return <Command {...props} />;
    case "shell":
      return <Terminal {...props} />;
  }
}

export function TerminalPane({
  id,
  title,
  type,
  worktreeId,
  cwd,
  isFocused,
  isMaximized,
  isInjecting,
  injectionProgress,
  agentState,
  onFocus,
  onClose,
  onInjectContext,
  onCancelInjection: _onCancelInjection, // Unused with minimal progress bar
  onToggleMaximize,
  onTitleChange,
}: TerminalPaneProps) {
  const [isExited, setIsExited] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingValue, setEditingValue] = useState(title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Get context injection hook for retry handling
  const { inject } = useContextInjection();

  // Get queued command count for this terminal
  const queueCount = useTerminalStore(
    useShallow((state) => state.commandQueue.filter((c) => c.terminalId === id).length)
  );

  // Determine if agent is working (busy)
  const isAgentWorking = agentState === "working";

  // Get errors for this terminal - subscribe to store changes
  // Use useShallow to prevent infinite loops from .filter() creating new array references
  const terminalErrors = useErrorStore(
    useShallow((state) => state.errors.filter((e) => e.context?.terminalId === id && !e.dismissed))
  );
  const dismissError = useErrorStore((state) => state.dismissError);
  const removeError = useErrorStore((state) => state.removeError);

  // Handle error retry
  const handleErrorRetry = useCallback(
    async (errorId: string, action: RetryAction, args?: Record<string, unknown>) => {
      try {
        // Handle injectContext retry locally
        if (action === "injectContext") {
          const worktreeIdArg = args?.worktreeId as string | undefined;
          const terminalIdArg = args?.terminalId as string | undefined;
          const selectedPaths = args?.selectedPaths as string[] | undefined;

          if (!worktreeIdArg || !terminalIdArg) {
            console.error("Missing worktreeId or terminalId for injectContext retry");
            return;
          }

          // Retry the injection
          await inject(worktreeIdArg, terminalIdArg, selectedPaths);

          // Explicitly remove error on success
          removeError(errorId);
        } else if (window.electron?.errors?.retry) {
          // For other actions, delegate to the main process
          await window.electron.errors.retry(errorId, action, args);
          // On successful retry, remove the error from the store
          removeError(errorId);
        }
      } catch (error) {
        console.error("Error retry failed:", error);
        // Retry failed - the main process will send a new error event
      }
    },
    [inject, removeError]
  );

  // Reset exit state when terminal ID changes (e.g., terminal restart or reorder)
  useEffect(() => {
    setIsExited(false);
    setExitCode(null);
  }, [id]);

  // Sync editing value when title prop changes externally
  useEffect(() => {
    if (!isEditingTitle) {
      setEditingValue(title);
    }
  }, [title, isEditingTitle]);

  // Focus and select input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleTitleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent header double-click maximize
      if (onTitleChange) {
        setIsEditingTitle(true);
      }
    },
    [onTitleChange]
  );

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (onTitleChange && (e.key === "Enter" || e.key === "F2")) {
        e.preventDefault();
        e.stopPropagation();
        setIsEditingTitle(true);
      }
    },
    [onTitleChange]
  );

  const handleTitleSave = useCallback(() => {
    if (!isEditingTitle) return; // Guard against blur after cancel
    setIsEditingTitle(false);
    if (onTitleChange) {
      onTitleChange(editingValue);
    }
  }, [isEditingTitle, editingValue, onTitleChange]);

  const handleTitleCancel = useCallback(() => {
    setIsEditingTitle(false);
    setEditingValue(title); // Revert to original
  }, [title]);

  const handleTitleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleTitleSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleTitleCancel();
      }
    },
    [handleTitleSave, handleTitleCancel]
  );

  const handleExit = useCallback((code: number) => {
    setIsExited(true);
    setExitCode(code);
  }, []);

  const handleReady = useCallback(() => {
    // Terminal is ready and connected
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ignore events from xterm's internal input elements (textarea/input)
      // to avoid intercepting actual terminal typing
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        return;
      }

      // Also ignore events from buttons to prevent breaking their click handlers
      if (target.tagName === "BUTTON" || target !== e.currentTarget) {
        return;
      }

      // Activate terminal on Enter or Space only when the container itself is focused
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onFocus();
      }
    },
    [onFocus]
  );

  return (
    <div
      className={cn(
        "flex flex-col h-full border border-canopy-border/50 group", // Tiling style - full border for all edges
        isFocused ? "border-canopy-accent/50" : "border-canopy-border/30", // Subtle focus indication
        isExited && "opacity-75 grayscale"
      )}
      onClick={onFocus}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="group"
      aria-label={`${type} terminal: ${title}`}
    >
      {/* Header - Status bar style */}
      <div
        className={cn(
          "flex items-center justify-between px-3 h-8 shrink-0 font-mono text-sm transition-colors", // Tiling WM aesthetic - improved contrast
          isFocused ? "bg-canopy-sidebar" : "bg-black/20"
        )}
        onDoubleClick={onToggleMaximize}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("shrink-0 text-canopy-text/70", isFocused && "text-canopy-accent")}>
            {getTerminalIcon(type)}
          </span>

          {/* Title - Monospace and smaller */}
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onKeyDown={handleTitleInputKeyDown}
              onBlur={handleTitleSave}
              className="text-sm font-medium bg-black/40 border border-canopy-accent/50 px-1 h-5 min-w-32 outline-none text-canopy-text select-text"
              aria-label="Edit terminal title"
            />
          ) : (
            <span
              className={cn(
                "font-medium text-canopy-text/90 truncate select-none",
                onTitleChange && "cursor-text hover:text-canopy-text"
              )}
              onDoubleClick={handleTitleDoubleClick}
              onKeyDown={handleTitleKeyDown}
              tabIndex={onTitleChange ? 0 : undefined}
              role={onTitleChange ? "button" : undefined}
              title={onTitleChange ? `${title} — Double-click or press Enter to edit` : title}
              aria-label={
                onTitleChange ? `Terminal title: ${title}. Press Enter or F2 to edit` : undefined
              }
            >
              {title}
            </span>
          )}

          {/* Subtle exit code */}
          {isExited && (
            <span
              className="text-xs font-mono text-[var(--color-status-error)] ml-1"
              role="status"
              aria-live="polite"
            >
              [exit {exitCode}]
            </span>
          )}

          {/* Working state spinner */}
          {isAgentWorking && (
            <div
              className="flex items-center gap-1 text-[var(--color-state-working)] ml-1"
              role="status"
              aria-live="polite"
              aria-label="Agent is working"
            >
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              <span className="text-xs font-mono">Working</span>
            </div>
          )}

          {/* Queue count indicator */}
          {queueCount > 0 && (
            <div
              className="text-xs font-mono bg-blue-900/60 text-blue-200 px-1.5 py-0.5 rounded ml-1"
              role="status"
              aria-live="polite"
              title={`${queueCount} command${queueCount > 1 ? "s" : ""} queued`}
            >
              {queueCount} queued
            </div>
          )}
        </div>

        {/* Controls - Ghostty style (minimal, subtle, appear on hover/focus) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {worktreeId && onInjectContext && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInjectContext();
              }}
              className={cn(
                "p-1.5 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent text-canopy-text/60 hover:text-[var(--color-state-working)] transition-colors",
                isInjecting && "opacity-50 cursor-not-allowed"
              )}
              title="Inject Context (Ctrl+Shift+I)"
              aria-label="Inject worktree context"
              disabled={isExited || isInjecting}
            >
              <Copy className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
          {onToggleMaximize && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFocus();
                onToggleMaximize();
              }}
              className="p-1.5 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent text-canopy-text/60 hover:text-canopy-text transition-colors"
              title={isMaximized ? "Restore (Ctrl+Shift+F)" : "Maximize (Ctrl+Shift+F)"}
              aria-label={isMaximized ? "Restore terminal" : "Maximize terminal"}
            >
              {isMaximized ? (
                <Minimize2 className="w-3 h-3" aria-hidden="true" />
              ) : (
                <Maximize2 className="w-3 h-3" aria-hidden="true" />
              )}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 hover:bg-red-500/20 focus-visible:bg-red-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-status-error)] text-canopy-text/60 hover:text-[var(--color-status-error)] transition-colors"
            title="Close Terminal (Ctrl+Shift+W)"
            aria-label="Close terminal"
          >
            <X className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Context injection progress - enhanced with detailed stage information */}
      {isInjecting && injectionProgress && (
        <div className="p-2 bg-canopy-sidebar border-t border-canopy-border shrink-0">
          {/* Header with label and percentage */}
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Injecting Context</span>
            <span>{Math.min(100, Math.max(0, Math.round(injectionProgress.progress * 100)))}%</span>
          </div>

          {/* Progress bar - slightly thicker for better visibility */}
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden mb-1">
            <div
              className="h-full bg-canopy-accent transition-all duration-200"
              style={{
                width: `${Math.min(100, Math.max(0, injectionProgress.progress * 100))}%`,
              }}
            />
          </div>

          {/* Stage name and file count */}
          <div className="text-xs text-gray-400">
            {(() => {
              // Map technical stage names to user-friendly labels
              const stageLabels: Record<string, string> = {
                FileDiscoveryStage: "Discovering files",
                FormatterStage: "Formatting",
                OutputStage: "Writing output",
                Starting: "Starting",
                Initializing: "Initializing",
                Complete: "Complete",
              };
              const friendlyStage =
                stageLabels[injectionProgress.stage] ||
                injectionProgress.stage.replace(/Stage$/, "");
              return friendlyStage;
            })()}
            {injectionProgress.filesProcessed !== undefined &&
              injectionProgress.totalFiles !== undefined && (
                <>
                  {" · "}
                  {injectionProgress.filesProcessed}/{injectionProgress.totalFiles} files
                </>
              )}
          </div>

          {/* Current file being processed (optional, truncated) */}
          {injectionProgress.currentFile && (
            <div className="text-xs text-gray-500 truncate mt-0.5">
              {injectionProgress.currentFile}
            </div>
          )}
        </div>
      )}

      {/* Terminal errors */}
      {terminalErrors.length > 0 && (
        <div className="px-2 py-1 border-b border-canopy-border bg-red-900/10 space-y-1 shrink-0">
          {terminalErrors.slice(0, 2).map((error) => (
            <ErrorBanner
              key={error.id}
              error={error}
              onDismiss={dismissError}
              onRetry={handleErrorRetry}
              compact
            />
          ))}
          {terminalErrors.length > 2 && (
            <div className="text-xs text-gray-500 px-2">
              +{terminalErrors.length - 2} more errors
            </div>
          )}
        </div>
      )}

      {/* Terminal Body - Explicit dark bg matches theme */}
      <div className="flex-1 relative min-h-0 bg-[#09090b]">
        <XtermAdapter
          terminalId={id}
          onReady={handleReady}
          onExit={handleExit}
          className="absolute inset-0"
        />
        {/* Artifact Overlay */}
        <ArtifactOverlay terminalId={id} worktreeId={worktreeId} cwd={cwd} />
      </div>
    </div>
  );
}

export default TerminalPane;
