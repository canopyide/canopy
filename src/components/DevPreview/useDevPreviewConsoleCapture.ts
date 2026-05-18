import { useEffect } from "react";
import { useConsoleCaptureStore } from "@/store/consoleCaptureStore";
import { usePanelStore } from "@/store";
import { logError } from "@/utils/logger";

/**
 * Wires the main-process CDP console-capture pipeline to the renderer
 * `consoleCaptureStore` for a single dev-preview panel.
 *
 * Capture starts only while the webview is mounted and ready
 * (`isWebviewReady && !isEvicted`) and stops on unmount or eviction. The
 * webview DOM node is unmounted while evicted, so the webContentsId is
 * re-derived from the ref each time the effect re-runs rather than cached.
 *
 * Both IPC subscriptions filter by `paneId`: `onConsoleMessage` is a global
 * stream keyed by `row.paneId`, so an unfiltered handler in multiple mounted
 * panes would duplicate every row.
 */
export function useDevPreviewConsoleCapture(
  paneId: string,
  webviewRef: React.RefObject<Electron.WebviewTag | null>,
  isWebviewReady: boolean,
  isEvicted: boolean
): void {
  useEffect(() => {
    if (!isWebviewReady || isEvicted) return;

    const webview = webviewRef.current;
    if (!webview) return;

    let webContentsId: number;
    try {
      webContentsId = webview.getWebContentsId();
    } catch {
      // WebContents not attached yet — the next ready/evicted transition retries.
      return;
    }

    // Chain stop after start settles so a fast ready→evict cycle can't let a
    // slow startConsoleCapture resolve after cleanup already fired, which
    // would leave a CDP session attached with nothing to detach it.
    const started = window.electron.webview
      .startConsoleCapture(webContentsId, paneId)
      .catch((err) => {
        logError("[DevPreviewConsoleCapture] startConsoleCapture failed", err);
      });

    const store = useConsoleCaptureStore.getState();

    const offMessage = window.electron.webview.onConsoleMessage((row) => {
      if (row.paneId !== paneId) return;
      store.addStructuredMessage(row);
    });

    const offCleared = window.electron.webview.onConsoleContextCleared(
      ({ paneId: clearedPaneId, navigationGeneration }) => {
        if (clearedPaneId !== paneId) return;
        store.markStale(paneId, navigationGeneration);
      }
    );

    return () => {
      offMessage();
      offCleared();
      void started.finally(() => {
        void window.electron.webview.stopConsoleCapture(webContentsId, paneId).catch((err) => {
          logError("[DevPreviewConsoleCapture] stopConsoleCapture failed", err);
        });
      });
    };
  }, [paneId, webviewRef, isWebviewReady, isEvicted]);

  // Drop this pane's buffered rows + counts only when the panel is gone for
  // good. Unmount alone is not deletion: a DevPreview panel in a grid tab
  // group fully unmounts when another tab is activated, and we must keep its
  // captured rows so they survive a tab switch. By cleanup time a deleted
  // panel is already absent from the panel registry, so its absence is the
  // signal that this is a real teardown rather than a deactivation.
  useEffect(() => {
    return () => {
      if (!usePanelStore.getState().panelsById?.[paneId]) {
        useConsoleCaptureStore.getState().removePane(paneId);
      }
    };
  }, [paneId]);
}
