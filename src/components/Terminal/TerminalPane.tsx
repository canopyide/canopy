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
  onToggleMaximize?: () => void;
  onTitleChange?: (newTitle: string) => void;
  onMinimize?: () => void;
  onRestore?: () => void;
  location?: "grid" | "dock";
  /** Counter incremented on restart to trigger XtermAdapter re-mount */
  restartKey?: number;
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
  onToggleMaximize,
  onTitleChange,
  onMinimize,
  onRestore,
  location = "grid",
  restartKey = 0,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const updateVisibility = useTerminalStore((state) => state.updateVisibility);
  const getTerminal = useTerminalStore((state) => state.getTerminal);
  const restartTerminal = useTerminalStore((state) => state.restartTerminal);

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
        // Notify service for WebGL management
        terminalInstanceService.setVisible(id, entry.isIntersecting);
      },
      {
        threshold: 0.1,
      }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      updateVisibility(id, false);
      terminalInstanceService.setVisible(id, false);
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

  const handleRestart = useCallback(() => {
    restartTerminal(id);
  }, [restartTerminal, id]);

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
            return `Terminal: ${title}`;
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
        isFocused={isFocused}
        isExited={isExited}
        exitCode={exitCode}
        isWorking={isWorking}
        agentState={agentState}
        activity={activity}
        queueCount={queueCount}
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
        onToggleMaximize={onToggleMaximize}
        onTitleChange={onTitleChange}
        onMinimize={onMinimize}
        onRestore={onRestore}
        onRestart={handleRestart}
        isMaximized={isMaximized}
        location={location}
      />

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
          key={`${id}-${restartKey}`}
          terminalId={id}
          terminalType={type}
          onReady={handleReady}
          onExit={handleExit}
          className={cn("absolute", location === "dock" ? "inset-0" : "inset-2")}
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
    prev.restartKey === next.restartKey &&
    prev.onFocus === next.onFocus &&
    prev.onClose === next.onClose &&
    prev.onToggleMaximize === next.onToggleMaximize &&
    prev.onTitleChange === next.onTitleChange &&
    prev.onMinimize === next.onMinimize &&
    prev.onRestore === next.onRestore
  );
});

export default TerminalPane;
