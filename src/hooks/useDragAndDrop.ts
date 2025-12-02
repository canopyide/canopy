/**
 * useTerminalDragAndDrop Hook
 *
 * Provides drag-and-drop state management and handlers for terminal reordering.
 * Supports dragging terminals within the grid, between grid and dock, and within the dock.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTerminalStore } from "@/store";
import {
  setTerminalDragData,
  getTerminalDragData,
  calculateGridDropIndex,
  calculateDropIndex,
} from "@/utils/dragDrop";

export interface DragState {
  /** Whether a drag operation is in progress */
  isDragging: boolean;
  /** ID of the terminal being dragged */
  draggedId: string | null;
  /** Original location of the dragged terminal */
  sourceLocation: "grid" | "dock" | null;
  /** Original index of the dragged terminal */
  sourceIndex: number | null;
  /** Current drop zone being hovered */
  dropZone: "grid" | "dock" | null;
  /** Index where the terminal would be dropped */
  dropIndex: number | null;
}

const initialDragState: DragState = {
  isDragging: false,
  draggedId: null,
  sourceLocation: null,
  sourceIndex: null,
  dropZone: null,
  dropIndex: null,
};

export interface UseTerminalDragAndDropOptions {
  /** Callback when a terminal is moved */
  onTerminalMoved?: (terminalId: string, fromLocation: "grid" | "dock", toLocation: "grid" | "dock", toIndex: number) => void;
}

export interface UseTerminalDragAndDropReturn {
  /** Current drag state */
  dragState: DragState;
  /** Ref for the grid container element */
  gridRef: React.RefObject<HTMLDivElement | null>;
  /** Ref for the dock container element */
  dockRef: React.RefObject<HTMLDivElement | null>;
  /** Manually begin a drag from an external source (e.g., dock item) */
  beginDrag: (id: string, location: "grid" | "dock", index: number) => void;
  /** Create drag start handler for a terminal */
  createDragStartHandler: (id: string, location: "grid" | "dock", index: number) => (e: React.DragEvent) => void;
  /** Create drag over handler for a drop zone */
  createDragOverHandler: (zone: "grid" | "dock") => (e: React.DragEvent) => void;
  /** Handle drop event */
  handleDrop: (e: React.DragEvent) => void;
  /** Handle drag end (cleanup) */
  handleDragEnd: () => void;
  /** Check if a terminal is being dragged */
  isDraggedTerminal: (id: string) => boolean;
  /** Get drop indicator info for rendering */
  getDropIndicator: (zone: "grid" | "dock", index: number) => { showBefore: boolean; showAfter: boolean };
}

