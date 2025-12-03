/**
 * Calculates drop index for a linear layout (horizontal dock or vertical list).
 * PRIORITIZES DIRECT INTERSECTION - if mouse is over an element, that's the target.
 * The dragged element should be filtered out before calling this function.
 */
export function calculateDropIndex(
  dragX: number,
  dragY: number,
  elements: HTMLElement[],
  orientation: "horizontal" | "vertical" = "vertical"
): number {
  if (elements.length === 0) return 0;

  // 1. Direct intersection check (highest priority)
  for (let i = 0; i < elements.length; i++) {
    const rect = elements[i].getBoundingClientRect();
    if (dragX >= rect.left && dragX <= rect.right && dragY >= rect.top && dragY <= rect.bottom) {
      // Use midpoint to determine before/after within the intersected element
      const midpoint =
        orientation === "horizontal" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
      const pos = orientation === "horizontal" ? dragX : dragY;
      return pos < midpoint ? i : i + 1;
    }
  }

  // 2. Check if past the last item
  const lastRect = elements[elements.length - 1].getBoundingClientRect();
  if (orientation === "horizontal") {
    if (dragX > lastRect.right) return elements.length;
  } else {
    if (dragY > lastRect.bottom) return elements.length;
  }

  // 3. Find closest element by center distance (for gaps between items)
  let closestIndex = 0;
  let minDistance = Infinity;

  for (let i = 0; i < elements.length; i++) {
    const rect = elements[i].getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dist = Math.hypot(dragX - centerX, dragY - centerY);

    if (dist < minDistance) {
      minDistance = dist;
      closestIndex = i;
    }
  }

  return closestIndex;
}

/**
 * Calculates drop index for a Grid layout.
 * STRICT GEOMETRY: The cell under the mouse is the target index (highest priority).
 * The dragged element should be filtered out before calling this function.
 */
export function calculateGridDropIndex(
  dragX: number,
  dragY: number,
  elements: HTMLElement[]
): number {
  if (elements.length === 0) return 0;

  // 1. Direct intersection check (highest priority)
  // If the mouse is physically inside a terminal's box, that IS the drop index.
  for (let i = 0; i < elements.length; i++) {
    const rect = elements[i].getBoundingClientRect();
    if (dragX >= rect.left && dragX <= rect.right && dragY >= rect.top && dragY <= rect.bottom) {
      return i;
    }
  }

  // 2. Proximity check (for gaps between grid cells)
  // Find the element with the closest center point to the cursor
  let closestIndex = 0;
  let minDistance = Infinity;

  for (let i = 0; i < elements.length; i++) {
    const rect = elements[i].getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dist = (dragX - centerX) ** 2 + (dragY - centerY) ** 2;

    if (dist < minDistance) {
      minDistance = dist;
      closestIndex = i;
    }
  }

  // 3. Edge case: Appending after last item
  // If cursor is significantly past the last item, append to end
  if (closestIndex === elements.length - 1) {
    const lastRect = elements[elements.length - 1].getBoundingClientRect();
    const lastCenterX = lastRect.left + lastRect.width / 2;
    const lastCenterY = lastRect.top + lastRect.height / 2;

    // If below and to the right of last item's center, append
    if (dragY > lastCenterY && dragX > lastCenterX) {
      return elements.length;
    }
    // If significantly below the last row
    if (dragY > lastRect.bottom) {
      return elements.length;
    }
  }

  return closestIndex;
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
