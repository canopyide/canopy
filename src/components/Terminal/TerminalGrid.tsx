import { useMemo, useCallback, useState, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useTerminalStore, useLayoutConfigStore, type TerminalInstance } from "@/store";
import { useContextInjection } from "@/hooks/useContextInjection";
import { useTerminalDragAndDrop } from "@/hooks/useDragAndDrop";
import { TerminalPane } from "./TerminalPane";
import { TerminalGhost } from "./TerminalGhost";
import { FilePickerModal } from "@/components/ContextInjection";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Terminal } from "lucide-react";
import { CanopyIcon, CodexIcon, ClaudeIcon, GeminiIcon } from "@/components/icons";
import { Kbd } from "@/components/ui/Kbd";
import { getBrandColorHex } from "@/lib/colorUtils";
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

function LauncherCard({ title, description, shortcut, icon, onClick, primary }: LauncherCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center text-left p-3 rounded-xl border transition-all duration-200 min-h-[90px]",
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
        <div className="flex w-full items-center justify-between mb-1">
          <h4
            className={cn(
              "font-medium text-base",
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
        <div className="mb-10 flex flex-col items-center text-center">
          <CanopyIcon className="h-16 w-16 text-canopy-accent opacity-50 mb-6" />
          <h3 className="text-2xl font-bold text-canopy-text tracking-tight mb-2">
            Canopy Command Center
          </h3>
          <p className="text-sm text-canopy-text/50 max-w-md leading-relaxed">
            Orchestrate your development workflow with AI agents. Select a runtime to begin.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl mb-8">
          <LauncherCard
            title="Claude Code"
            description="Best for sustained, autonomous refactoring sessions."
            shortcut="Ctrl+Shift+C"
            icon={<ClaudeIcon className="h-5 w-5" brandColor={getBrandColorHex("claude")} />}
            onClick={() => onLaunchAgent("claude")}
            primary
          />
          <LauncherCard
            title="Codex CLI"
            description="Top-tier reasoning depth with context compaction."
            icon={<CodexIcon className="h-5 w-5" brandColor={getBrandColorHex("codex")} />}
            onClick={() => onLaunchAgent("codex")}
            primary
          />
          <LauncherCard
            title="Gemini CLI"
            description="Fast auto-routing and multi-modal image input."
            shortcut="Ctrl+Shift+G"
            icon={<GeminiIcon className="h-5 w-5" brandColor={getBrandColorHex("gemini")} />}
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

        <p className="text-xs text-canopy-text/40 text-center">
          Tip: Press <Kbd>⌘T</Kbd> to open the terminal palette anytime
        </p>
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

  const addTerminal = useTerminalStore((state) => state.addTerminal);
  const trashTerminal = useTerminalStore((state) => state.trashTerminal);
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

  const {
    dragState,
    gridRef,
    createDragStartHandler,
    createDragOverHandler,
    handleDrop,
    handleDragEnd,
  } = useTerminalDragAndDrop();

  // Only need inject/cancel actions - each TerminalPane subscribes to its own progress
  const { inject, cancel } = useContextInjection();

  const [filePickerState, setFilePickerState] = useState<{
    isOpen: boolean;
    worktreeId: string | null;
    terminalId: string | null;
  }>({
    isOpen: false,
    worktreeId: null,
    terminalId: null,
  });

  // Calculate if we need to show placeholder (when dragging over grid)
  const showPlaceholder =
    dragState.isDragging && dragState.dropZone === "grid" && dragState.dropIndex !== null;

  // Use all grid terminals - don't filter. We'll hide the dragged one with CSS instead
  // to prevent unmounting which breaks the drag operation.
  const activeTerminals = gridTerminals;

  // Calculate effective grid count including placeholder
  const effectiveGridCount = activeTerminals.length + (showPlaceholder ? 1 : 0);

  const gridCols = useMemo(() => {
    const count = effectiveGridCount;
    if (count === 0) return 1;

    const { strategy, value } = layoutConfig;

    if (strategy === "fixed-columns") {
      return Math.max(1, Math.min(value, 10));
    }

    if (strategy === "fixed-rows") {
      const rows = Math.max(1, Math.min(value, 10));
      return Math.ceil(count / rows);
    }

    // Automatic (current behavior)
    if (count <= 1) return 1;
    if (count <= 4) return 2;
    return Math.min(Math.ceil(Math.sqrt(count)), 4);
  }, [effectiveGridCount, layoutConfig]);

  const handleLaunchAgent = useCallback(
    async (type: "claude" | "gemini" | "codex" | "shell") => {
      try {
        const cwd = defaultCwd || "";
        const command = type !== "shell" ? type : undefined;
        await addTerminal({ type, cwd, command });
      } catch (error) {
        console.error(`Failed to launch ${type}:`, error);
      }
    },
    [addTerminal, defaultCwd]
  );

  const handleInjectContext = useCallback((terminalId: string, worktreeId?: string) => {
    if (!worktreeId) return;
    setFilePickerState({
      isOpen: true,
      worktreeId,
      terminalId,
    });
  }, []);

  const handleFilePickerConfirm = useCallback(
    async (selectedPaths: string[]) => {
      if (!filePickerState.terminalId || !filePickerState.worktreeId) return;

      setFilePickerState({ isOpen: false, worktreeId: null, terminalId: null });

      await inject(
        filePickerState.worktreeId,
        filePickerState.terminalId,
        selectedPaths.length > 0 ? selectedPaths : undefined
      );
    },
    [filePickerState, inject]
  );

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
            terminalInstanceService.applyRendererPolicy(id, TerminalRefreshTier.VISIBLE);
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

  const handleGridDragOver = createDragOverHandler("grid");

  // Build render items array with placeholder spliced in at dropIndex
  const renderItems = useMemo(() => {
    const items: React.ReactNode[] = activeTerminals.map((terminal: TerminalInstance) => {
      const isTerminalInTrash = isInTrash(terminal.id);
      // Find original index in gridTerminals for drag handler
      const originalIndex = gridTerminals.findIndex((t) => t.id === terminal.id);

      // Check if this specific terminal is the one being dragged from the grid
      const isBeingDragged =
        dragState.isDragging &&
        dragState.sourceLocation === "grid" &&
        dragState.draggedId === terminal.id;

      return (
        <div
          key={terminal.id}
          className={cn(
            "relative h-full",
            // Use fixed positioning to remove from flow (so grid collapses) but keep in DOM (so drag continues)
            // pointer-events-none and z-[-1] ensure it doesn't block interactions while invisible
            isBeingDragged && "fixed top-0 left-0 w-1 h-1 opacity-0 pointer-events-none z-[-1]"
          )}
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
              isDragging={false}
              onDragStart={
                !isTerminalInTrash
                  ? createDragStartHandler(terminal.id, "grid", originalIndex)
                  : undefined
              }
            />
          </ErrorBoundary>
        </div>
      );
    });

    // Insert ghost placeholder at drop index when dragging over grid
    if (showPlaceholder && dragState.dropIndex !== null) {
      items.splice(
        dragState.dropIndex,
        0,
        <div
          key="grid-placeholder"
          className="relative h-full animate-in fade-in zoom-in-95 duration-200"
        >
          <TerminalGhost label="Drop Here" />
        </div>
      );
    }

    return items;
  }, [
    activeTerminals,
    gridTerminals,
    dragState.isDragging,
    dragState.sourceLocation,
    dragState.draggedId,
    dragState.dropIndex,
    showPlaceholder,
    isInTrash,
    focusedId,
    setFocused,
    trashTerminal,
    handleInjectContext,
    cancel,
    toggleMaximize,
    updateTitle,
    moveTerminalToDock,
    createDragStartHandler,
  ]);

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
          </ErrorBoundary>
        </div>
      );
    }
  }

  const isEmpty = gridTerminals.length === 0;

  return (
    <div
      ref={gridRef}
      className={cn("h-full bg-noise p-1", className)}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gridAutoRows: "1fr",
        gap: "4px",
        backgroundColor: "var(--color-grid-bg)",
      }}
      role="grid"
      aria-dropeffect={dragState.isDragging ? "move" : undefined}
      onDragOver={handleGridDragOver}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          handleDragEnd();
        }
      }}
    >
      {isEmpty && !showPlaceholder ? (
        <div className="col-span-full row-span-full">
          <EmptyState onLaunchAgent={handleLaunchAgent} />
        </div>
      ) : (
        renderItems
      )}

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
