import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTerminalStore } from "@/store";
import { DockedTerminalItem } from "./DockedTerminalItem";
import { TrashContainer } from "./TrashContainer";
import { DropPlaceholder } from "../Terminal/DropPlaceholder";
import { getTerminalDragData, isTerminalDrag, calculateDropIndex } from "@/utils/dragDrop";
import { useTerminalDragAndDrop } from "@/hooks/useDragAndDrop";
import { appClient } from "@/clients";

export function TerminalDock() {
  const dockTerminals = useTerminalStore(
    useShallow((state) => state.terminals.filter((t) => t.location === "dock"))
  );

  const trashedTerminals = useTerminalStore(useShallow((state) => state.trashedTerminals));
  const terminals = useTerminalStore((state) => state.terminals);

  const reorderTerminals = useTerminalStore((s) => s.reorderTerminals);
  const moveTerminalToPosition = useTerminalStore((s) => s.moveTerminalToPosition);
  const setFocused = useTerminalStore((s) => s.setFocused);

  const { beginDrag } = useTerminalDragAndDrop();

  const [isDragOver, setIsDragOver] = useState(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    appClient.getState().then((state) => {
      if (!cancelled && state.dockCollapsed !== undefined) {
        setIsCollapsed(state.dockCollapsed);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleCollapse = useCallback(() => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    appClient.setState({ dockCollapsed: newState });
  }, [isCollapsed]);

  const trashedItems = Array.from(trashedTerminals.values())
    .map((trashed) => ({
      terminal: terminals.find((t) => t.id === trashed.id),
      trashedInfo: trashed,
    }))
    .filter((item) => item.terminal !== undefined) as {
    terminal: (typeof terminals)[0];
    trashedInfo: typeof trashedTerminals extends Map<string, infer V> ? V : never;
  }[];

  const activeDockTerminals = dockTerminals;

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isTerminalDrag(e.dataTransfer)) return;

      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setIsDragOver(true);

      if (isCollapsed) {
        setIsCollapsed(false);
        appClient.setState({ dockCollapsed: false });
      }

      if (dockRef.current) {
        const dockItems = Array.from(
          dockRef.current.querySelectorAll("[data-docked-terminal-id]")
        ) as HTMLElement[];

        const data = getTerminalDragData(e.dataTransfer);
        const sourceIndex = data?.sourceLocation === "dock" ? data.sourceIndex : undefined;

        const index = calculateDropIndex(
          e.clientX,
          e.clientY,
          dockItems,
          "horizontal",
          sourceIndex
        );
        setDropIndex(index);
      }
    },
    [isCollapsed]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
      setDropIndex(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      setDropIndex(null);

      const data = getTerminalDragData(e.dataTransfer);
      if (!data) return;

      const { terminalId, sourceLocation } = data;
      const targetIndex = dropIndex ?? activeDockTerminals.length;

      const fromIndex = dockTerminals.findIndex((t) => t.id === terminalId);
      const targetId = activeDockTerminals[targetIndex]?.id;
      const toIndex = targetId
        ? dockTerminals.findIndex((t) => t.id === targetId)
        : dockTerminals.length;

      if (sourceLocation === "dock") {
        if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
          reorderTerminals(fromIndex, toIndex, "dock");
        }
      } else {
        moveTerminalToPosition(terminalId, toIndex, "dock");
      }

      // Clear focus when moving to dock
      setFocused(null);
    },
    [
      dropIndex,
      activeDockTerminals,
      dockTerminals,
      reorderTerminals,
      moveTerminalToPosition,
      setFocused,
    ]
  );

  const handleDockItemDragStart = useCallback(
    (id: string, index: number) => {
      setDraggedId(id);
      beginDrag(id, "dock", index);
    },
    [beginDrag]
  );

  const handleDockItemDragEnd = useCallback(() => {
    setDraggedId(null);
    setIsDragOver(false);
    setDropIndex(null);
  }, []);

  const isEmpty = activeDockTerminals.length === 0 && trashedItems.length === 0;

  // Build render dock items array with placeholder spliced in at dropIndex
  const renderDockItems = useMemo(() => {
    // Filter out dragged terminal when it's from the dock (creates "lift" effect)
    const visibleDockTerminals = activeDockTerminals.filter((t) =>
      draggedId && draggedId === t.id ? false : true
    );

    const items: React.ReactNode[] = visibleDockTerminals.map((terminal) => {
      // Find original index in activeDockTerminals for drag handler
      const originalIndex = activeDockTerminals.findIndex((t) => t.id === terminal.id);
      return (
        <DockedTerminalItem
          key={terminal.id}
          terminal={terminal}
          index={originalIndex}
          isDragging={false}
          onDragStart={handleDockItemDragStart}
          onDragEnd={handleDockItemDragEnd}
        />
      );
    });

    // Inject placeholder if dragging over dock
    if (isDragOver && dropIndex !== null && dropIndex <= visibleDockTerminals.length) {
      items.splice(
        dropIndex,
        0,
        <div key="dock-placeholder" className="w-32 h-8 flex-shrink-0">
          <DropPlaceholder
            className="h-full w-full p-0 border-canopy-accent/40 bg-canopy-accent/5 rounded"
            label="Drop"
          />
        </div>
      );
    }

    return items;
  }, [
    activeDockTerminals,
    isDragOver,
    dropIndex,
    draggedId,
    handleDockItemDragStart,
    handleDockItemDragEnd,
  ]);

  return (
    <div
      ref={dockRef}
      className={cn(
        "min-h-[40px] bg-canopy-bg/95 backdrop-blur-sm border-t-2 border-canopy-border/60 shadow-[0_-4px_12px_rgba(0,0,0,0.3)]",
        "flex items-center px-4 gap-2",
        "z-40 shrink-0",
        isEmpty && !isDragOver && "h-10",
        isDragOver && "ring-2 ring-canopy-accent/50 ring-inset bg-canopy-accent/5"
      )}
      role="list"
      aria-dropeffect={isDragOver ? "move" : undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-2 overflow-x-auto flex-1 no-scrollbar">
        {(!isEmpty || isDragOver) && (
          <>
            {!isEmpty && (
              <button
                onClick={handleToggleCollapse}
                className={cn(
                  "flex items-center gap-1 text-xs text-canopy-text/60 mr-2 shrink-0 select-none",
                  "hover:text-canopy-text transition-colors rounded px-1 py-0.5",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy-accent"
                )}
                title={isCollapsed ? "Show background terminals" : "Hide background terminals"}
                aria-expanded={!isCollapsed}
              >
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform duration-200",
                    isCollapsed && "-rotate-90"
                  )}
                  aria-hidden="true"
                />
                <span>Background ({activeDockTerminals.length})</span>
              </button>
            )}

            {!isCollapsed && renderDockItems}
          </>
        )}
      </div>

      {/* Separator between sections - only show if both have content and not collapsed */}
      {!isCollapsed && activeDockTerminals.length > 0 && trashedItems.length > 0 && (
        <div className="w-px h-5 bg-canopy-border mx-2 shrink-0" />
      )}

      <div className="shrink-0">
        <TrashContainer trashedTerminals={trashedItems} />
      </div>
    </div>
  );
}
