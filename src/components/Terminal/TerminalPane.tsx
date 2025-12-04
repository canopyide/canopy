import React, { useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import type { TerminalType } from "@/types";
import { cn } from "@/lib/utils";
import { XtermAdapter } from "./XtermAdapter";
import { ArtifactOverlay } from "./ArtifactOverlay";
import { TerminalHeader } from "./TerminalHeader";
import { ErrorBanner } from "../Errors/ErrorBanner";
import { useErrorStore, useTerminalStore, getTerminalRefreshTier } from "@/store";
import { useTerminalLogic } from "@/hooks/useTerminalLogic";
import type { AgentState } from "@/types";
import { terminalInstanceService } from "@/services/TerminalInstanceService";

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
  onClose: (force?: boolean) => void;
  onInjectContext?: () => void;
  onCancelInjection?: () => void;
  onToggleMaximize?: () => void;
  onTitleChange?: (newTitle: string) => void;
  onMinimize?: () => void;
  onRestore?: () => void;
  location?: "grid" | "dock";
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
  onCancelInjection,
  onToggleMaximize,
  onTitleChange,
  onMinimize,
  onRestore,
  location = "grid",
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const updateVisibility = useTerminalStore((state) => state.updateVisibility);
  const getTerminal = useTerminalStore((state) => state.getTerminal);
  const updateTerminalSettings = useTerminalStore((state) => state.updateTerminalSettings);
  const terminal = useTerminalStore((state) => state.terminals.find((t) => t.id === id));

  const queueCount = useTerminalStore(
    useShallow((state) => state.commandQueue.filter((c) => c.terminalId === id).length)
  );

  const terminalErrors = useErrorStore(
    useShallow((state) => state.errors.filter((e) => e.context?.terminalId === id && !e.dismissed))
  );
  const dismissError = useErrorStore((state) => state.dismissError);
  const removeError = useErrorStore((state) => state.removeError);

  const {
    isEditingTitle,
    editingValue,
    titleInputRef,
    setEditingValue,
    handleTitleDoubleClick,
    handleTitleKeyDown,
    handleTitleInputKeyDown,
    handleTitleSave,
    isExited,
    exitCode,
    handleExit,
    handleErrorRetry,
    isInjecting,
    injectionProgress,
  } = useTerminalLogic({
    id,
    title,
    onTitleChange,
    removeError,
  });

  // Visibility observation
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

  const handleClick = useCallback(() => {
    onFocus();
    terminalInstanceService.boostRefreshRate(id);
  }, [onFocus, id]);

  const isWorking = agentState === "working";

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col h-full overflow-hidden transition-all duration-200 group",
        "bg-[var(--color-surface)]",
        location !== "dock" && "rounded border shadow-md",
        location !== "dock" &&
          (isFocused
            ? "terminal-focused border-[color-mix(in_oklab,var(--color-canopy-border)_100%,white_20%)]"
            : "border-canopy-border hover:border-[color-mix(in_oklab,var(--color-canopy-border)_100%,white_10%)]"),
        isExited && "opacity-75 grayscale"
      )}
      onClick={handleClick}
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
    >
      <TerminalHeader
        id={id}
        title={title}
        type={type}
        worktreeId={worktreeId}
        isFocused={isFocused}
        isExited={isExited}
        exitCode={exitCode}
        isWorking={isWorking}
        agentState={agentState}
        activity={activity}
        queueCount={queueCount}
        terminal={terminal}
        isEditingTitle={isEditingTitle}
        editingValue={editingValue}
        titleInputRef={titleInputRef}
        onEditingValueChange={setEditingValue}
        onTitleDoubleClick={handleTitleDoubleClick}
        onTitleKeyDown={handleTitleKeyDown}
        onTitleInputKeyDown={handleTitleInputKeyDown}
        onTitleSave={handleTitleSave}
        onClose={onClose}
        onFocus={onFocus}
        onInjectContext={onInjectContext}
        onToggleMaximize={onToggleMaximize}
        onTitleChange={onTitleChange}
        onMinimize={onMinimize}
        onRestore={onRestore}
        onUpdateSettings={(updates) => updateTerminalSettings(id, updates)}
        isMaximized={isMaximized}
        isInjecting={isInjecting}
        location={location}
      />

      {isInjecting && injectionProgress && (
        <div className="p-2 bg-canopy-sidebar border-t border-canopy-border shrink-0">
          <div className="flex items-center justify-between text-xs text-canopy-text/60 mb-1">
            <span>Injecting Context</span>
            <div className="flex items-center gap-2">
              {onCancelInjection && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelInjection();
                  }}
                  className="px-2 py-0.5 rounded border border-canopy-border hover:border-canopy-accent text-canopy-text/60 hover:text-canopy-text transition-colors"
                >
                  Cancel
                </button>
              )}
              <span>
                {Math.min(100, Math.max(0, Math.round(injectionProgress.progress * 100)))}%
              </span>
            </div>
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
          terminalType={type}
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
    prev.onFocus === next.onFocus &&
    prev.onClose === next.onClose &&
    prev.onInjectContext === next.onInjectContext &&
    prev.onCancelInjection === next.onCancelInjection &&
    prev.onToggleMaximize === next.onToggleMaximize &&
    prev.onTitleChange === next.onTitleChange &&
    prev.onMinimize === next.onMinimize &&
    prev.onRestore === next.onRestore
  );
});

export default TerminalPane;
