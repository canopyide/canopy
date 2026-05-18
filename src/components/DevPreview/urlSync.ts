/**
 * Decides whether a freshly detected dev-server URL should replace the URL the
 * pane is currently showing, and if so, what URL to navigate to.
 *
 * Returns `false` when no adoption is needed (no detected URL, or the detected
 * URL is the same origin the pane is already on — a port-stable restart).
 *
 * When the dev server restarts on a different origin (typically a port shift,
 * e.g. 3000 → 3001), the detected URL is the bare server root. Navigating to it
 * directly would drop the route the user was on. To preserve it, the current
 * URL's pathname/search/hash are grafted onto the detected origin.
 */
export function computeDevServerUrl(detectedUrl: string, currentUrl: string): string | false {
  if (!detectedUrl) return false;
  if (!currentUrl) return detectedUrl;
  if (detectedUrl === currentUrl) return false;

  let detected: URL;
  let current: URL;
  try {
    detected = new URL(detectedUrl);
    current = new URL(currentUrl);
  } catch {
    // Fall forward to the detected URL if either URL cannot be parsed.
    return detectedUrl;
  }

  if (detected.origin === current.origin) return false;

  // Origin changed (port shift). Graft the user's current route onto the new
  // origin so a dev-server restart doesn't kick them back to the root.
  detected.pathname = current.pathname;
  detected.search = current.search;
  detected.hash = current.hash;
  return detected.toString();
}
