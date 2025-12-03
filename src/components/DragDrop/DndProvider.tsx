import { useState, useCallback, useMemo, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  useDndMonitor,
  closestCenter,
  rectIntersection,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  type Modifier,
} from "@dnd-kit/core";
import { useTerminalStore, type TerminalInstance } from "@/store";
import { TerminalDragPreview } from "./TerminalDragPreview";

// Cursor offset from top of preview (positions cursor in title bar area)
const TITLE_BAR_CURSOR_OFFSET = 12;

interface DndProviderProps {
  children: React.ReactNode;
}

export interface DragData {
  terminal: TerminalInstance;
  sourceLocation: "grid" | "dock";
  sourceIndex: number;
}

// Helper to get coordinates from pointer or touch event
function getEventCoordinates(event: Event): { x: number; y: number } {
  if ("touches" in event && (event as TouchEvent).touches.length) {
    const touch = (event as TouchEvent).touches[0];
    return { x: touch.clientX, y: touch.clientY };
  }
  const pointerEvent = event as PointerEvent;
  return { x: pointerEvent.clientX, y: pointerEvent.clientY };
}

// Inner component that uses useDndMonitor (must be inside DndContext)
function DragOverlayWithCursorTracking({
  activeTerminal,
}: {
  activeTerminal: TerminalInstance | null;
}) {
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerPositionRef = useRef<{ x: number; y: number } | null>(null);

  useDndMonitor({
    onDragStart({ activatorEvent }) {
      const coords = getEventCoordinates(activatorEvent as Event);
      pointerStartRef.current = coords;
      pointerPositionRef.current = coords;
    },
    onDragMove({ delta }) {
      const start = pointerStartRef.current;
      if (!start) return;
      pointerPositionRef.current = {
        x: start.x + delta.x,
        y: start.y + delta.y,
      };
    },
    onDragEnd() {
      pointerStartRef.current = null;
      pointerPositionRef.current = null;
    },
    onDragCancel() {
      pointerStartRef.current = null;
      pointerPositionRef.current = null;
    },
  });

  // Modifier that positions overlay at cursor position
  const cursorOverlayModifier: Modifier = useCallback(
    ({ transform, overlayNodeRect }) => {
      const cursor = pointerPositionRef.current;
      if (!transform || !overlayNodeRect || !cursor) {
        return transform;
      }

      return {
        ...transform,
        x: cursor.x - overlayNodeRect.left - overlayNodeRect.width / 2,
        y: cursor.y - overlayNodeRect.top - TITLE_BAR_CURSOR_OFFSET,
      };
    },
    []
  );

  return (
    <DragOverlay dropAnimation={null} modifiers={[cursorOverlayModifier]}>
      {activeTerminal ? <TerminalDragPreview terminal={activeTerminal} /> : null}
    </DragOverlay>
  );
}

export function DndProvider({ children }: DndProviderProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeData, setActiveData] = useState<DragData | null>(null);
  const [overContainer, setOverContainer] = useState<"grid" | "dock" | null>(null);

  const terminals = useTerminalStore((state) => state.terminals);
  const reorderTerminals = useTerminalStore((s) => s.reorderTerminals);
  const moveTerminalToPosition = useTerminalStore((s) => s.moveTerminalToPosition);
  const setFocused = useTerminalStore((s) => s.setFocused);

  const activeTerminal = useMemo(() => {
    if (!activeId) return null;
    return terminals.find((t) => t.id === activeId) ?? null;
  }, [activeId, terminals]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);

    const data = active.data.current as DragData | undefined;
    if (data) {
      setActiveData(data);
      setOverContainer(data.sourceLocation);
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (!over) {
      setOverContainer(null);
      return;
    }

    // Check if over a container (grid or dock)
    const overData = over.data.current as { container?: "grid" | "dock" } | undefined;
    if (overData?.container) {
      setOverContainer(overData.container);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      setActiveId(null);
      setActiveData(null);
      setOverContainer(null);

      if (!over || !activeData) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      // Get source and destination info
      const sourceLocation = activeData.sourceLocation;
      const overData = over.data.current as
        | { container?: "grid" | "dock"; index?: number; terminalId?: string }
        | undefined;

      // Determine target container and index
      let targetContainer: "grid" | "dock" = sourceLocation;
      let targetIndex = 0;

      if (overData?.container) {
        targetContainer = overData.container;
        targetIndex = overData.index ?? 0;
      } else if (overData?.terminalId) {
        // Dropped on a terminal item - find its index
        const targetTerminal = terminals.find((t) => t.id === overData.terminalId);
        if (targetTerminal) {
          targetContainer = targetTerminal.location === "dock" ? "dock" : "grid";
          const containerTerminals = terminals.filter((t) =>
            targetContainer === "dock" ? t.location === "dock" : t.location !== "dock"
          );
          targetIndex = containerTerminals.findIndex((t) => t.id === overData.terminalId);
        }
      }

      // Same container reorder
      if (sourceLocation === targetContainer) {
        if (activeId !== overId) {
          const containerTerminals = terminals.filter((t) =>
            targetContainer === "dock" ? t.location === "dock" : t.location !== "dock"
          );
          const oldIndex = containerTerminals.findIndex((t) => t.id === activeId);
          const newIndex = containerTerminals.findIndex((t) => t.id === overId);

          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            reorderTerminals(oldIndex, newIndex, targetContainer);
          }
        }
      } else {
        // Cross-container move
        moveTerminalToPosition(activeId, targetIndex, targetContainer);

        // Set focus when moving to grid, clear when moving to dock
        if (targetContainer === "grid") {
          setFocused(activeId);
        } else {
          setFocused(null);
        }
      }
    },
    [activeData, terminals, reorderTerminals, moveTerminalToPosition, setFocused]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setActiveData(null);
    setOverContainer(null);
  }, []);

  // Use rectIntersection for grid (better for 2D layouts), closestCenter for dock (1D horizontal)
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      // First check if we're directly over any droppable
      const pointerCollisions = pointerWithin(args);
      if (pointerCollisions.length > 0) {
        return pointerCollisions;
      }

      // For grid, use rect intersection; for dock, use closest center
      if (overContainer === "grid") {
        return rectIntersection(args);
      }
      return closestCenter(args);
    },
    [overContainer]
  );

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      collisionDetection={collisionDetection}
    >
      {children}
      <DragOverlayWithCursorTracking activeTerminal={activeTerminal} />
    </DndContext>
  );
}
