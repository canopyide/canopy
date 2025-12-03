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
 * Creates a miniature terminal ghost as the drag image.
 * Looks like a small terminal window with title bar and dark body.
 * Must be appended to DOM before use, then removed after setDragImage.
 */
export function createTerminalDragImage(title: string, brandColor?: string): HTMLElement {
  const container = document.createElement("div");

  const bgColor = "#18181b";
  const borderColor = "#27272a";
  const textColor = "#e4e4e7";
  const iconColor = brandColor || textColor;

  // Outer container - the terminal window
  container.style.cssText = `
    position: absolute;
    top: -1000px;
    left: -1000px;
    width: 160px;
    height: 100px;
    background-color: ${bgColor};
    border: 1px solid ${borderColor};
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    z-index: 9999;
    pointer-events: none;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  `;

  // Title bar
  const titleBar = document.createElement("div");
  titleBar.style.cssText = `
    height: 24px;
    padding: 0 8px;
    background-color: #27272a;
    border-bottom: 1px solid #3f3f46;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  `;

  // Icon dot
  const icon = document.createElement("div");
  icon.style.cssText = `
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: ${iconColor};
    flex-shrink: 0;
  `;

  // Title text
  const text = document.createElement("span");
  text.innerText = title;
  text.style.cssText = `
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    font-weight: 500;
    color: ${textColor};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  `;

  titleBar.appendChild(icon);
  titleBar.appendChild(text);

  // Terminal body (dark area with ghost content)
  const body = document.createElement("div");
  body.style.cssText = `
    flex: 1;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  `;

  // Ghost lines to simulate terminal content
  for (let i = 0; i < 3; i++) {
    const line = document.createElement("div");
    const width = i === 0 ? "70%" : i === 1 ? "50%" : "40%";
    line.style.cssText = `
      height: 6px;
      width: ${width};
      background-color: rgba(255, 255, 255, 0.06);
      border-radius: 2px;
    `;
    body.appendChild(line);
  }

  container.appendChild(titleBar);
  container.appendChild(body);

  document.body.appendChild(container);
  return container;
}
