import { useMemo, useCallback, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import {
  useTerminalStore,
  useLayoutConfigStore,
  useWorktreeSelectionStore,
  type TerminalInstance,
} from "@/store";
import { TerminalPane } from "./TerminalPane";
import { TerminalCountWarning } from "./TerminalCountWarning";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  SortableTerminal,
  useDndPlaceholder,
  GRID_PLACEHOLDER_ID,
  GridPlaceholder,
} from "@/components/DragDrop";
import { Terminal, AlertTriangle } from "lucide-react";
import { CanopyIcon, CodexIcon, ClaudeIcon, GeminiIcon } from "@/components/icons";
import { Kbd } from "@/components/ui/Kbd";
import { getBrandColorHex } from "@/lib/colorUtils";
import { terminalInstanceService } from "@/services/TerminalInstanceService";
import { terminalClient, systemClient } from "@/clients";
import { TerminalRefreshTier } from "@/types";

export interface TerminalGridProps {
  className?: string;
  defaultCwd?: string;
  onLaunchAgent?: (type: "claude" | "gemini" | "codex" | "shell") => Promise<void> | void;
}

interface LauncherCardProps {
  title: string;
  description: string;
  shortcut?: string;
  icon: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}

function LauncherCard({ title, description, shortcut, icon, onClick }: LauncherCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center text-left p-4 rounded-xl border transition-all duration-200 min-h-[100px]",
        "bg-canopy-bg hover:bg-surface",
        "border-canopy-border/20 hover:border-canopy-border/40",
        "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03),inset_0_-1px_0_0_rgba(0,0,0,0.2)]",
        "hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),inset_0_-1px_0_0_rgba(0,0,0,0.3),0_4px_12px_-4px_rgba(0,0,0,0.4)]"
      )}
    >
      <div className="flex items-center justify-center p-2 rounded-lg mr-3 transition-colors">
        {icon}
      </div>

      <div className="flex-1">
        <div className="flex w-full items-center justify-between mb-1">
          <h4 className="font-medium text-base text-canopy-text/80 group-hover:text-canopy-text">
            {title}
          </h4>
          {shortcut && (
            <span className="text-[10px] font-mono text-white/30 border border-white/10 rounded px-1.5 py-0.5 group-hover:text-white/50 group-hover:border-white/20 transition-colors">
              {shortcut}
            </span>
          )}
        </div>
        <p className="text-xs text-canopy-text/60 group-hover:text-canopy-text/80 transition-colors leading-relaxed">
          {description}
        </p>
      </div>
    </button>
  );
}

