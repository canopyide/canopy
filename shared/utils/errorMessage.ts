/**
 * Extract a human-readable message from an unknown caught error, falling back
 * to a caller-supplied domain string for opaque or non-Error values.
 *
 * The fallback is required (no default) so every call site supplies its own
 * operation context — replacing the ad-hoc `err instanceof Error ? err.message
 * : "Unknown error"` ternary that produced uninformative UI copy.
 *
 * Duck-types `{ message: string }` because Electron's structured clone strips
 * the Error prototype across IPC, leaving plain objects that fail
 * `instanceof Error` but still carry the original message.
 */
export function formatErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    try {
      if ("message" in error) {
        const message = (error as { message: unknown }).message;
        if (typeof message === "string") return message;
      }
    } catch {
      // Proxies with throwing `has` traps or accessor errors fall back.
    }
  }
  return fallback;
}
