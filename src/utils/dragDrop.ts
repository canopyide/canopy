/**
 * Drag-and-Drop Utilities
 *
 * Helper functions for calculating drop positions, detecting drop zones,
 * and reordering arrays during drag-and-drop operations.
 */

/**
 * Calculate the drop index based on drag position over a list of elements.
 * Returns the index where the dragged item should be inserted.
 *
 * @param dragY - The Y coordinate of the drag event (for vertical lists)
 * @param dragX - The X coordinate of the drag event (for horizontal lists)
 * @param elements - Array of DOM elements representing drop targets
 * @param orientation - Whether the list is horizontal or vertical
 * @param currentIndex - Optional current index of the dragged item (for same-list reordering)
 */
export function calculateDropIndex(
  dragX: number,
  dragY: number,
  elements: HTMLElement[],
  orientation: "horizontal" | "vertical" = "vertical",
  currentIndex?: number
): number {
  if (elements.length === 0) return 0;

  for (let i = 0; i < elements.length; i++) {
    const rect = elements[i].getBoundingClientRect();

    if (orientation === "horizontal") {
      const midpoint = rect.left + rect.width / 2;
      if (dragX < midpoint) {
        // If dragging within same list and dropping before current position,
        // account for the fact that removing the item will shift indices
        return currentIndex !== undefined && i > currentIndex ? i - 1 : i;
      }
    } else {
      const midpoint = rect.top + rect.height / 2;
      if (dragY < midpoint) {
        return currentIndex !== undefined && i > currentIndex ? i - 1 : i;
      }
    }
  }

  // Dropped after all elements
  return elements.length;
}

/**
 * Calculate the drop index for a grid layout based on drag position.
 * Uses grid cell positions to determine where to insert.
 *
 * @param dragX - The X coordinate of the drag event
 * @param dragY - The Y coordinate of the drag event
 * @param elements - Array of DOM elements representing grid cells
 * @param currentIndex - Optional current index of the dragged item
 */
export function calculateGridDropIndex(
  dragX: number,
  dragY: number,
  elements: HTMLElement[],
  currentIndex?: number
): number {
  if (elements.length === 0) return 0;

  // Find the element closest to the drag position
  let closestIndex = 0;
  let closestDistance = Infinity;

  for (let i = 0; i < elements.length; i++) {
    const rect = elements[i].getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Calculate distance from drag point to element center
    const distance = Math.sqrt(Math.pow(dragX - centerX, 2) + Math.pow(dragY - centerY, 2));

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = i;
    }
  }

  // Determine if we should insert before or after the closest element
  const closestRect = elements[closestIndex].getBoundingClientRect();
  const isBeforeMidpoint = dragX < closestRect.left + closestRect.width / 2;

  let targetIndex = isBeforeMidpoint ? closestIndex : closestIndex + 1;

  // Adjust for same-list dragging
  if (currentIndex !== undefined && targetIndex > currentIndex) {
    targetIndex--;
  }

  return Math.max(0, Math.min(targetIndex, elements.length));
}

/**
 * Determine which drop zone the drag event is over.
 *
 * @param clientX - Client X coordinate from drag event
 * @param clientY - Client Y coordinate from drag event
 * @param gridElement - The grid container element (or null if not present)
 * @param dockElement - The dock container element (or null if not present)
 */
export function getDropZone(
  clientX: number,
  clientY: number,
  gridElement: HTMLElement | null,
  dockElement: HTMLElement | null
): "grid" | "dock" | null {
  // Check dock first (it's on top at the bottom of the screen)
  if (dockElement) {
    const dockRect = dockElement.getBoundingClientRect();
    if (
      clientX >= dockRect.left &&
      clientX <= dockRect.right &&
      clientY >= dockRect.top &&
      clientY <= dockRect.bottom
    ) {
      return "dock";
    }
  }

  // Check grid
  if (gridElement) {
    const gridRect = gridElement.getBoundingClientRect();
    if (
      clientX >= gridRect.left &&
      clientX <= gridRect.right &&
      clientY >= gridRect.top &&
      clientY <= gridRect.bottom
    ) {
      return "grid";
    }
  }

  return null;
}

/**
 * Reorder an array by moving an item from one index to another.
 * Returns a new array with the item moved.
 *
 * @param array - The source array
 * @param fromIndex - Index of the item to move
 * @param toIndex - Index where the item should be placed
 */
export function reorderArray<T>(array: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return array;
  if (fromIndex < 0 || fromIndex >= array.length) return array;
  if (toIndex < 0 || toIndex > array.length) return array;

  const result = [...array];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

/**
 * Move an item from one array to another at a specific index.
 * Returns both modified arrays.
 *
 * @param sourceArray - The source array to remove from
 * @param targetArray - The target array to insert into
 * @param sourceIndex - Index of the item in the source array
 * @param targetIndex - Index where to insert in the target array
 */
export function moveItemBetweenArrays<T>(
  sourceArray: T[],
  targetArray: T[],
  sourceIndex: number,
  targetIndex: number
): { source: T[]; target: T[] } {
  if (sourceIndex < 0 || sourceIndex >= sourceArray.length) {
    return { source: sourceArray, target: targetArray };
  }

  const newSource = [...sourceArray];
  const [removed] = newSource.splice(sourceIndex, 1);

  const newTarget = [...targetArray];
  newTarget.splice(targetIndex, 0, removed);

  return { source: newSource, target: newTarget };
}

/**
 * MIME type for terminal drag-and-drop operations.
 * Used in dataTransfer to identify terminal drags.
 */
export const TERMINAL_DRAG_MIME_TYPE = "application/x-canopy-terminal";

/**
 * Data structure stored in dataTransfer during terminal drags.
 */
export interface TerminalDragData {
  terminalId: string;
  sourceLocation: "grid" | "dock";
  sourceIndex: number;
}

/**
 * Set terminal drag data in a drag event.
 */
export function setTerminalDragData(
  dataTransfer: DataTransfer,
  data: TerminalDragData
): void {
  dataTransfer.setData(TERMINAL_DRAG_MIME_TYPE, JSON.stringify(data));
  // Also set text/plain for debugging purposes
  dataTransfer.setData("text/plain", data.terminalId);
  dataTransfer.effectAllowed = "move";
}

/**
 * Get terminal drag data from a drag event.
 * Returns null if the drag is not a terminal drag.
 */
export function getTerminalDragData(dataTransfer: DataTransfer): TerminalDragData | null {
  const data = dataTransfer.getData(TERMINAL_DRAG_MIME_TYPE);
  if (!data) return null;

  try {
    return JSON.parse(data) as TerminalDragData;
  } catch {
    return null;
  }
}

/**
 * Check if a drag event contains terminal drag data.
 */
export function isTerminalDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(TERMINAL_DRAG_MIME_TYPE);
}
