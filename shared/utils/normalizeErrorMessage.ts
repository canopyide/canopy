/**
 * Strip volatile suffixes from error messages for dedup comparison.
 * Returns a stable key while leaving the original message intact for display.
 *
 * Conservative patterns only: strips well-known volatile noise (UUIDs,
 * timestamps, git SHAs, port syntax in EADDRINUSE, PID/process suffixes,
 * quoted absolute paths) that signal the same underlying fault arriving
 * with different runtime details.
 */
export function normalizeForDedup(message: string): string {
  let normalized = message;

  // UUID v4 and v1 (36-char hex with dashes)
  normalized = normalized.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ""
  );

  // ISO 8601 timestamps (with optional fractional seconds and timezone)
  normalized = normalized.replace(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g,
    ""
  );

  // Git SHAs (40-char hex)
  normalized = normalized.replace(/\b[0-9a-f]{40}\b/gi, "");

  // 13-digit epoch milliseconds (standalone)
  normalized = normalized.replace(/\b\d{13}\b/g, "");

  // PID/proc suffixes: "pid 12345", "PID: 12345", "process 12345"
  normalized = normalized.replace(/\b(?:pid|process)\s*:?\s*\d+/gi, "");

  // EADDRINUSE trailing port: "EADDRINUSE: address already in use :::3000"
  // Preserve the stable text, strip only the port syntax.
  normalized = normalized.replace(/\b(address already in use)\s*:+\d{1,5}\b/gi, "$1");

  // localhost port: "localhost:3000", "127.0.0.1:4000", "0.0.0.0:8080"
  normalized = normalized.replace(/\b((?:localhost|127\.0\.0\.1|0\.0\.0\.0)):\d{1,5}\b/gi, "$1");

  // Quoted absolute paths: "/Users/.../foo", "C:\Users\...\foo"
  normalized = normalized.replace(/"[A-Za-z]:[/\\][^"]+"/g, '""');
  normalized = normalized.replace(/"\/[^"]+"/g, '""');

  // Collapse multiple spaces from removed fragments
  normalized = normalized.replace(/\s{2,}/g, " ").trim();

  // Fall back to original if normalization emptied the string
  if (!normalized) return message;

  return normalized;
}
