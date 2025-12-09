// Default terminal font configuration, aligned with VS Code's integrated
// terminal defaults as closely as possible across platforms.
//
// These values are used both for initial xterm creation and for the global
// terminal config hook, so changing them updates the look consistently.

export const DEFAULT_TERMINAL_FONT_FAMILY = 'Menlo, Monaco, Consolas, "Courier New", monospace';

// Slightly smaller than our previous 13px to reduce the number of cells
// on screen and better match VS Code's perceived density/performance.
export const DEFAULT_TERMINAL_FONT_SIZE = 12;
