/**
 * Calculates drop index for a linear layout (horizontal dock or vertical list).
 * Uses visual insertion point based on element midpoints.
 * The dragged element should be filtered out before calling this function.
 */
export function calculateDropIndex(
  dragX: number,
  dragY: number,
  elements: HTMLElement[],
  orientation: "horizontal" | "vertical" = "vertical"
): number {
  if (elements.length === 0) return 0;

  // Check if past the last item
  const lastRect = elements[elements.length - 1].getBoundingClientRect();
  if (orientation === "horizontal") {
    if (dragX > lastRect.right) return elements.length;
  } else {
    if (dragY > lastRect.bottom) return elements.length;
  }

  // Scan for insertion point
  for (let i = 0; i < elements.length; i++) {
    const rect = elements[i].getBoundingClientRect();

    if (orientation === "horizontal") {
      const midpoint = rect.left + rect.width / 2;
      if (dragX < midpoint) {
        return i;
      }
    } else {
      const midpoint = rect.top + rect.height / 2;
      if (dragY < midpoint) {
        return i;
      }
    }
  }

  return elements.length;
}

/**
 * Calculates drop index for a Grid layout using reading order (rows then columns).
 * Groups elements into rows based on vertical position, then finds insertion point.
 * The dragged element should be filtered out before calling this function.
 */
export function calculateGridDropIndex(
  dragX: number,
  dragY: number,
  elements: HTMLElement[]
): number {
  if (elements.length === 0) return 0;

  // Group elements into rows based on their top position (with fuzz factor for sub-pixel alignment)
  const ROW_THRESHOLD = 10;
  const rows: HTMLElement[][] = [];
  let currentRow: HTMLElement[] = [];
  let currentTop = elements[0].getBoundingClientRect().top;

  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    if (Math.abs(rect.top - currentTop) > ROW_THRESHOLD) {
      if (currentRow.length > 0) rows.push(currentRow);
      currentRow = [];
      currentTop = rect.top;
    }
    currentRow.push(el);
  }
  if (currentRow.length > 0) rows.push(currentRow);

  // Check if above first row
  const firstRect = elements[0].getBoundingClientRect();
  if (dragY < firstRect.top) return 0;

  // Find the row containing the cursor's Y position
  let targetRowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const rowFirst = rows[i][0].getBoundingClientRect();
    if (dragY <= rowFirst.bottom) {
      targetRowIndex = i;
      break;
    }
  }

  // If below all rows, return length (insert at end)
  if (targetRowIndex === -1) return elements.length;

  // Count items before target row
  let itemsBeforeRow = 0;
  for (let i = 0; i < targetRowIndex; i++) {
    itemsBeforeRow += rows[i].length;
  }

  // Find column position within target row
  const targetRow = rows[targetRowIndex];
  for (let i = 0; i < targetRow.length; i++) {
    const rect = targetRow[i].getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    if (dragX < midpoint) {
      return itemsBeforeRow + i;
    }
  }

  // Past last item in row - insert after it
  return itemsBeforeRow + targetRow.length;
}

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

export function reorderArray<T>(array: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return array;
  if (fromIndex < 0 || fromIndex >= array.length) return array;
  if (toIndex < 0 || toIndex > array.length) return array;

  const result = [...array];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

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

export const TERMINAL_DRAG_MIME_TYPE = "application/x-canopy-terminal";

export interface TerminalDragData {
  terminalId: string;
  sourceLocation: "grid" | "dock";
  sourceIndex: number;
}

export function setTerminalDragData(dataTransfer: DataTransfer, data: TerminalDragData): void {
  dataTransfer.setData(TERMINAL_DRAG_MIME_TYPE, JSON.stringify(data));
  dataTransfer.setData("text/plain", data.terminalId);
  dataTransfer.effectAllowed = "move";
}

export function getTerminalDragData(dataTransfer: DataTransfer): TerminalDragData | null {
  const data = dataTransfer.getData(TERMINAL_DRAG_MIME_TYPE);
  if (!data) return null;

  try {
    return JSON.parse(data) as TerminalDragData;
  } catch {
    return null;
  }
}

export function isTerminalDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(TERMINAL_DRAG_MIME_TYPE);
}

/**
 * Creates a compact drag image "pill" with terminal icon and title.
 * Must be appended to DOM before use, then removed after setDragImage.
 */
export function createTerminalDragImage(title: string, brandColor?: string): HTMLElement {
  const el = document.createElement("div");

  const bgColor = "#18181b";
  const borderColor = "#27272a";
  const textColor = "#e4e4e7";
  const iconColor = brandColor || textColor;

  el.style.cssText = `
    position: absolute;
    top: -1000px;
    left: -1000px;
    padding: 6px 12px;
    background-color: ${bgColor};
    border: 1px solid ${borderColor};
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    color: ${textColor};
    z-index: 9999;
    pointer-events: none;
    white-space: nowrap;
  `;

  const icon = document.createElement("div");
  icon.style.cssText = `
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: ${iconColor};
    flex-shrink: 0;
  `;

  const text = document.createElement("span");
  text.innerText = title.length > 24 ? title.slice(0, 24) + "…" : title;
  text.style.fontWeight = "500";

  el.appendChild(icon);
  el.appendChild(text);

  document.body.appendChild(el);
  return el;
}
