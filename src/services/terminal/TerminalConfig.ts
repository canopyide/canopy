import { Terminal } from "@xterm/xterm";

export const MEASURE_ELEMENT_ID = "terminal-measure-element";

/**
 * Measure cell height using a hidden element in the DOM.
 * This ensures we get the exact pixel height xterm will use.
 */
export function measureCellHeight(terminal: Terminal): number {
  if (terminal.element) {
    // If terminal is already mounted, try to measure a row directly
    const row = terminal.element.querySelector(".xterm-rows > div");
    if (row) {
      return row.getBoundingClientRect().height;
    }
  }

  // Fallback: create a temporary element with the same styling
  const div = document.createElement("div");
  div.id = MEASURE_ELEMENT_ID;
  div.style.position = "absolute";
  div.style.top = "-9999px";
  div.style.left = "-9999px";
  div.style.fontFamily = terminal.options.fontFamily || "monospace";
  div.style.fontSize = `${terminal.options.fontSize || 14}px`;
  div.style.lineHeight = `${terminal.options.lineHeight || 1.1}`;
  div.style.whiteSpace = "pre";
  div.textContent = "M"; // Use a tall character

  document.body.appendChild(div);
  const height = div.getBoundingClientRect().height;
  document.body.removeChild(div);

  return height;
}