function EmptyState({
  onLaunchAgent,
  hasActiveWorktree,
}: {
  onLaunchAgent: (type: "claude" | "gemini" | "codex" | "shell") => void;
  hasActiveWorktree: boolean;
}) {
  const handleOpenHelp = () => {
    void systemClient
      .openExternal("https://github.com/gregpriday/canopy-electron#readme")
      .catch((err) => {
        console.error("Failed to open documentation:", err);
      });
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-8 animate-in fade-in duration-500">
      <div className="max-w-3xl w-full flex flex-col items-center">
        <div className="mb-12 flex flex-col items-center text-center">
          <CanopyIcon className="h-20 w-20 text-canopy-accent opacity-25 mb-8" />
          <h3 className="text-2xl font-semibold text-canopy-text tracking-tight mb-3">
            Canopy
          </h3>
          <p className="text-sm text-canopy-text/60 max-w-md leading-relaxed font-medium">
            A habitat for your AI coding agents.
          </p>
        </div>

        {!hasActiveWorktree && (
          <div
            className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2 mb-6 max-w-md text-center"
            role="status"
            aria-live="assertive"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Select a worktree in the sidebar to set the working directory for agents</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl mb-8">
          <LauncherCard
            title="Claude Code"
            description="Great for deep, steady refactors."
            shortcut="Ctrl+Shift+C"
            icon={<ClaudeIcon className="h-5 w-5" brandColor={getBrandColorHex("claude")} />}
            onClick={
              hasActiveWorktree
                ? () => onLaunchAgent("claude")
                : () => {
                    console.warn("Cannot launch agent: no active worktree");
                  }
            }
            primary
          />
          <LauncherCard
            title="Codex CLI"
            description="Good for careful, step-by-step changes."
            icon={<CodexIcon className="h-5 w-5" brandColor={getBrandColorHex("codex")} />}
            onClick={
              hasActiveWorktree
                ? () => onLaunchAgent("codex")
                : () => {
                    console.warn("Cannot launch agent: no active worktree");
                  }
            }
            primary
          />
          <LauncherCard
            title="Gemini CLI"
            description="Ideal for quick explorations and visual tasks."
            shortcut="Ctrl+Shift+G"
            icon={<GeminiIcon className="h-5 w-5" brandColor={getBrandColorHex("gemini")} />}
            onClick={
              hasActiveWorktree
                ? () => onLaunchAgent("gemini")
                : () => {
                    console.warn("Cannot launch agent: no active worktree");
                  }
            }
            primary
          />
          <LauncherCard
            title="Terminal"
            description="Direct terminal access."
            icon={<Terminal className="h-5 w-5" />}
            onClick={
              hasActiveWorktree
                ? () => onLaunchAgent("shell")
                : () => {
                    console.warn("Cannot launch agent: no active worktree");
                  }
            }
          />
        </div>

        <div className="flex flex-col items-center gap-4 mt-4">
          <p className="text-xs text-canopy-text/60 text-center">
            Tip: Press <Kbd>⌘T</Kbd> to open the terminal palette anytime
          </p>

          <button
            type="button"
            onClick={handleOpenHelp}
            className="flex items-center gap-3 p-2 pr-4 rounded-full hover:bg-white/5 transition-all group text-left border border-transparent hover:border-white/5"
          >
            <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-canopy-accent/20 transition-colors">
              <div className="w-0 h-0 border-t-[3px] border-t-transparent border-l-[6px] border-l-white/70 border-b-[3px] border-b-transparent ml-0.5 group-hover:border-l-canopy-accent transition-colors" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-canopy-text/60 group-hover:text-canopy-text transition-colors">
                View documentation
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export function TerminalGrid({ className, defaultCwd, onLaunchAgent }: TerminalGridProps) {
  const { terminals, focusedId, maximizedId } = useTerminalStore(
    useShallow((state) => ({
      terminals: state.terminals,
      focusedId: state.focusedId,
      maximizedId: state.maximizedId,
    }))
  );

  const activeWorktreeId = useWorktreeSelectionStore((state) => state.activeWorktreeId);
  const hasActiveWorktree = activeWorktreeId !== null;

  const addTerminal = useTerminalStore((state) => state.addTerminal);
  const trashTerminal = useTerminalStore((state) => state.trashTerminal);
  const removeTerminal = useTerminalStore((state) => state.removeTerminal);
  const updateTitle = useTerminalStore((state) => state.updateTitle);
  const setFocused = useTerminalStore((state) => state.setFocused);
  const toggleMaximize = useTerminalStore((state) => state.toggleMaximize);
  const moveTerminalToDock = useTerminalStore((state) => state.moveTerminalToDock);
  const isInTrash = useTerminalStore((state) => state.isInTrash);

  const gridTerminals = useMemo(
    () => terminals.filter((t) => t.location === "grid" || t.location === undefined),
    [terminals]
  );

  const layoutConfig = useLayoutConfigStore((state) => state.layoutConfig);

  // Make the grid a droppable area
  const { setNodeRef, isOver } = useDroppable({
    id: "grid-container",
    data: { container: "grid" },
  });

  const gridCols = useMemo(() => {
    const count = gridTerminals.length;
    if (count === 0) return 1;

    const { strategy, value } = layoutConfig;

    if (strategy === "fixed-columns") {
      return Math.max(1, Math.min(value, 10));
    }

    if (strategy === "fixed-rows") {
      const rows = Math.max(1, Math.min(value, 10));
      return Math.ceil(count / rows);
    }

    // Automatic (vertical-first for AI workflows)
    // AI outputs are vertical streams - prioritize pane height over width
    if (count <= 1) return 1;
    if (count <= 3) return count; // 1-3 terminals: single row
    if (count <= 9) return 3; // 4-9 terminals: max 3 columns
    return 4; // 10+ terminals: keep rows <=3 for taller panes
  }, [gridTerminals.length, layoutConfig]);

  const handleLaunchAgent = useCallback(
    async (type: "claude" | "gemini" | "codex" | "shell") => {
      if (onLaunchAgent) {
        try {
          await onLaunchAgent(type);
        } catch (error) {
          console.error(`Failed to launch ${type}:`, error);
        }
        return;
      }

      try {
        const cwd = defaultCwd || "";
        const command = type !== "shell" ? type : undefined;
        await addTerminal({ type, cwd, command });
      } catch (error) {
        console.error(`Failed to launch ${type}:`, error);
      }
    },
    [addTerminal, defaultCwd, onLaunchAgent]
  );

  // Batch-fit visible grid terminals when layout (gridCols/count) changes
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
            terminalInstanceService.applyRendererPolicy(id, TerminalRefreshTier.VISIBLE);
          }
        }
        requestAnimationFrame(processNext);
      };
      processNext();
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridCols, gridTerminals.length]);

  // Get placeholder state from DnD context
  const { placeholderIndex, sourceContainer } = useDndPlaceholder();

  // Show placeholder when dragging from dock to grid
  const showPlaceholder = placeholderIndex !== null && sourceContainer === "dock";

  // Terminal IDs for SortableContext - DON'T include placeholder to avoid infinite loop
  const terminalIds = useMemo(() => gridTerminals.map((t) => t.id), [gridTerminals]);

  // Maximized terminal takes full screen
  if (maximizedId) {
    const terminal = gridTerminals.find((t: TerminalInstance) => t.id === maximizedId);
    if (terminal) {
      return (
        <div className={cn("h-full", className)}>
          <ErrorBoundary
            variant="component"
            componentName="TerminalPane"
            resetKeys={[terminal.id, terminal.worktreeId, terminal.agentState].filter(
              (key): key is string => key !== undefined
            )}
            context={{ terminalId: terminal.id, worktreeId: terminal.worktreeId }}
          >
            <TerminalPane
              id={terminal.id}
              title={terminal.title}
              type={terminal.type}
              worktreeId={terminal.worktreeId}
              cwd={terminal.cwd}
              isFocused={true}
              isMaximized={true}
              agentState={terminal.agentState}
              activity={
                terminal.activityHeadline
                  ? {
                      headline: terminal.activityHeadline,
                      status: terminal.activityStatus ?? "working",
                      type: terminal.activityType ?? "interactive",
                    }
                  : null
              }
              location="grid"
              restartKey={terminal.restartKey}
              onFocus={() => setFocused(terminal.id)}
              onClose={(force) =>
                force ? removeTerminal(terminal.id) : trashTerminal(terminal.id)
              }
              onToggleMaximize={() => toggleMaximize(terminal.id)}
              onTitleChange={(newTitle) => updateTitle(terminal.id, newTitle)}
            />
          </ErrorBoundary>
        </div>
      );
    }
  }

  const isEmpty = gridTerminals.length === 0;

  return (
    <div className={cn("h-full flex flex-col", className)}>
      <TerminalCountWarning className="mx-1 mt-1 shrink-0" />
      <SortableContext id="grid-container" items={terminalIds} strategy={rectSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex-1 min-h-0 bg-noise p-1",
            isOver && "ring-2 ring-canopy-accent/30 ring-inset"
          )}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gridAutoRows: "1fr",
            gap: "4px",
            backgroundColor: "var(--color-grid-bg)",
          }}
          role="grid"
        >
          {isEmpty && !showPlaceholder ? (
            <div className="col-span-full row-span-full">
              <EmptyState onLaunchAgent={handleLaunchAgent} hasActiveWorktree={hasActiveWorktree} />
            </div>
          ) : (
            <>
              {/* Render placeholder at the correct position when dragging from dock */}
              {gridTerminals.map((terminal, index) => {
                const isTerminalInTrash = isInTrash(terminal.id);
                const elements: React.ReactNode[] = [];

                // Insert placeholder before this terminal if needed
                if (showPlaceholder && placeholderIndex === index) {
                  elements.push(<GridPlaceholder key={GRID_PLACEHOLDER_ID} />);
                }

                elements.push(
                  <SortableTerminal
                    key={terminal.id}
                    terminal={terminal}
                    sourceLocation="grid"
                    sourceIndex={index}
                    disabled={isTerminalInTrash}
                  >
                    <ErrorBoundary
                      variant="component"
                      componentName="TerminalPane"
                      resetKeys={[terminal.id, terminal.worktreeId, terminal.agentState].filter(
                        (key): key is string => key !== undefined
                      )}
                      context={{ terminalId: terminal.id, worktreeId: terminal.worktreeId }}
                    >
                      <TerminalPane
                        id={terminal.id}
                        title={terminal.title}
                        type={terminal.type}
                        worktreeId={terminal.worktreeId}
                        cwd={terminal.cwd}
                        isFocused={terminal.id === focusedId}
                        isMaximized={false}
                        agentState={terminal.agentState}
                        activity={
                          terminal.activityHeadline
                            ? {
                                headline: terminal.activityHeadline,
                                status: terminal.activityStatus ?? "working",
                                type: terminal.activityType ?? "interactive",
                              }
                            : null
                        }
                        location="grid"
                        restartKey={terminal.restartKey}
                        onFocus={() => setFocused(terminal.id)}
                        onClose={(force) =>
                          force ? removeTerminal(terminal.id) : trashTerminal(terminal.id)
                        }
                        onToggleMaximize={() => toggleMaximize(terminal.id)}
                        onTitleChange={(newTitle) => updateTitle(terminal.id, newTitle)}
                        onMinimize={() => moveTerminalToDock(terminal.id)}
                      />
                    </ErrorBoundary>
                  </SortableTerminal>
                );

                return elements;
              })}
              {/* Placeholder at end if dropping after all terminals (also handles empty grid) */}
              {showPlaceholder &&
                placeholderIndex !== null &&
                placeholderIndex >= gridTerminals.length && (
                  <GridPlaceholder key={GRID_PLACEHOLDER_ID} />
                )}
            </>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export default TerminalGrid;
