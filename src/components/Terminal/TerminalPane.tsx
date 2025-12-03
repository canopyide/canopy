import React, { useState, useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Terminal,
  Command,
  X,
  Maximize2,
  Minimize2,
  Copy,
  ArrowDownToLine,
  Loader2,
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
import type { TerminalType } from "@/types";
import { cn } from "@/lib/utils";
import { getBrandColorHex } from "@/lib/colorUtils";
import { XtermAdapter } from "./XtermAdapter";
import { ArtifactOverlay } from "./ArtifactOverlay";
import { StateBadge } from "./StateBadge";
import { ActivityBadge } from "./ActivityBadge";
import { ErrorBanner } from "../Errors/ErrorBanner";
import { useErrorStore, useTerminalStore, getTerminalRefreshTier, type RetryAction } from "@/store";
import { useContextInjection } from "@/hooks/useContextInjection";
import type { AgentState } from "@/types";
import { errorsClient } from "@/clients";
import { createTerminalDragImage } from "@/utils/dragDrop";

export type { TerminalType };

export interface ActivityState {
  headline: string;
  status: "working" | "waiting" | "success" | "failure";
  type: "interactive" | "background" | "idle";
}

export interface TerminalPaneProps {
  id: string;
  title: string;
  type: TerminalType;
  worktreeId?: string;
  cwd: string;
  isFocused: boolean;
  isMaximized?: boolean;
  agentState?: AgentState;
  activity?: ActivityState | null;
  onFocus: () => void;
  onClose: () => void;
  onInjectContext?: () => void;
  onCancelInjection?: () => void;
  onToggleMaximize?: () => void;
  onTitleChange?: (newTitle: string) => void;
  onMinimize?: () => void;
  onRestore?: () => void;
  location?: "grid" | "dock";
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}

interface TerminalIconProps {
  className?: string;
  brandColor?: string;
}

function getTerminalIcon(type: TerminalType, props: TerminalIconProps) {
  const finalProps = {
    className: cn("w-3.5 h-3.5", props.className),
    "aria-hidden": "true" as const,
  };

  const customIconProps = { ...finalProps, brandColor: props.brandColor };

  switch (type) {
    case "claude":
      return <ClaudeIcon {...customIconProps} />;
    case "gemini":
      return <GeminiIcon {...customIconProps} />;
    case "codex":
      return <CodexIcon {...customIconProps} />;
    case "npm":
      return <NpmIcon {...finalProps} />;
    case "yarn":
      return <YarnIcon {...finalProps} />;
    case "pnpm":
      return <PnpmIcon {...finalProps} />;
    case "bun":
      return <BunIcon {...finalProps} />;
    case "custom":
      return <Command {...finalProps} />;
    case "shell":
    default:
      return <Terminal {...finalProps} />;
  }
}

function TerminalPaneComponent({
  id,
  title,
  type,
  worktreeId,
  cwd,
  isFocused,
  isMaximized,
  agentState,
  activity,
  onFocus,
  onClose,
  onInjectContext,
  onCancelInjection: _onCancelInjection,
  onToggleMaximize,
  onTitleChange,
  onMinimize,
  onRestore,
  location = "grid",
  isDragging,
  onDragStart,
}: TerminalPaneProps) {
  const [isExited, setIsExited] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingValue, setEditingValue] = useState(title);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Subscribe to injection progress for this terminal only
  const { inject, isInjecting, progress: injectionProgress } = useContextInjection(id);

  const updateVisibility = useTerminalStore((state) => state.updateVisibility);
  const getTerminal = useTerminalStore((state) => state.getTerminal);

  const queueCount = useTerminalStore(
    useShallow((state) => state.commandQueue.filter((c) => c.terminalId === id).length)
  );

  const terminalErrors = useErrorStore(
    useShallow((state) => state.errors.filter((e) => e.context?.terminalId === id && !e.dismissed))
  );
  const dismissError = useErrorStore((state) => state.dismissError);
  const removeError = useErrorStore((state) => state.removeError);

  const handleErrorRetry = useCallback(
    async (errorId: string, action: RetryAction, args?: Record<string, unknown>) => {
      try {
        if (action === "injectContext") {
          const worktreeIdArg = args?.worktreeId as string | undefined;
          const terminalIdArg = args?.terminalId as string | undefined;
          const selectedPaths = args?.selectedPaths as string[] | undefined;

          if (!worktreeIdArg || !terminalIdArg) {
            console.error("Missing worktreeId or terminalId for injectContext retry");
            return;
          }

          await inject(worktreeIdArg, terminalIdArg, selectedPaths);
          removeError(errorId);
        } else {
          await errorsClient.retry(errorId, action, args);
          removeError(errorId);
        }
      } catch (error) {
        console.error("Error retry failed:", error);
      }
    },
    [inject, removeError]
  );

  useEffect(() => {
    setIsExited(false);
    setExitCode(null);
  }, [id]);

  useEffect(() => {
    if (!isEditingTitle) {
      setEditingValue(title);
    }
  }, [title, isEditingTitle]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        updateVisibility(id, entry.isIntersecting);
      },
      {
        threshold: 0.1,
      }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      updateVisibility(id, false);
    };
  }, [id, updateVisibility]);

  const handleTitleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
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
    if (!isEditingTitle) return;
    setIsEditingTitle(false);
    if (onTitleChange) {
      onTitleChange(editingValue);
    }
  }, [isEditingTitle, editingValue, onTitleChange]);

  const handleTitleCancel = useCallback(() => {
    setIsEditingTitle(false);
    setEditingValue(title);
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

  const handleReady = useCallback(() => {}, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        return;
      }

      if (target.tagName === "BUTTON" || target !== e.currentTarget) {
        return;
      }

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onFocus();
      }
    },
    [onFocus]
  );

  const getRefreshTierCallback = useCallback(() => {
    const terminal = getTerminal(id);
    return getTerminalRefreshTier(terminal, isFocused);
  }, [id, isFocused, getTerminal]);

  const canDrag = !isMaximized && !!onDragStart;
  const isWorking = agentState === "working";

  const handleDragStartWithImage = useCallback(
    (e: React.DragEvent) => {
      if (!onDragStart) return;

      const brandColor = getBrandColorHex(type);
      const dragImage = createTerminalDragImage(title, brandColor);
      // Offset to position cursor near top-left of the mini terminal (on title bar)
      e.dataTransfer.setDragImage(dragImage, 20, 12);

      setTimeout(() => {
        document.body.removeChild(dragImage);
      }, 0);

      onDragStart(e);
    },
    [onDragStart, title, type]
  );

  return (
    <div
      ref={containerRef}
      data-terminal-id={id}
      className={cn(
        "flex flex-col h-full overflow-hidden transition-all duration-200 group",
        "bg-[var(--color-surface)]",

        // Only apply border, rounding, and shadow if NOT in the dock (prevents double-border glitch)
        location !== "dock" && "rounded border shadow-md",

        // Apply focus styles only if NOT docked
        location !== "dock" &&
          (isFocused
            ? "terminal-focused border-[color-mix(in_oklab,var(--color-canopy-border)_100%,white_20%)]"
            : "border-canopy-border hover:border-[color-mix(in_oklab,var(--color-canopy-border)_100%,white_10%)]"),

        isExited && "opacity-75 grayscale",
        isDragging && "opacity-50 ring-2 ring-canopy-accent"
      )}
      onClick={onFocus}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="group"
      aria-label={(() => {
        switch (type) {
          case "shell":
            return `Shell terminal: ${title}`;
          case "claude":
            return `Claude agent: ${title}`;
          case "gemini":
            return `Gemini agent: ${title}`;
          case "codex":
            return `Codex agent: ${title}`;
          case "npm":
            return `NPM runner: ${title}`;
          case "yarn":
            return `Yarn runner: ${title}`;
          case "pnpm":
            return `PNPM runner: ${title}`;
          case "bun":
            return `Bun runner: ${title}`;
          default:
            return `${type} session: ${title}`;
        }
      })()}
      aria-grabbed={isDragging || undefined}
    >
      {/* Header - Uniform background for all terminal types */}
      <div
        className={cn(
          "flex items-center justify-between px-3 h-7 shrink-0 font-mono text-xs transition-colors relative overflow-hidden",
          // Base background - uniform for all types
          isFocused ? "bg-[var(--color-surface-highlight)]" : "bg-[var(--color-surface)]",
          // Drag cursor styles
          canDrag && "cursor-grab active:cursor-grabbing"
        )}
        onDoubleClick={onToggleMaximize}
        draggable={canDrag}
        onDragStart={canDrag ? handleDragStartWithImage : undefined}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 flex items-center justify-center w-3.5 h-3.5 text-canopy-text">
            {isWorking ? (
              <Loader2
                className="w-3.5 h-3.5 animate-spin"
                style={{ color: getBrandColorHex(type) }}
                aria-hidden="true"
              />
            ) : (
              getTerminalIcon(type, { brandColor: getBrandColorHex(type) })
            )}
          </span>

          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onKeyDown={handleTitleInputKeyDown}
              onBlur={handleTitleSave}
              className="text-sm font-medium bg-canopy-bg/60 border border-canopy-accent/50 px-1 h-5 min-w-32 outline-none text-canopy-text select-text"
              aria-label={type === "shell" ? "Edit shell title" : "Edit agent title"}
            />
          ) : (
            <span
              className={cn(
                isFocused ? "text-canopy-text" : "text-canopy-text/70",
                "font-medium truncate select-none",
                onTitleChange && "cursor-text hover:text-canopy-text"
              )}
              onDoubleClick={handleTitleDoubleClick}
              onKeyDown={handleTitleKeyDown}
              tabIndex={onTitleChange ? 0 : undefined}
              role={onTitleChange ? "button" : undefined}
              title={onTitleChange ? `${title} — Double-click or press Enter to edit` : title}
              aria-label={
                onTitleChange
                  ? type === "shell"
                    ? `Shell title: ${title}. Press Enter or F2 to edit`
                    : `Agent title: ${title}. Press Enter or F2 to edit`
                  : undefined
              }
            >
              {title}
            </span>
          )}

          {isExited && (
            <span
              className="text-xs font-mono text-[var(--color-status-error)] ml-1"
              role="status"
              aria-live="polite"
            >
              [exit {exitCode}]
            </span>
          )}

          {/* Show state badge for completed/failed states (working state uses spinner instead) */}
          {agentState &&
            agentState !== "idle" &&
            agentState !== "waiting" &&
            agentState !== "working" && <StateBadge state={agentState} className="ml-2" />}

          {/* Show activity headline when available and not in terminal state */}
          {activity &&
            activity.headline &&
            agentState !== "failed" &&
            agentState !== "completed" && (
              <ActivityBadge
                headline={activity.headline}
                status={activity.status}
                type={activity.type}
                className="ml-2"
              />
            )}

          {queueCount > 0 && (
            <div
              className="text-xs font-mono bg-canopy-accent/15 text-canopy-text px-1.5 py-0.5 rounded ml-1"
              role="status"
              aria-live="polite"
              title={`${queueCount} command${queueCount > 1 ? "s" : ""} queued`}
            >
              {queueCount} queued
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {worktreeId && onInjectContext && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInjectContext();
              }}
              className={cn(
                "p-1.5 hover:bg-canopy-text/10 focus-visible:bg-canopy-text/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent text-canopy-text/60 hover:text-[var(--color-state-working)] transition-colors",
                isInjecting && "opacity-50 cursor-not-allowed"
              )}
              title="Inject Context (Ctrl+Shift+I)"
              aria-label="Inject worktree context"
              disabled={isExited || isInjecting}
            >
              <Copy className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
          {location === "grid" && onMinimize && !isMaximized && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMinimize();
              }}
              className="p-1.5 hover:bg-canopy-text/10 focus-visible:bg-canopy-text/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent text-canopy-text/60 hover:text-canopy-text transition-colors"
              title="Minimize to dock"
              aria-label="Minimize to dock"
            >
              <ArrowDownToLine className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
          {location === "dock" && onRestore && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRestore();
              }}
              className="p-1.5 hover:bg-canopy-text/10 focus-visible:bg-canopy-text/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent text-canopy-text/60 hover:text-canopy-text transition-colors"
              title="Restore to grid"
              aria-label="Restore to grid"
            >
              <Maximize2 className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
          {onToggleMaximize && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFocus();
                onToggleMaximize();
              }}
              className="p-1.5 hover:bg-canopy-text/10 focus-visible:bg-canopy-text/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent text-canopy-text/60 hover:text-canopy-text transition-colors"
              title={isMaximized ? "Restore (Ctrl+Shift+F)" : "Maximize (Ctrl+Shift+F)"}
              aria-label={isMaximized ? "Restore" : "Maximize"}
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
            className="p-1.5 hover:bg-[color-mix(in_oklab,var(--color-status-error)_15%,transparent)] focus-visible:bg-[color-mix(in_oklab,var(--color-status-error)_15%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-status-error)] text-canopy-text/60 hover:text-[var(--color-status-error)] transition-colors"
            title="Close Session (Ctrl+Shift+W)"
            aria-label="Close session"
          >
            <X className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {isInjecting && injectionProgress && (
        <div className="p-2 bg-canopy-sidebar border-t border-canopy-border shrink-0">
          <div className="flex items-center justify-between text-xs text-canopy-text/60 mb-1">
            <span>Injecting Context</span>
            <span>{Math.min(100, Math.max(0, Math.round(injectionProgress.progress * 100)))}%</span>
          </div>

          <div className="w-full h-2 bg-canopy-border rounded-full overflow-hidden mb-1">
            <div
              className="h-full bg-canopy-accent transition-all duration-200"
              style={{
                width: `${Math.min(100, Math.max(0, injectionProgress.progress * 100))}%`,
              }}
            />
          </div>

          <div className="text-xs text-canopy-text/60">
            {(() => {
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

          {injectionProgress.currentFile && (
            <div className="text-xs text-canopy-text/40 truncate mt-0.5">
              {injectionProgress.currentFile}
            </div>
          )}
        </div>
      )}

      {terminalErrors.length > 0 && (
        <div className="px-2 py-1 border-b border-canopy-border bg-[color-mix(in_oklab,var(--color-status-error)_5%,transparent)] space-y-1 shrink-0">
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
            <div className="text-xs text-canopy-text/40 px-2">
              +{terminalErrors.length - 2} more errors
            </div>
          )}
        </div>
      )}

      <div className="flex-1 relative min-h-0 bg-canopy-bg">
        <XtermAdapter
          terminalId={id}
          onReady={handleReady}
          onExit={handleExit}
          className="absolute inset-2"
          getRefreshTier={getRefreshTierCallback}
        />
        <ArtifactOverlay terminalId={id} worktreeId={worktreeId} cwd={cwd} />
      </div>
    </div>
  );
}

export const TerminalPane = React.memo(TerminalPaneComponent, (prev, next) => {
  return (
    prev.id === next.id &&
    prev.title === next.title &&
    prev.type === next.type &&
    prev.worktreeId === next.worktreeId &&
    prev.cwd === next.cwd &&
    prev.isFocused === next.isFocused &&
    prev.isMaximized === next.isMaximized &&
    prev.agentState === next.agentState &&
    prev.activity?.headline === next.activity?.headline &&
    prev.activity?.status === next.activity?.status &&
    prev.activity?.type === next.activity?.type &&
    prev.location === next.location &&
    prev.isDragging === next.isDragging &&
    prev.onFocus === next.onFocus &&
    prev.onClose === next.onClose &&
    prev.onInjectContext === next.onInjectContext &&
    prev.onCancelInjection === next.onCancelInjection &&
    prev.onToggleMaximize === next.onToggleMaximize &&
    prev.onTitleChange === next.onTitleChange &&
    prev.onMinimize === next.onMinimize &&
    prev.onRestore === next.onRestore &&
    prev.onDragStart === next.onDragStart
  );
});

export default TerminalPane;
