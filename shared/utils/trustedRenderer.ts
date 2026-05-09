import { getDevServerOrigins } from "../config/devServer.js";

const PRODUCTION_ORIGINS = ["app://daintree"] as const;

function getTrustedRendererOrigins(): readonly string[] {
  const isDev = process.env.NODE_ENV === "development";
  return isDev ? [...PRODUCTION_ORIGINS, ...getDevServerOrigins()] : PRODUCTION_ORIGINS;
}

function getRendererOrigin(urlString: string): string | null {
  try {
    const url = new URL(urlString);

    if (!url.protocol || !url.host) return null;

    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * Returns true if the renderer URL belongs to a trusted origin
 * (`app://daintree` in production; Vite dev-server origins in development).
 *
 * Trust is origin-scoped, not route-scoped: any path under `app://daintree`
 * passes. The preload blocks contextBridge in sub-frames via a
 * `window.top === window` guard, so `window.electron` is not directly exposed
 * there. A same-origin sub-frame can still reach the parent's `window.electron`
 * via `window.parent` (DOM same-origin access), and `event.senderFrame.url` on
 * the resulting IPC call resolves to the trusted origin. Adding a route beyond
 * `index.html` / `recovery.html` under `app://daintree/` therefore widens the
 * effective IPC trust surface.
 *
 * For route-specific narrowing see {@link isRecoveryPageUrl}.
 */
export function isTrustedRendererUrl(urlString: string): boolean {
  const origin = getRendererOrigin(urlString);
  if (!origin) return false;
  const trustedOrigins = getTrustedRendererOrigins();
  return trustedOrigins.includes(origin as any);
}

export function isRecoveryPageUrl(urlString: string): boolean {
  if (!isTrustedRendererUrl(urlString)) return false;
  try {
    const url = new URL(urlString);
    return url.pathname === "/recovery.html";
  } catch {
    return false;
  }
}

export function getTrustedOrigins(): readonly string[] {
  return getTrustedRendererOrigins();
}
