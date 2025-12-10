/**
 * URL Styling for terminal output.
 *
 * Links in xterm.js terminals are clickable via WebLinksAddon but not visually styled.
 * CSS cannot style Canvas/WebGL-rendered text, so we inject ANSI escape sequences
 * into the PTY output stream to make URLs blue and underlined.
 *
 * Note: The WebLinksAddon's `linkDecorationOptions` feature is only available in
 * beta versions. This PTY-level approach works with the current stable releases.
 */

// ANSI escape sequences for URL styling
// Using ESC [ syntax for escape codes
const ANSI = {
  BLUE_FG: "\x1b[38;2;56;189;248m", // #38bdf8 (sky-400)
  UNDERLINE_ON: "\x1b[4m",
  UNDERLINE_BLUE: "\x1b[58;2;56;189;248m", // Underline color (SGR 58)
  RESET: "\x1b[0m",
} as const;

// Compiled URL regex for performance
// Conservative pattern to minimize false positives
// eslint-disable-next-line no-useless-escape
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;

// Pattern to detect existing ANSI escape sequences (ESC [)
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_REGEX = /\x1b\[/;

/**
 * Wrap a URL with ANSI escape codes for blue text + underline.
 */
function wrapUrl(url: string): string {
  return `${ANSI.BLUE_FG}${ANSI.UNDERLINE_ON}${ANSI.UNDERLINE_BLUE}${url}${ANSI.RESET}`;
}

/**
 * Style URLs in terminal output with ANSI escape codes.
 *
 * Strategy:
 * - Skip text that already contains ANSI codes (let apps style themselves)
 * - Replace URLs with ANSI-styled versions
 * - Preserve all other text unchanged
 *
 * @param text - Raw terminal output
 * @returns Text with URLs styled via ANSI codes
 */
export function styleUrls(text: string): string {
  // Skip if text already contains ANSI escape codes
  // This preserves styling from applications like `ls --color`
  if (ANSI_ESCAPE_REGEX.test(text)) {
    return text;
  }

  // Replace URLs with styled versions
  return text.replace(URL_REGEX, (url) => wrapUrl(url));
}

/**
 * Check if text contains any URLs.
 * Useful for optimization (skip processing if no URLs present).
 */
export function containsUrl(text: string): boolean {
  URL_REGEX.lastIndex = 0;
  return URL_REGEX.test(text);
}
