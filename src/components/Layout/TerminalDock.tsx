import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTerminalStore } from "@/store";
import { DockedTerminalItem } from "./DockedTerminalItem";
import { TrashContainer } from "./TrashContainer";
import { SortableDockItem } from "@/components/DragDrop";
import { appClient } from "@/clients";

export function TerminalDock() {
  const dockTerminals = useTerminalStore(
    useShallow((state) => state.terminals.filter((t) => t.location === "dock"))
  );

  const trashedTerminals = useTerminalStore(useShallow((state) => state.trashedTerminals));
  const terminals = useTerminalStore((state) => state.terminals);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  // Make the dock a droppable area
  const { setNodeRef, isOver } = useDroppable({
    id: "dock-container",
    data: { container: "dock" },
  });

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

  // Auto-expand when dragging over collapsed dock
  useEffect(() => {
    if (isOver && isCollapsed) {
      setIsCollapsed(false);
      appClient.setState({ dockCollapsed: false });
    }
  }, [isOver, isCollapsed]);

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
  const isEmpty = activeDockTerminals.length === 0 && trashedItems.length === 0;

  // Terminal IDs for SortableContext
  const terminalIds = useMemo(() => activeDockTerminals.map((t) => t.id), [activeDockTerminals]);

  // Combine refs for both dnd-kit and our local ref
  const setRefs = useCallback(
    (element: HTMLDivElement | null) => {
      // Set local ref
      (dockRef as React.MutableRefObject<HTMLDivElement | null>).current = element;
      // Set dnd-kit ref
      setNodeRef(element);
    },
    [setNodeRef]
  );

  return (
    <div
      ref={setRefs}
      className={cn(
        "min-h-[40px] bg-canopy-bg/95 backdrop-blur-sm border-t-2 border-canopy-border/60 shadow-[0_-4px_12px_rgba(0,0,0,0.3)]",
        "flex items-center px-4 gap-2",
        "z-40 shrink-0",
        isEmpty && !isOver && "h-10",
        isOver && "bg-white/[0.03] ring-2 ring-canopy-accent/30 ring-inset"
      )}
      role="list"
    >
      <div className="flex items-center gap-2 overflow-x-auto flex-1 no-scrollbar">
        {(!isEmpty || isOver) && (
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

            {!isCollapsed && (
              <SortableContext items={terminalIds} strategy={horizontalListSortingStrategy}>
                <div className="flex items-center gap-2">
                  {activeDockTerminals.map((terminal, index) => (
                    <SortableDockItem key={terminal.id} terminal={terminal} sourceIndex={index}>
                      <DockedTerminalItem terminal={terminal} />
                    </SortableDockItem>
                  ))}
                </div>
              </SortableContext>
            )}
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
