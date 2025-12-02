import { useState, useCallback, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useTerminalStore } from "@/store";
import { DockedTerminalItem } from "./DockedTerminalItem";
import { TrashContainer } from "./TrashContainer";
import { getTerminalDragData, isTerminalDrag, calculateDropIndex } from "@/utils/dragDrop";
import { useTerminalDragAndDrop } from "@/hooks/useDragAndDrop";

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
  const dockRef = useRef<HTMLDivElement>(null);

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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isTerminalDrag(e.dataTransfer)) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);

    if (dockRef.current) {
      const dockItems = Array.from(
        dockRef.current.querySelectorAll("[data-docked-terminal-id]")
      ) as HTMLElement[];

      const data = getTerminalDragData(e.dataTransfer);
      const sourceIndex = data?.sourceLocation === "dock" ? data.sourceIndex : undefined;

      const index = calculateDropIndex(e.clientX, e.clientY, dockItems, "horizontal", sourceIndex);
      setDropIndex(index);
    }
  }, []);

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

      // Map visual indices (excluding trashed) to full dock order (including trashed)
      const dockOrder = dockTerminals;
      const fromIndex = dockOrder.findIndex((t) => t.id === terminalId);
      const targetId = activeDockTerminals[targetIndex]?.id;
      const toIndex = targetId ? dockOrder.findIndex((t) => t.id === targetId) : dockOrder.length;

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
        {isEmpty ? (
          isDragOver ? (
            <div className="flex-1 flex items-center justify-center text-xs text-canopy-text/40 select-none transition-opacity duration-200 opacity-100">
              Drop terminals here to minimize
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-canopy-text/20 select-none">
              Drag terminals here to minimize
            </div>
          )
        ) : (
          <>
            <span className="text-xs text-canopy-text/60 mr-2 shrink-0 select-none">
              Background ({activeDockTerminals.length})
            </span>

            {activeDockTerminals.map((terminal, index) => (
              <DockedTerminalItem
                key={terminal.id}
                terminal={terminal}
                index={index}
                isDragging={draggedId === terminal.id}
                isDropTarget={dropIndex === index && isDragOver}
                onDragStart={handleDockItemDragStart}
                onDragEnd={handleDockItemDragEnd}
              />
            ))}

            {isDragOver && dropIndex === activeDockTerminals.length && (
              <div className="w-0.5 h-6 bg-canopy-accent rounded shrink-0" />
            )}
          </>
        )}
      </div>

      {/* Separator between sections - only show if both have content */}
      {activeDockTerminals.length > 0 && trashedItems.length > 0 && (
        <div className="w-px h-5 bg-canopy-border mx-2 shrink-0" />
      )}

      <div className="shrink-0">
        <TrashContainer trashedTerminals={trashedItems} />
      </div>
    </div>
  );
}
