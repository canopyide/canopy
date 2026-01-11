import { useCallback, useEffect, useState, useRef } from "react";
import { ContentPanel, type BasePanelProps } from "@/components/Panel";
import { cn } from "@/lib/utils";
import { useProjectStore, useTerminalStore } from "@/store";
import { panelKindKeepsAliveOnProjectSwitch } from "@shared/config/panelKindRegistry";
import type { DevPreviewStatus } from "@shared/types/ipc/devPreview";
import { DevPreviewToolbar } from "./DevPreviewToolbar";
import { Button } from "@/components/ui/button";
import { useIsDragging } from "@/components/DragDrop";

const STATUS_STYLES: Record<DevPreviewStatus, { label: string; dot: string; text: string }> = {
  installing: {
    label: "Installing",
    dot: "bg-[var(--color-status-warning)]",
    text: "text-[var(--color-status-warning)]",
  },
  starting: {
    label: "Starting",
    dot: "bg-[var(--color-status-info)]",
    text: "text-[var(--color-status-info)]",
  },
  running: {
    label: "Running",
    dot: "bg-[var(--color-status-success)]",
    text: "text-[var(--color-status-success)]",
  },
  error: {
    label: "Error",
    dot: "bg-[var(--color-status-error)]",
    text: "text-[var(--color-status-error)]",
  },
  stopped: {
    label: "Stopped",
    dot: "bg-canopy-text/40",
    text: "text-canopy-text/50",
  },
};

const AUTO_RELOAD_MAX_ATTEMPTS = 3;
const AUTO_RELOAD_INITIAL_DELAY_MS = 1500;
const AUTO_RELOAD_RETRY_DELAY_MS = 800;
const AUTO_RELOAD_WINDOW_MS = 15000;
const AUTO_RELOAD_ERROR_CODES = new Set([-102, -105, -106, -118]);

export interface DevPreviewPaneProps extends BasePanelProps {
  cwd: string;
}

