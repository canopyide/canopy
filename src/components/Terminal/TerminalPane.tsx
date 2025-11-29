/**
 * TerminalPane Component
 *
 * Wraps XtermAdapter with a header bar (title, type icon, close button)
 * and a toolbar (inject context button). Supports focus state styling
 * and exit status display.
 *
 * Structure:
 * ┌─────────────────────────────────────────────────┐
 * │ 🖥️ Shell - feature/auth           [📋] [×]     │  <- Header
 * ├─────────────────────────────────────────────────┤
 * │                                                  │
 * │  user@machine:~/project$                        │  <- XtermAdapter
 * │                                                  │
 * └─────────────────────────────────────────────────┘
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Terminal,
  Bot,
  Sparkles,
  Command,
  X,
  Maximize2,
  Minimize2,
  Copy,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { XtermAdapter } from "./XtermAdapter";
import { ArtifactOverlay } from "./ArtifactOverlay";
import { ErrorBanner } from "../Errors/ErrorBanner";
import { useErrorStore, useTerminalStore, type RetryAction } from "@/store";
import type { CopyTreeProgress } from "@/hooks/useContextInjection";
import type { AgentState } from "@/types";

export type TerminalType = "shell" | "claude" | "gemini" | "custom";

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
 * Get terminal icon based on type - Tiling window manager style with Lucide icons
 */
function getTerminalIcon(type: TerminalType, className?: string) {
  const props = { className: cn("w-3.5 h-3.5", className), "aria-hidden": "true" as const };
  switch (type) {
    case "claude":
      return <Bot {...props} />;
    case "gemini":
      return <Sparkles {...props} />;
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
      if (window.electron?.errors?.retry) {
        try {
          await window.electron.errors.retry(errorId, action, args);
          // On successful retry, remove the error from the store
          removeError(errorId);
        } catch (error) {
          console.error("Error retry failed:", error);
          // Retry failed - the main process will send a new error event
        }
      }
    },
    [removeError]
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
          "flex items-center justify-between px-2 h-7 shrink-0 transition-colors", // Fixed low height
          isFocused ? "bg-canopy-sidebar" : "bg-black/20"
        )}
        onDoubleClick={onToggleMaximize}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("shrink-0 opacity-70", isFocused && "text-canopy-accent")}>
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
              className="text-xs font-mono bg-black/40 border border-canopy-accent/50 px-1 h-5 outline-none text-canopy-text"
              aria-label="Edit terminal title"
            />
          ) : (
            <span
              className={cn(
                "text-xs font-mono text-canopy-text/80 truncate select-none",
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
              className="text-[10px] font-mono text-red-400/80 ml-1"
              role="status"
              aria-live="polite"
            >
              [exit {exitCode}]
            </span>
          )}

          {/* Working state spinner */}
          {isAgentWorking && (
            <div
              className="flex items-center gap-1 text-yellow-400 ml-1"
              role="status"
              aria-live="polite"
              aria-label="Agent is working"
            >
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              <span className="text-[10px] font-mono">Working</span>
            </div>
          )}

          {/* Queue count indicator */}
          {queueCount > 0 && (
            <div
              className="text-[10px] font-mono bg-blue-900/60 text-blue-200 px-1.5 py-0.5 rounded ml-1"
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
                "p-1 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent text-canopy-text/60 hover:text-purple-400 transition-colors",
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
              className="p-1 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent text-canopy-text/60 hover:text-canopy-text transition-colors"
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
            className="p-1 hover:bg-red-500/20 focus-visible:bg-red-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 text-canopy-text/60 hover:text-red-400 transition-colors"
            title="Close Terminal (Ctrl+Shift+W)"
            aria-label="Close terminal"
          >
            <X className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Context injection progress - minimal style */}
      {isInjecting && injectionProgress && (
        <div className="h-0.5 w-full bg-canopy-border relative overflow-hidden shrink-0">
          <div
            className="absolute top-0 left-0 h-full bg-purple-500 transition-all duration-200"
            style={{ width: `${injectionProgress.progress * 100}%` }}
          />
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
        <ArtifactOverlay
          terminalId={id}
          worktreeId={worktreeId}
          cwd={cwd}
        />
      </div>
    </div>
  );
}

export default TerminalPane;
