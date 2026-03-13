// Default terminal font configuration.
// JetBrains Mono is bundled with the application via @fontsource/jetbrains-mono.
// These values are used both for initial xterm creation and for the global
// terminal config hook, so changing them updates the look consistently.

export const DEFAULT_TERMINAL_FONT_FAMILY = '"JetBrains Mono", monospace';

// Slightly smaller than our previous 13px to reduce the number of cells
// on screen and better match VS Code's perceived density/performance.
export const DEFAULT_TERMINAL_FONT_SIZE = 12;

let fontLoadPromise: Promise<void> | null = null;

export function ensureTerminalFontLoaded(): Promise<void> {
  if (fontLoadPromise) return fontLoadPromise;

  if (typeof document === "undefined" || !document.fonts) {
    fontLoadPromise = Promise.resolve();
    return fontLoadPromise;
  }

  const size = `${DEFAULT_TERMINAL_FONT_SIZE}px 'JetBrains Mono'`;
  fontLoadPromise = Promise.all([
    document.fonts.load(size),
    document.fonts.load(`bold ${size}`),
  ]).then(
    () => undefined,
    () => undefined
  );

  return fontLoadPromise;
}
