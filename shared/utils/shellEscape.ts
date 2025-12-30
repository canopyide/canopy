/**
 * Platform detection utilities and shell escaping functions.
 * Provides safe escaping for CLI arguments to prevent shell injection.
 */

/**
 * Detects if the current platform is Windows.
 * Works in both Node.js and browser environments.
 */
export function isWindows(): boolean {
  // Node.js environment
  if (typeof process !== "undefined" && process.platform) {
    return process.platform === "win32";
  }
  // Browser environment - check navigator.userAgent
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    return /\bWindows\b|\bWin(32|64)\b/.test(navigator.userAgent);
  }
  return false;
}

/**
 * Escapes a string for safe use as a shell argument.
 * Uses single quotes on Unix (POSIX) and double quotes on Windows (cmd.exe).
 *
 * @param arg - The string to escape
 * @param platform - Optional platform override ('windows' or 'posix')
 * @returns The escaped string safe for use as a shell argument
 *
 * @example
 * // On Unix/macOS:
 * escapeShellArg("hello world") // "'hello world'"
 * escapeShellArg("it's working") // "'it'\\''s working'"
 *
 * // On Windows:
 * escapeShellArg('say "hello"') // '"say ""hello"""'
 */
export function escapeShellArg(arg: string, platform?: "windows" | "posix"): string {
  // Handle empty strings
  if (arg === "") {
    return platform === "windows" || (platform === undefined && isWindows()) ? '""' : "''";
  }

  const useWindows = platform === "windows" || (platform === undefined && isWindows());

  if (useWindows) {
    return escapeWindowsArg(arg);
  }
  return escapePosixArg(arg);
}

/**
 * Escapes a string for use in Windows cmd.exe.
 * Uses double quotes and escapes internal double quotes by doubling them.
 *
 * Windows cmd.exe rules:
 * - Wrap in double quotes
 * - Escape internal double quotes by doubling them (" → "")
 * - Backslashes before quotes need special handling
 */
function escapeWindowsArg(arg: string): string {
  // Replace double quotes with escaped double quotes
  // Windows uses "" to escape a double quote inside a double-quoted string
  let escaped = arg.replace(/"/g, '""');

  // Handle trailing backslashes which can escape the closing quote
  // Each backslash before the closing quote needs to be doubled
  if (escaped.endsWith("\\")) {
    const match = escaped.match(/\\+$/);
    if (match) {
      escaped = escaped + match[0]; // Double the trailing backslashes
    }
  }

  return `"${escaped}"`;
}

/**
 * Escapes a string for use in POSIX shells (bash, zsh, etc.).
 * Uses single quotes which prevent all interpretation except single quotes themselves.
 *
 * POSIX single quote rules:
 * - Everything inside single quotes is literal
 * - Single quotes themselves cannot be escaped inside single quotes
 * - To include a single quote: end quote, add escaped quote, restart quote
 *   Example: 'it'\''s' (end single quote, escaped single quote, restart)
 */
function escapePosixArg(arg: string): string {
  // Replace single quotes with: end quote, backslash-escaped quote, start quote
  // 'foo'bar' becomes 'foo'\''bar'
  const escaped = arg.replace(/'/g, "'\\''");
  return `'${escaped}'`;
}

/**
 * Checks if a string is safe to use without escaping.
 * Returns true if the string contains only alphanumeric characters,
 * hyphens, underscores, and forward slashes.
 */
export function isSafeUnescaped(arg: string): boolean {
  return /^[a-zA-Z0-9_\-/]+$/.test(arg);
}

/**
 * Escapes a string for shell argument, but returns it unquoted if it's "safe".
 * Use this when you want cleaner output for simple strings.
 */
export function escapeShellArgOptional(arg: string, platform?: "windows" | "posix"): string {
  if (arg === "") {
    return escapeShellArg(arg, platform);
  }
  if (isSafeUnescaped(arg)) {
    return arg;
  }
  return escapeShellArg(arg, platform);
}
