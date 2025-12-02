import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTerminalStore } from "@/store";
import {
  setTerminalDragData,
  getTerminalDragData,
  calculateGridDropIndex,
  calculateDropIndex,
} from "@/utils/dragDrop";

export interface DragState {
  isDragging: boolean;
  draggedId: string | null;
  sourceLocation: "grid" | "dock" | null;
  sourceIndex: number | null;
  dropZone: "grid" | "dock" | null;
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
  onTerminalMoved?: (
    terminalId: string,
    fromLocation: "grid" | "dock",
    toLocation: "grid" | "dock",
    toIndex: number
  ) => void;
}

export interface UseTerminalDragAndDropReturn {
  dragState: DragState;
  gridRef: React.RefObject<HTMLDivElement | null>;
  dockRef: React.RefObject<HTMLDivElement | null>;
  beginDrag: (id: string, location: "grid" | "dock", index: number) => void;
  createDragStartHandler: (
    id: string,
    location: "grid" | "dock",
    index: number
  ) => (e: React.DragEvent) => void;
  createDragOverHandler: (zone: "grid" | "dock") => (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleDragEnd: () => void;
  isDraggedTerminal: (id: string) => boolean;
  getDropIndicator: (
    zone: "grid" | "dock",
    index: number
  ) => { showBefore: boolean; showAfter: boolean };
}

export function useTerminalDragAndDrop(
  options: UseTerminalDragAndDropOptions = {}
): UseTerminalDragAndDropReturn {
  const [dragState, setDragState] = useState<DragState>(initialDragState);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);

  const reorderTerminals = useTerminalStore((s) => s.reorderTerminals);
  const moveTerminalToPosition = useTerminalStore((s) => s.moveTerminalToPosition);
  const setFocused = useTerminalStore((s) => s.setFocused);

  // Track per-zone to avoid stale drop state when switching zones
  const lastDragOverTime = useRef<{ grid: number; dock: number }>({ grid: 0, dock: 0 });
  const DRAG_OVER_THROTTLE_MS = 50;

  const beginDrag = useCallback((id: string, location: "grid" | "dock", index: number) => {
    setDragState({
      isDragging: true,
      draggedId: id,
      sourceLocation: location,
      sourceIndex: index,
      dropZone: null,
      dropIndex: null,
    });
  }, []);

  const createDragStartHandler = useCallback(
    (id: string, location: "grid" | "dock", index: number) => (e: React.DragEvent) => {
      setTerminalDragData(e.dataTransfer, {
        terminalId: id,
        sourceLocation: location,
        sourceIndex: index,
      });

      beginDrag(id, location, index);
    },
    [beginDrag]
  );

  const createDragOverHandler = useCallback(
    (zone: "grid" | "dock") => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      const now = Date.now();
      const previousZone = dragState.dropZone;
      const isZoneChange = previousZone !== null && previousZone !== zone;

      if (!isZoneChange && now - lastDragOverTime.current[zone] < DRAG_OVER_THROTTLE_MS) {
        return;
      }
      lastDragOverTime.current[zone] = now;

      let dropIndex = 0;
      const containerRef = zone === "grid" ? gridRef : dockRef;

      if (containerRef.current) {
        if (zone === "grid") {
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
    [dragState.sourceLocation, dragState.sourceIndex, dragState.dropZone]
  );

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

      if (sourceLocation === dropZone) {
        if (sourceIndex !== dropIndex) {
          reorderTerminals(sourceIndex, dropIndex, dropZone);
        }
      } else {
        moveTerminalToPosition(terminalId, dropIndex, dropZone);
      }

      // Only set focus if moving to grid (dock moves should clear focus)
      if (dropZone === "grid") {
        setFocused(terminalId);
      }

      options.onTerminalMoved?.(terminalId, sourceLocation, dropZone, dropIndex);

      setDragState(initialDragState);
    },
    [dragState, reorderTerminals, moveTerminalToPosition, setFocused, options]
  );

  const handleDragEnd = useCallback(() => {
    setDragState(initialDragState);
  }, []);

  const isDraggedTerminal = useCallback(
    (id: string) => dragState.isDragging && dragState.draggedId === id,
    [dragState.isDragging, dragState.draggedId]
  );

  const getDropIndicator = useCallback(
    (zone: "grid" | "dock", index: number): { showBefore: boolean; showAfter: boolean } => {
      if (!dragState.isDragging || dragState.dropZone !== zone || dragState.dropIndex === null) {
        return { showBefore: false, showAfter: false };
      }

      return {
        showBefore: dragState.dropIndex === index,
        showAfter: false,
      };
    },
    [dragState.isDragging, dragState.dropZone, dragState.dropIndex]
  );

  useEffect(() => {
    return () => {
      setDragState(initialDragState);
    };
  }, []);

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