export function useTerminalDragAndDrop(
  options: UseTerminalDragAndDropOptions = {}
): UseTerminalDragAndDropReturn {
  const [dragState, setDragState] = useState<DragState>(initialDragState);

  // Store refs for drop zone elements
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);

  // Get store actions
  const reorderTerminals = useTerminalStore((s) => s.reorderTerminals);
  const moveTerminalToPosition = useTerminalStore((s) => s.moveTerminalToPosition);
  const setFocused = useTerminalStore((s) => s.setFocused);

  // Throttle for drag over events - track per-zone to avoid stale drop state when switching zones
  const lastDragOverTime = useRef<{ grid: number; dock: number }>({ grid: 0, dock: 0 });
  const DRAG_OVER_THROTTLE_MS = 50;

  // Manually begin a drag from an external source (e.g., dock item)
  const beginDrag = useCallback(
    (id: string, location: "grid" | "dock", index: number) => {
      setDragState({
        isDragging: true,
        draggedId: id,
        sourceLocation: location,
        sourceIndex: index,
        dropZone: null,
        dropIndex: null,
      });
    },
    []
  );

  // Create drag start handler for a specific terminal
  const createDragStartHandler = useCallback(
    (id: string, location: "grid" | "dock", index: number) =>
      (e: React.DragEvent) => {
        // Set drag data
        setTerminalDragData(e.dataTransfer, {
          terminalId: id,
          sourceLocation: location,
          sourceIndex: index,
        });

        // Set drag image (optional - browser default is usually fine)
        // e.dataTransfer.setDragImage(e.currentTarget, 0, 0);

        beginDrag(id, location, index);
      },
    [beginDrag]
  );

  // Create drag over handler for a drop zone
  const createDragOverHandler = useCallback(
    (zone: "grid" | "dock") =>
      (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        // Throttle updates per-zone to avoid stale drop state when switching zones
        const now = Date.now();
        const previousZone = dragState.dropZone;
        const isZoneChange = previousZone !== null && previousZone !== zone;

        if (!isZoneChange && now - lastDragOverTime.current[zone] < DRAG_OVER_THROTTLE_MS) {
          return;
        }
        lastDragOverTime.current[zone] = now;

        // Calculate drop index based on position
        let dropIndex = 0;
        const containerRef = zone === "grid" ? gridRef : dockRef;

        if (containerRef.current) {
          if (zone === "grid") {
            // For grid, find terminal pane containers
            const terminalElements = Array.from(
              containerRef.current.querySelectorAll("[data-terminal-id]")
            ) as HTMLElement[];

            dropIndex = calculateGridDropIndex(
              e.clientX,
              e.clientY,
              terminalElements,
              dragState.sourceLocation === "grid" ? (dragState.sourceIndex ?? undefined) : undefined
            );
          } else {
            // For dock, find docked terminal buttons (not trashed ones)
            const dockItems = Array.from(
              containerRef.current.querySelectorAll("[data-docked-terminal-id]")
            ) as HTMLElement[];

            dropIndex = calculateDropIndex(
              e.clientX,
              e.clientY,
              dockItems,
              "horizontal",
              dragState.sourceLocation === "dock" ? (dragState.sourceIndex ?? undefined) : undefined
            );
          }
        }

        setDragState((prev) => ({
          ...prev,
          dropZone: zone,
          dropIndex,
        }));
      },
    [dragState.sourceLocation, dragState.sourceIndex]
  );

  // Handle drop event
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      const data = getTerminalDragData(e.dataTransfer);
      if (!data) return;

      const { terminalId, sourceLocation, sourceIndex } = data;
      const { dropZone, dropIndex } = dragState;

      if (!dropZone || dropIndex === null) {
        setDragState(initialDragState);
        return;
      }

      // Perform the move
      if (sourceLocation === dropZone) {
        // Reordering within same location
        if (sourceIndex !== dropIndex) {
          reorderTerminals(sourceIndex, dropIndex, dropZone);
        }
      } else {
        // Moving between locations
        moveTerminalToPosition(terminalId, dropIndex, dropZone);
      }

      // Only set focus if moving to grid (dock moves should clear focus)
      if (dropZone === "grid") {
        setFocused(terminalId);
      }

      // Call optional callback
      options.onTerminalMoved?.(terminalId, sourceLocation, dropZone, dropIndex);

      // Reset drag state
      setDragState(initialDragState);
    },
    [dragState, reorderTerminals, moveTerminalToPosition, setFocused, options]
  );

  // Handle drag end (cleanup)
  const handleDragEnd = useCallback(() => {
    setDragState(initialDragState);
  }, []);

  // Check if a specific terminal is being dragged
  const isDraggedTerminal = useCallback(
    (id: string) => dragState.isDragging && dragState.draggedId === id,
    [dragState.isDragging, dragState.draggedId]
  );

  // Get drop indicator info for rendering
  const getDropIndicator = useCallback(
    (zone: "grid" | "dock", index: number): { showBefore: boolean; showAfter: boolean } => {
      if (!dragState.isDragging || dragState.dropZone !== zone || dragState.dropIndex === null) {
        return { showBefore: false, showAfter: false };
      }

      return {
        showBefore: dragState.dropIndex === index,
        showAfter: false, // We only show the "before" indicator
      };
    },
    [dragState.isDragging, dragState.dropZone, dragState.dropIndex]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setDragState(initialDragState);
    };
  }, []);

  // Memoize the return object to prevent unnecessary re-renders
  return useMemo(
    () => ({
      dragState,
      gridRef,
      dockRef,
      beginDrag,
      createDragStartHandler,
      createDragOverHandler,
      handleDrop,
      handleDragEnd,
      isDraggedTerminal,
      getDropIndicator,
    }),
    [
      dragState,
      beginDrag,
      createDragStartHandler,
      createDragOverHandler,
      handleDrop,
      handleDragEnd,
      isDraggedTerminal,
      getDropIndicator,
    ]
  );
}
