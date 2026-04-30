import type { OnHeadersReceivedListenerDetails } from "electron";
import {
  getDevServerOrigins,
  getDevServerWebSocketOrigins,
} from "../../shared/config/devServer.js";

export type WebviewPartitionType = "browser" | "dev-preview" | "portal" | "project" | "unknown";

/**
 * Checks if a partition is a valid dev-preview partition.
 * Matches exact "persist:dev-preview" or dynamic "persist:dev-preview-*" patterns.
 */
export function isDevPreviewPartition(partition: string): boolean {
  return partition === "persist:dev-preview" || partition.startsWith("persist:dev-preview-");
}

/**
 * Classifies a partition string into its type.
 * Used to apply appropriate CSP policies to different webview partitions.
 */
export function classifyPartition(partition: string): WebviewPartitionType {
  if (partition === "persist:browser") {
    return "browser";
  }
  if (partition === "persist:portal") {
    return "portal";
  }
  if (isDevPreviewPartition(partition)) {
    return "dev-preview";
  }
  if (partition === "persist:daintree" || partition.startsWith("persist:project-")) {
    return "project";
  }
  return "unknown";
}

/**
 * Returns the CSP policy string for localhost-based dev server webviews.
 * Used for dev-preview panels that load localhost content. Browser panels
 * host arbitrary remote sites and intentionally have no CSP overlay applied.
 * Includes https: and wss: for secure localhost dev servers.
 *
 * 'unsafe-inline' is kept in script-src and style-src because dev servers
 * (Vite, Next.js, webpack) inject inline scripts and <style> tags for HMR.
 * 'unsafe-eval' is included because some frameworks (e.g. Next.js 15 with
 * Turbopack/React Server Components) call eval() at runtime, and the CSP is
 * applied at the session level before the framework is known.
 */
export function getLocalhostDevCSP(): string {
  return [
    "default-src 'self' http://localhost:* http://127.0.0.1:* http://[::1]:* https://localhost:* https://127.0.0.1:* https://[::1]:*",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* http://127.0.0.1:* http://[::1]:* https://localhost:* https://127.0.0.1:* https://[::1]:*",
    "style-src 'self' 'unsafe-inline' http://localhost:* http://127.0.0.1:* http://[::1]:* https://localhost:* https://127.0.0.1:* https://[::1]:*",
    "connect-src 'self' ws://localhost:* ws://127.0.0.1:* ws://[::1]:* wss://localhost:* wss://127.0.0.1:* wss://[::1]:* http://localhost:* http://127.0.0.1:* http://[::1]:* https://localhost:* https://127.0.0.1:* https://[::1]:*",
    "img-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:* http://[::1]:* https://localhost:* https://127.0.0.1:* https://[::1]:*",
    "font-src 'self' data:",
    "frame-src 'self' blob: http://localhost:* http://127.0.0.1:* http://[::1]:* https://localhost:* https://127.0.0.1:* https://[::1]:*",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' http://localhost:* http://127.0.0.1:* http://[::1]:* https://localhost:* https://127.0.0.1:* https://[::1]:*",
  ].join("; ");
}

/**
 * Returns the CSP policy for the trusted Daintree app renderer (`persist:daintree`).
 *
 * Defense-in-depth hardening: this CSP applies to the React shell loaded from
 * `app://daintree` (production) or the Vite dev server (development). It does not
 * replace existing security boundaries (preload contextIsolation, navigation guards,
 * IPC sender validation) — it limits the blast radius if any of those fail.
 *
 * Production: strict policy with no `'unsafe-eval'`. `'unsafe-inline'` is kept in
 * `style-src` because Vite still injects inline `<style>` tags for CSS chunk loading.
 *
 * Development: appends Vite dev-server HTTP origins to script/style/connect/img/font,
 * adds WebSocket origins to connect-src for HMR, and re-enables `'unsafe-eval'` +
 * `'unsafe-inline'` in script-src for Vite's HMR runtime + module bootstrap.
 */
export function getDaintreeAppCSP(isDev: boolean): string {
  if (!isDev) {
    return [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "media-src 'self'",
      "worker-src 'self' blob:",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
  }

  const httpOrigins = getDevServerOrigins().join(" ");
  const wsOrigins = getDevServerWebSocketOrigins().join(" ");

  return [
    `default-src 'self' ${httpOrigins}`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${httpOrigins}`,
    `style-src 'self' 'unsafe-inline' ${httpOrigins}`,
    `connect-src 'self' ${httpOrigins} ${wsOrigins}`,
    `img-src 'self' data: blob: ${httpOrigins}`,
    `font-src 'self' data: ${httpOrigins}`,
    "media-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * Merges CSP headers into response headers, replacing any existing CSP header.
 * This prevents multiple conflicting CSP headers from accumulating.
 */
export function mergeCspHeaders(
  details: OnHeadersReceivedListenerDetails,
  cspPolicy: string
): Record<string, string[]> {
  const responseHeaders = { ...details.responseHeaders };

  // Remove any existing CSP headers (case-insensitive)
  const cspKeys = Object.keys(responseHeaders).filter(
    (key) => key.toLowerCase() === "content-security-policy"
  );
  cspKeys.forEach((key) => delete responseHeaders[key]);

  // Add the new CSP header
  responseHeaders["Content-Security-Policy"] = [cspPolicy];

  return responseHeaders;
}
