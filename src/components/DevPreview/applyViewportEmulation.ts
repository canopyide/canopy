import type { ViewportPresetId } from "@shared/types/panel";
import { getViewportPreset } from "@/panels/dev-preview/viewportPresets";
import { safeFireAndForget } from "@/utils/safeFireAndForget";

/**
 * Apply (or clear) device emulation on a dev-preview webview so the active
 * viewport preset drives real layout — CSS media queries and window.innerWidth
 * reflect the preset dimensions. emulation runs in the main process via
 * webContents, so it routes through IPC and does NOT persist across
 * cross-origin navigation; callers must re-apply on did-finish-load.
 *
 * Passing no preset disables emulation so the webview returns to its natural
 * dimensions. Pairs with (but does not replace) the setUserAgent override —
 * both are required for complete mobile emulation.
 */
export function applyViewportEmulation(
  webview: Electron.WebviewTag | null,
  panelId: string,
  viewportPreset: ViewportPresetId | undefined
): void {
  if (!webview) return;
  let wcId: number;
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    wcId = (webview as unknown as { getWebContentsId(): number }).getWebContentsId();
  } catch {
    return; // webview detached
  }
  const params = viewportPreset
    ? {
        screenPosition: "mobile" as const,
        width: getViewportPreset(viewportPreset).width,
        height: getViewportPreset(viewportPreset).height,
      }
    : null;
  safeFireAndForget(window.electron.webview.setDeviceEmulation(wcId, panelId, params), {
    context: "Applying dev preview viewport emulation",
  });
}