export function DevPreviewPane({
  id,
  title,
  cwd,
  isFocused,
  isMaximized = false,
  location = "grid",
  onFocus,
  onClose,
  onToggleMaximize,
  onTitleChange,
  onMinimize,
  onRestore,
  isTrashing = false,
  gridPanelCount,
}: DevPreviewPaneProps) {
  const [status, setStatus] = useState<DevPreviewStatus>("starting");
  const [message, setMessage] = useState("Starting dev server...");
  const [error, setError] = useState<string | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isBrowserOnly, setIsBrowserOnly] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const webviewRef = useRef<Electron.WebviewTag>(null);
  const pendingUrlRef = useRef<string | null>(null);
  const autoReloadAttemptsRef = useRef(0);
  const autoReloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUrlSetAtRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const isDragging = useIsDragging();
  const [webviewLoadError, setWebviewLoadError] = useState<string | null>(null);
  const setBrowserUrl = useTerminalStore((state) => state.setBrowserUrl);

  const clearAutoReload = useCallback(() => {
    if (autoReloadTimeoutRef.current) {
      clearTimeout(autoReloadTimeoutRef.current);
      autoReloadTimeoutRef.current = null;
    }
  }, []);

  const scheduleAutoReload = useCallback(
    (delayMs: number) => {
      if (!url) return;
      if (autoReloadTimeoutRef.current) return;
      if (autoReloadAttemptsRef.current >= AUTO_RELOAD_MAX_ATTEMPTS) return;
      const lastUrlSetAt = lastUrlSetAtRef.current || Date.now();
      if (Date.now() - lastUrlSetAt > AUTO_RELOAD_WINDOW_MS) return;
      if (hasLoadedRef.current) return;

      autoReloadTimeoutRef.current = setTimeout(() => {
        autoReloadTimeoutRef.current = null;
        if (!url || hasLoadedRef.current) return;
        const webview = webviewRef.current;
        if (!webview) return;
        autoReloadAttemptsRef.current += 1;
        webview.loadURL(url);
      }, delayMs);
    },
    [url]
  );

  useEffect(() => {
    const offStatus = window.electron.devPreview.onStatus((payload) => {
      if (payload.panelId !== id) return;
      setStatus(payload.status);
      setMessage(payload.message);
      setError(payload.status === "error" ? (payload.error ?? payload.message) : undefined);
      // Derive browser-only mode from the status message (non-sticky)
      setIsBrowserOnly(payload.message.includes("Browser-only mode"));
      // Clear restarting state when we receive a terminal status (server responded)
      if (
        payload.status === "running" ||
        payload.status === "error" ||
        payload.status === "stopped"
      ) {
        setIsRestarting(false);
        if (restartTimeoutRef.current) {
          clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = null;
        }
      }
      if (payload.status === "error" || payload.status === "stopped") {
        clearAutoReload();
      }
    });

    const offUrl = window.electron.devPreview.onUrl((payload) => {
      if (payload.panelId !== id) return;
      setUrl(payload.url);
      setWebviewLoadError(null);
    });

    return () => {
      offStatus();
      offUrl();
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      clearAutoReload();
    };
  }, [id, clearAutoReload]);

  // Set up webview event listeners for loading/error feedback
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !url) return;

    const handleDidFailLoad = (event: Electron.DidFailLoadEvent) => {
      // Ignore aborted loads and cancellations
      if (event.errorCode === -3 || event.errorCode === -6) return;
      hasLoadedRef.current = false;
      setHasLoaded(false);
      const isRetryable = AUTO_RELOAD_ERROR_CODES.has(event.errorCode);
      if (isRetryable && autoReloadAttemptsRef.current < AUTO_RELOAD_MAX_ATTEMPTS) {
        const delay = AUTO_RELOAD_RETRY_DELAY_MS * (autoReloadAttemptsRef.current + 1);
        scheduleAutoReload(delay);
        return;
      }
      setWebviewLoadError(
        event.errorDescription || "Failed to load dev server. Check if the server is running."
      );
    };

    const handleDidStartLoading = () => {
      setWebviewLoadError(null);
      hasLoadedRef.current = false;
      setHasLoaded(false);
    };

    const handleDidStopLoading = () => {
      hasLoadedRef.current = true;
      autoReloadAttemptsRef.current = 0;
      clearAutoReload();
      setHasLoaded(true);
    };

    webview.addEventListener("did-fail-load", handleDidFailLoad);
    webview.addEventListener("did-start-loading", handleDidStartLoading);
    webview.addEventListener("did-stop-loading", handleDidStopLoading);

    return () => {
      webview.removeEventListener("did-fail-load", handleDidFailLoad);
      webview.removeEventListener("did-start-loading", handleDidStartLoading);
      webview.removeEventListener("did-stop-loading", handleDidStopLoading);
    };
  }, [url, scheduleAutoReload, clearAutoReload]);

  // Sync URL changes to store for restoration across project switches
  useEffect(() => {
    if (!url) return;
    setBrowserUrl(id, url);
  }, [id, url, setBrowserUrl]);

  useEffect(() => {
    if (!url) return;
    hasLoadedRef.current = false;
    setHasLoaded(false);
    autoReloadAttemptsRef.current = 0;
    lastUrlSetAtRef.current = Date.now();
    clearAutoReload();
    scheduleAutoReload(AUTO_RELOAD_INITIAL_DELAY_MS);
  }, [url, clearAutoReload, scheduleAutoReload]);

  useEffect(() => {
    if (!isBrowserOnly || url || !pendingUrlRef.current) return;
    setUrl(pendingUrlRef.current);
  }, [isBrowserOnly, url]);

  useEffect(() => {
    setUrl(null);
    setError(undefined);
    setStatus("starting");
    setMessage("Starting dev server...");
    setIsRestarting(false);
    setIsBrowserOnly(false);
    setManualUrl("");
    hasLoadedRef.current = false;
    setHasLoaded(false);
    autoReloadAttemptsRef.current = 0;
    clearAutoReload();
    pendingUrlRef.current = null;
    setWebviewLoadError(null);
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    const terminal = useTerminalStore.getState().getTerminal(id);
    const cols = terminal?.cols ?? 80;
    const rows = terminal?.rows ?? 24;
    const devCommand = terminal?.devCommand;
    const savedUrl = terminal?.browserUrl ?? null;

    if (savedUrl) {
      pendingUrlRef.current = savedUrl;
      setManualUrl(savedUrl);
    }

    void window.electron.devPreview.start(id, cwd, cols, rows, devCommand);

    return () => {
      if (
        useProjectStore.getState().isSwitching &&
        panelKindKeepsAliveOnProjectSwitch("dev-preview")
      ) {
        return;
      }
      void window.electron.devPreview.stop(id);
    };
  }, [id, cwd, clearAutoReload]);

  const handleRestart = useCallback(() => {
    setUrl(null);
    setError(undefined);
    setStatus("starting");
    setMessage("Restarting dev server...");
    setIsRestarting(true);
    hasLoadedRef.current = false;
    setHasLoaded(false);
    autoReloadAttemptsRef.current = 0;
    clearAutoReload();
    setWebviewLoadError(null);
    // Clear restarting after 10 seconds as a fallback
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
    }
    restartTimeoutRef.current = setTimeout(() => {
      setIsRestarting(false);
    }, 10000);
    void window.electron.devPreview.restart(id);
  }, [id, clearAutoReload]);

  const handleManualUrlSubmit = useCallback(() => {
    const trimmedUrl = manualUrl.trim();
    if (!trimmedUrl) return;
    // Ensure URL has a protocol and validate
    let normalizedUrl = trimmedUrl;
    if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
      normalizedUrl = `http://${trimmedUrl}`;
    }
    // Validate URL structure
    try {
      new URL(normalizedUrl);
    } catch {
      return; // Invalid URL, silently reject
    }
    setUrl(normalizedUrl);
    setHasLoaded(false);
    setWebviewLoadError(null);
    // Also notify the backend in case it needs to track the URL
    void window.electron.devPreview.setUrl(id, normalizedUrl);
  }, [id, manualUrl]);

  const statusStyle = STATUS_STYLES[status];
  const showLoadingOverlay = Boolean(url) && !hasLoaded && !webviewLoadError;
  const loadingMessage =
    status === "starting" || status === "installing" ? message : "Loading preview...";

  const devPreviewToolbar = (
    <DevPreviewToolbar
      status={status}
      url={url}
      isRestarting={isRestarting}
      onRestart={handleRestart}
    />
  );

  return (
    <ContentPanel
      id={id}
      title={title}
      kind="dev-preview"
      isFocused={isFocused}
      isMaximized={isMaximized}
      location={location}
      isTrashing={isTrashing}
      gridPanelCount={gridPanelCount}
      onFocus={onFocus}
      onClose={onClose}
      onToggleMaximize={onToggleMaximize}
      onTitleChange={onTitleChange}
      onMinimize={onMinimize}
      onRestore={onRestore}
      onRestart={handleRestart}
      toolbar={devPreviewToolbar}
    >
      <div className="flex flex-1 min-h-0 flex-col">
        <div className="relative flex-1 min-h-0 bg-white">
          {url ? (
            <>
              {isDragging && <div className="absolute inset-0 z-10 bg-transparent" />}
              {showLoadingOverlay && (
                <div className="absolute inset-0 flex items-center justify-center bg-canopy-bg z-10">
                  <div className="text-center max-w-md space-y-1 px-4">
                    <div className="text-sm font-medium text-canopy-text">Dev Preview</div>
                    <div className="text-xs text-canopy-text/60">{loadingMessage}</div>
                  </div>
                </div>
              )}
              {webviewLoadError && (
                <div className="absolute inset-0 flex items-center justify-center bg-canopy-bg z-10">
                  <div className="text-center max-w-md space-y-2 px-4">
                    <div className="text-sm font-medium text-[var(--color-status-error)]">
                      Webview Load Error
                    </div>
                    <div className="text-xs text-canopy-text/60">{webviewLoadError}</div>
                  </div>
                </div>
              )}
              <webview
                ref={webviewRef}
                src={url}
                partition="persist:dev-preview"
                className={cn(
                  "w-full h-full border-0",
                  isDragging && "invisible pointer-events-none"
                )}
              />
            </>
          ) : isBrowserOnly ? (
            <div className="absolute inset-0 flex items-center justify-center bg-canopy-bg">
              <div className="text-center max-w-md space-y-4 px-4">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-canopy-text">Browser-Only Mode</div>
                  <div className="text-xs text-canopy-text/60">
                    No dev command configured. Enter a URL to preview.
                  </div>
                  {error && <div className="text-xs text-[var(--color-status-error)]">{error}</div>}
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleManualUrlSubmit()}
                    placeholder="http://localhost:3000"
                    className="flex-1 px-3 py-2 bg-canopy-sidebar border border-canopy-border rounded text-sm text-canopy-text focus:outline-none focus:ring-2 focus:ring-canopy-accent"
                  />
                  <Button onClick={handleManualUrlSubmit} disabled={!manualUrl.trim()}>
                    Go
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-canopy-bg">
              <div className="text-center max-w-md space-y-1 px-4">
                <div className="text-sm font-medium text-canopy-text">Dev Preview</div>
                <div className="text-xs text-canopy-text/60">{message}</div>
                {error && <div className="text-xs text-[var(--color-status-error)]">{error}</div>}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-t border-canopy-border bg-[color-mix(in_oklab,var(--color-surface)_92%,transparent)] text-xs text-canopy-text/70">
          <div className="flex items-center gap-2 min-w-0" role="status" aria-live="polite">
            <span className={cn("h-2 w-2 rounded-full shrink-0", statusStyle.dot)} />
            <span className={cn("font-medium", statusStyle.text)}>{statusStyle.label}</span>
            <span className="truncate">{message}</span>
          </div>
          {url && <span className="font-mono text-canopy-text/50 truncate max-w-[45%]">{url}</span>}
        </div>
      </div>
    </ContentPanel>
  );
}
