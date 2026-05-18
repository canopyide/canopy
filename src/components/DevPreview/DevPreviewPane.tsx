import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useBrowserActionListeners } from "@/hooks/useBrowserActionListeners";
import {
  AlertTriangle,
  RotateCw,
  ExternalLink,
  Settings,
  Square,
  WandSparkles,
  OctagonAlert,
} from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/button";
import { usePanelStore } from "@/store";
import { useProjectStore } from "@/store/projectStore";
import { useProjectSettingsStore } from "@/store/projectSettingsStore";
import type { BrowserHistory } from "@shared/types/browser";
import { ContentPanel, type BasePanelProps } from "@/components/Panel";
import { BrowserToolbar } from "../Browser/BrowserToolbar";
import { InlineStatusBanner, type BannerAction } from "../Terminal/InlineStatusBanner";
import { normalizeBrowserUrl } from "../Browser/browserUtils";
import {
  goBackBrowserHistory,
  goForwardBrowserHistory,
  initializeBrowserHistory,
  pushBrowserHistory,
} from "../Browser/historyUtils";
import { useDevServer, type UseDevServerReturn } from "@/hooks/useDevServer";
import { ConsoleDrawer } from "./ConsoleDrawer";
import { useDevPreviewConsoleCapture } from "./useDevPreviewConsoleCapture";
import { useIsDragging } from "@/components/DragDrop";
import { cn } from "@/lib/utils";
import { computeDevServerUrl } from "./urlSync";
import { findDevServerCandidate } from "@/utils/devServerDetection";
import { useProjectSettings } from "@/hooks/useProjectSettings";
import { projectClient } from "@/clients";
import { actionService } from "@/services/ActionService";
import type { ActionId } from "@shared/types/actions";
import { useWebviewThrottle } from "@/hooks/useWebviewThrottle";
import { useHasBeenVisible } from "@/hooks/useHasBeenVisible";
import { useWebviewEviction } from "@/hooks/useWebviewEviction";
import { useDeferredLoading } from "@/hooks/useDeferredLoading";
import { UI_DOHERTY_THRESHOLD } from "@/lib/animationUtils";
import { useWebviewDialog } from "@/hooks/useWebviewDialog";
import { WebviewDialog } from "../Browser/WebviewDialog";
import { FindBar } from "../Browser/FindBar";
import { useFindInPage } from "@/hooks/useFindInPage";
import { safeFireAndForget } from "@/utils/safeFireAndForget";
import {
  getViewportPreset,
  getEffectiveViewportSize,
  computeFitScale,
} from "@/panels/dev-preview/viewportPresets";
import type { ViewportPresetId } from "@shared/types/panel";
import { logError } from "@/utils/logger";
import { loadWebviewUrl } from "./loadWebviewUrl";
import {
  useDevPreviewLoadLifecycle,
  type DevPreviewBlockedNav,
  type SessionStorageEntry,
} from "./useDevPreviewLoadLifecycle";

import { looksLikeOAuthUrl } from "@shared/utils/urlUtils";

async function captureWebviewSessionStorage(
  webviewElement: Electron.WebviewTag | null
): Promise<SessionStorageEntry[]> {
  if (!webviewElement) return [];

  try {
    const snapshot = await webviewElement.executeJavaScript(
      `(() => {
        try {
          return Object.entries(sessionStorage).filter(
            (entry) =>
              Array.isArray(entry) &&
              entry.length === 2 &&
              typeof entry[0] === "string" &&
              typeof entry[1] === "string"
          );
        } catch {
          return [];
        }
      })()`
    );

    if (!Array.isArray(snapshot)) return [];
    return snapshot.filter(
      (entry): entry is SessionStorageEntry =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === "string" &&
        typeof entry[1] === "string"
    );
  } catch {
    return [];
  }
}

function BlockedNavBanner({
  blockedNav,
  panelId,
  webviewElement,
  onDismiss,
}: {
  blockedNav: {
    url: string;
    canOpenExternal: boolean;
    sessionStorageSnapshot: SessionStorageEntry[];
  };
  panelId: string;
  webviewElement: Electron.WebviewTag | null;
  onDismiss: () => void;
}) {
  const isOAuth = looksLikeOAuthUrl(blockedNav.url);
  const hostname = (() => {
    try {
      return new URL(blockedNav.url).hostname;
    } catch {
      return blockedNav.url;
    }
  })();

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-status-warning/10 border-b border-status-warning/20 text-daintree-text/80">
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-status-warning" />
      <span className="truncate flex-1">Navigation to external site blocked: {hostname}</span>
      {isOAuth ? (
        <button
          type="button"
          onClick={async () => {
            const url = blockedNav.url;
            onDismiss();
            // Get webContentsId for CDP interception of the token exchange
            let wcId: number | undefined;
            try {
              wcId = (
                webviewElement as unknown as { getWebContentsId(): number }
              )?.getWebContentsId();
            } catch {
              /* webview not ready */
            }
            if (wcId != null) {
              try {
                await window.electron.webview.startOAuthLoopback(
                  url,
                  panelId,
                  wcId,
                  blockedNav.sessionStorageSnapshot
                );
              } catch {
                // OAuth loopback may fail if the webview is gone or CDP setup
                // breaks; silently fall through — the dialog has been dismissed.
              }
            }
          }}
          className="shrink-0 px-2 py-0.5 rounded text-xs bg-status-warning/20 hover:bg-status-warning/30 text-daintree-text/90 transition-colors"
        >
          Sign in via browser
        </button>
      ) : blockedNav.canOpenExternal ? (
        <button
          type="button"
          onClick={() => {
            safeFireAndForget(window.electron.system.openExternal(blockedNav.url), {
              context: "Opening blocked dev preview URL externally",
            });
            onDismiss();
          }}
          className="shrink-0 px-2 py-0.5 rounded text-xs bg-status-warning/20 hover:bg-status-warning/30 text-daintree-text/90 transition-colors"
        >
          Open in external browser
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-daintree-text/40 hover:text-daintree-text/70 transition-colors"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export interface DevPreviewPaneProps extends BasePanelProps {
  cwd: string;
  worktreeId?: string;
}

const STUCK_REMEDY_LABELS: Record<string, string> = {
  "devPreview.restartClearCache": "Restart and clear cache",
  "devPreview.reinstall": "Reinstall dependencies",
};

interface DevPreviewStuckBannerProps {
  tier: 2 | 3;
  error: UseDevServerReturn["error"];
  /** Disables the banner actions while a restart is already in flight. */
  isRestarting: boolean;
  onRestart: () => void;
  onRemedy: (actionId: string) => void;
}

/**
 * Staged stuck-start escalation banner (#8276). Replaces the old silent
 * auto-restart with a user-driven signal: Tier 2 is a warning that the
 * server is slow, Tier 3 an error that names likely causes and, when the
 * dev server emitted a recognised error, offers a variant-specific remedy
 * (`error.recommendedActionId`) alongside a plain restart.
 */
function DevPreviewStuckBanner({
  tier,
  error,
  isRestarting,
  onRestart,
  onRemedy,
}: DevPreviewStuckBannerProps) {
  const restartAction: BannerAction = {
    id: "dev-preview-stuck-restart",
    label: "Restart dev server",
    icon: RotateCw,
    variant: "primary",
    disabled: isRestarting,
    onClick: onRestart,
  };

  if (tier === 2) {
    return (
      <InlineStatusBanner
        icon={AlertTriangle}
        severity="warning"
        title="Dev server is slow to start"
        description="It's been a while without a URL. Check the terminal logs for what it's waiting on — restarting clears those logs."
        role="status"
        ariaLive="polite"
        actions={[restartAction]}
      />
    );
  }

  const remedyId = error?.recommendedActionId;
  const remedyLabel = remedyId ? STUCK_REMEDY_LABELS[remedyId] : undefined;
  const actions: BannerAction[] =
    remedyId && remedyLabel
      ? [
          {
            id: `dev-preview-stuck-remedy-${remedyId}`,
            label: remedyLabel,
            icon: RotateCw,
            variant: "primary",
            disabled: isRestarting,
            onClick: () => onRemedy(remedyId),
          },
          restartAction,
        ]
      : [restartAction];

  const description = error?.message
    ? error.message
    : "Likely causes: the port is still bound by another process, dependencies are missing, or the build cache is stuck. Check the terminal logs.";

  return (
    <InlineStatusBanner
      icon={AlertTriangle}
      severity="error"
      title="Dev server still hasn't started"
      description={description}
      role="alert"
      ariaLive="assertive"
      actions={actions}
    />
  );
}

function sanitizePartitionToken(value: string | undefined): string {
  const token = (value ?? "default").trim().toLowerCase();
  const sanitized = token.replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
  return sanitized || "default";
}

export function DevPreviewPane({
  id,
  title,
  cwd,
  worktreeId,
  isFocused,
  isMaximized = false,
  location = "grid",
  onFocus,
  onClose,
  onToggleMaximize,
  onTitleChange,
  onMinimize,
  onRestore,
  gridPanelCount,
}: DevPreviewPaneProps) {
  const webviewRef = useRef<Electron.WebviewTag>(null);
  const [webviewElement, setWebviewElement] = useState<Electron.WebviewTag | null>(null);
  const setBrowserUrl = usePanelStore((state) => state.setBrowserUrl);
  const setBrowserHistory = usePanelStore((state) => state.setBrowserHistory);
  const setBrowserZoom = usePanelStore((state) => state.setBrowserZoom);
  const setDevPreviewConsoleOpen = usePanelStore((state) => state.setDevPreviewConsoleOpen);
  const setDevPreviewConsoleTab = usePanelStore((state) => state.setDevPreviewConsoleTab);
  const setViewportPreset = usePanelStore((state) => state.setViewportPreset);
  const setViewportRotated = usePanelStore((state) => state.setViewportRotated);
  const setViewportDpr = usePanelStore((state) => state.setViewportDpr);
  const setViewportFit = usePanelStore((state) => state.setViewportFit);
  const setDevPreviewScrollPosition = usePanelStore((state) => state.setDevPreviewScrollPosition);
  const currentProjectId = useProjectStore((state) => state.currentProject?.id);
  const projectSettings = useProjectSettingsStore((state) => state.settings);
  const projectEnv = projectSettings?.environmentVariables;
  const isDragging = useIsDragging();

  const terminal = usePanelStore((state) => state.getTerminal(id));
  const devCommand =
    terminal?.devCommand?.trim() || projectSettings?.devServerCommand?.trim() || "";
  const viewportPreset = terminal?.viewportPreset;
  const viewportRotated = terminal?.viewportRotated ?? false;
  const viewportDpr = terminal?.viewportDpr ?? 1;
  const viewportFit = terminal?.viewportFit ?? false;
  const effectiveViewport = viewportPreset
    ? getEffectiveViewportSize(viewportPreset, viewportRotated)
    : null;

  const {
    status,
    url,
    terminalId,
    error,
    start,
    stop,
    restart,
    isRestarting,
    stuckTier,
    forceKilled,
  } = useDevServer({
    panelId: id,
    devCommand,
    cwd,
    worktreeId,
    env: projectEnv,
    turbopackEnabled: projectSettings?.turbopackEnabled ?? true,
  });

  const webviewPartition = useMemo(() => {
    const projectToken = sanitizePartitionToken(currentProjectId);
    const worktreeToken = sanitizePartitionToken(worktreeId ?? "main");
    const panelToken = sanitizePartitionToken(id);
    return `persist:dev-preview-${projectToken}-${worktreeToken}-${panelToken}`;
  }, [currentProjectId, worktreeId, id]);

  const [forceKillBannerDismissed, setForceKillBannerDismissed] = useState(false);

  useEffect(() => {
    if (forceKilled) {
      setForceKillBannerDismissed(false);
    }
  }, [forceKilled]);

  const [history, setHistory] = useState<BrowserHistory>(() => {
    const saved = terminal?.browserHistory;
    return initializeBrowserHistory(saved, "");
  });

  const [zoomFactor, setZoomFactor] = useState<number>(() => {
    const savedZoom = terminal?.browserZoom ?? 1.0;
    return Number.isFinite(savedZoom) ? Math.max(0.25, Math.min(2.0, savedZoom)) : 1.0;
  });

  const [blockedNav, setBlockedNav] = useState<DevPreviewBlockedNav | null>(null);
  const blockedNavTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSetUrlRef = useRef<string>("");
  const [consoleTerminalId, setConsoleTerminalId] = useState<string | null>(terminalId);
  // Generation token to invalidate in-flight async scroll captures when the
  // user clears scroll state via hard restart. A pending executeJavaScript
  // promise that resolves after the clear must NOT write the stale position back.
  const scrollCaptureGenerationRef = useRef<number>(0);
  const isConsoleOpen = terminal?.devPreviewConsoleOpen ?? false;
  const activeConsoleTab = terminal?.devPreviewConsoleTab ?? "output";
  const [guestWebContentsId, setGuestWebContentsId] = useState<number | undefined>(undefined);
  // Store the original guest UA so we can restore it when clearing a preset
  const originalUaRef = useRef<string | null>(null);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const { saveSettings } = useProjectSettings();
  const allDetectedRunners = useProjectSettingsStore((state) => state.allDetectedRunners);
  const isSettingsLoading = useProjectSettingsStore((state) => state.isLoading);
  const isMountedRef = useRef(true);
  const prevStatusRef = useRef(status);
  const loadTimeoutMs =
    Math.min(Math.max(projectSettings?.devServerLoadTimeout ?? 30, 1), 120) * 1000;

  const hasBeenVisible = useHasBeenVisible(id, location);

  const currentUrl = history.present;
  const canGoBack = history.past.length > 0;
  const canGoForward = history.future.length > 0;
  const isUnconfigured =
    Boolean(currentProjectId) && !isSettingsLoading && projectSettings !== null && !devCommand;

  const { isEvicted, evictingRef } = useWebviewEviction(id, location);

  const [isRecoveringFromEviction, setIsRecoveringFromEviction] = useState(false);
  const previousIsEvictedRef = useRef(false);

  useEffect(() => {
    if (previousIsEvictedRef.current && !isEvicted && hasBeenVisible) {
      setIsRecoveringFromEviction(true);
    }
    if (isEvicted) {
      setIsRecoveringFromEviction(false);
    }
    previousIsEvictedRef.current = isEvicted;
  }, [isEvicted, hasBeenVisible]);

  const showRecoverySpinner = useDeferredLoading(isRecoveringFromEviction, UI_DOHERTY_THRESHOLD);

  useEffect(() => {
    const webview = webviewElement;
    if (!webview || !isRecoveringFromEviction) return;

    const handleRecoveryFinishLoad = () => {
      try {
        if (webview.getURL() !== "about:blank") {
          setIsRecoveringFromEviction(false);
        }
      } catch {
        // Webview detached
      }
    };

    webview.addEventListener("did-finish-load", handleRecoveryFinishLoad);

    try {
      if (webview.getURL() !== "about:blank" && !webview.isLoading()) {
        setIsRecoveringFromEviction(false);
      }
    } catch {
      // Webview not ready
    }

    return () => {
      webview.removeEventListener("did-finish-load", handleRecoveryFinishLoad);
    };
  }, [isRecoveringFromEviction, webviewElement]);

  const {
    isWebviewReady,
    setIsWebviewReady,
    isLoading,
    setIsLoading,
    isSlowLoad,
    setIsSlowLoad,
    webviewLoadError,
    setWebviewLoadError,
    reconnectAttempt,
    clearLoadTimers,
    clearRetryState,
  } = useDevPreviewLoadLifecycle({
    webviewElement,
    id,
    projectId: currentProjectId,
    loadTimeoutMs,
    zoomFactor,
    viewportPreset,
    evictingRef,
    lastSetUrlRef,
    originalUaRef,
    setHistory,
    setBlockedNav,
  });

  useEffect(() => {
    if (!isUnconfigured) return;
    setHistory(initializeBrowserHistory(undefined, ""));
    setBrowserUrl(id, "");
    lastSetUrlRef.current = "";
    setWebviewLoadError(null);
    clearRetryState();
  }, [isUnconfigured, id, setBrowserUrl, setWebviewLoadError, clearRetryState]);

  const setWebviewNode = useCallback(
    (node: Electron.WebviewTag | null) => {
      if (!node && webviewRef.current) {
        try {
          const prevWebview = webviewRef.current;
          const currentWebviewUrl = prevWebview.getURL();
          if (currentWebviewUrl && currentWebviewUrl !== "about:blank") {
            const captureGeneration = scrollCaptureGenerationRef.current;
            // Use main-process CDP Page.getLayoutMetrics instead of
            // executeJavaScript("window.scrollY"): hidden dock webviews are
            // frozen by useWebviewThrottle (via Page.setWebLifecycleState) which
            // suspends the JS task queue, so the executeJavaScript path hangs
            // when memory-pressure eviction fires while the page is frozen.
            const wcId = (
              prevWebview as unknown as { getWebContentsId(): number }
            ).getWebContentsId();
            window.electron.webview
              .getScrollPosition(wcId)
              .then((scrollY: number) => {
                if (scrollCaptureGenerationRef.current !== captureGeneration) return;
                // Guard `> 0`: a CDP error returns 0, and the user being at top
                // of page has nothing worth restoring — both cases should leave
                // any prior stored position untouched rather than clobber it.
                if (typeof scrollY === "number" && Number.isFinite(scrollY) && scrollY > 0) {
                  setDevPreviewScrollPosition(id, { url: currentWebviewUrl, scrollY });
                }
              })
              .catch(() => {});
          }
        } catch {
          // Webview already detached
        }
      }
      webviewRef.current = node;
      if (node) {
        lastSetUrlRef.current = "";
        clearRetryState();
      }
      setWebviewElement(node);
    },
    [id, setDevPreviewScrollPosition, clearRetryState]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;

    if (prevStatus === "running" && status !== "running" && webviewElement) {
      try {
        const currentWebviewUrl = webviewElement.getURL();
        if (currentWebviewUrl && currentWebviewUrl !== "about:blank") {
          const captureGeneration = scrollCaptureGenerationRef.current;
          webviewElement
            .executeJavaScript("window.scrollY")
            .then((scrollY: number) => {
              if (scrollCaptureGenerationRef.current !== captureGeneration) return;
              if (typeof scrollY === "number" && Number.isFinite(scrollY)) {
                setDevPreviewScrollPosition(id, { url: currentWebviewUrl, scrollY });
              }
            })
            .catch(() => {});
        }
      } catch {
        // Webview already detached
      }
    }
  }, [status, id, webviewElement, setDevPreviewScrollPosition]);

  useEffect(() => {
    setConsoleTerminalId(terminalId);
  }, [terminalId]);

  useEffect(() => {
    if (isUnconfigured) return;
    const nextUrl = url ? computeDevServerUrl(url, currentUrl) : false;
    if (nextUrl !== false) {
      setHistory((prev) => pushBrowserHistory(prev, nextUrl));
      lastSetUrlRef.current = nextUrl;
    }
  }, [url, currentUrl, isUnconfigured]);

  useEffect(() => {
    if (isUnconfigured) return;
    if (currentUrl) {
      setBrowserUrl(id, currentUrl);
    }
  }, [id, currentUrl, setBrowserUrl, isUnconfigured]);

  useEffect(() => {
    setBrowserHistory(id, history);
  }, [id, history, setBrowserHistory]);

  useEffect(() => {
    setBrowserZoom(id, zoomFactor);
  }, [id, zoomFactor, setBrowserZoom]);

  const handleNavigate = useCallback((rawUrl: string) => {
    const normalized = normalizeBrowserUrl(rawUrl);
    if (normalized.url) {
      setHistory((prev) => pushBrowserHistory(prev, normalized.url!));
      lastSetUrlRef.current = normalized.url;
    }
  }, []);

  const handleBack = useCallback(() => {
    if (canGoBack) {
      setHistory((prev) => goBackBrowserHistory(prev));
    }
  }, [canGoBack]);

  const handleForward = useCallback(() => {
    if (canGoForward) {
      setHistory((prev) => goForwardBrowserHistory(prev));
    }
  }, [canGoForward]);

  const handleReload = useCallback(() => {
    setWebviewLoadError(null);
    setIsSlowLoad(false);
    webviewRef.current?.reload();
  }, [setWebviewLoadError, setIsSlowLoad]);

  const handleCancelLoad = useCallback(() => {
    clearLoadTimers();
    setIsSlowLoad(false);
    setIsLoading(false);
    try {
      webviewRef.current?.stop();
    } catch {
      // Webview detached
    }
    setWebviewLoadError({ code: "aborted", message: "Load cancelled." });
  }, [clearLoadTimers, setIsSlowLoad, setIsLoading, setWebviewLoadError]);

  const handleRetryWebviewLoad = useCallback(() => {
    setWebviewLoadError(null);
    setIsSlowLoad(false);
    setIsLoading(true);
    if (currentUrl) {
      // Swallow ERR_ABORTED-class rejections — did-fail-load is the source
      // of truth for genuine failures.
      const webview = webviewRef.current;
      if (webview) {
        loadWebviewUrl(webview, currentUrl);
      }
    } else {
      webviewRef.current?.reload();
    }
  }, [currentUrl, setWebviewLoadError, setIsSlowLoad, setIsLoading]);

  const handleHardReload = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview || !isWebviewReady) return;
    setWebviewLoadError(null);
    setIsSlowLoad(false);
    try {
      const wcId = (webview as unknown as { getWebContentsId(): number }).getWebContentsId();
      safeFireAndForget(window.electron.webview.reloadIgnoringCache(wcId, id), {
        context: "Reloading dev preview ignoring cache",
      });
    } catch {
      webview.reload();
    }
  }, [isWebviewReady, id, setWebviewLoadError, setIsSlowLoad]);

  const handleCaptureScreenshot = useCallback(async () => {
    const webview = webviewRef.current;
    if (!webview || !isWebviewReady) return;
    let url: string;
    try {
      url = webview.getURL();
    } catch {
      return;
    }
    if (!url || url === "about:blank") return;
    try {
      const image = await webview.capturePage();
      const pngData = new Uint8Array(image.toPNG());
      await window.electron.clipboard.writeImage(pngData);
    } catch (err) {
      logError("[DevPreviewPane] Screenshot capture failed", err);
    }
  }, [isWebviewReady]);

  const handleToggleDevTools = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview || !isWebviewReady) return;
    if (webview.isDevToolsOpened()) {
      webview.closeDevTools();
    } else {
      webview.openDevTools();
    }
  }, [isWebviewReady]);

  const handleToggleConsole = useCallback(() => {
    setDevPreviewConsoleOpen(id, !isConsoleOpen);
  }, [id, isConsoleOpen, setDevPreviewConsoleOpen]);

  const handleToggleDevTools = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview || !isWebviewReady) return;
    if (webview.isDevToolsOpened()) {
      webview.closeDevTools();
    } else {
      webview.openDevTools();
    }
  }, [isWebviewReady]);

  const handleOpenExternal = useCallback(() => {
    if (currentUrl) {
      safeFireAndForget(window.electron.system.openExternal(currentUrl), {
        context: "Opening dev preview URL externally",
      });
    }
  }, [currentUrl]);

  const handleZoomChange = useCallback((newZoom: number) => {
    const clamped = Math.max(0.25, Math.min(2.0, newZoom));
    setZoomFactor(clamped);
    if (webviewRef.current) {
      webviewRef.current.setZoomFactor(clamped);
    }
  }, []);

  useBrowserActionListeners(id, {
    onReload: handleReload,
    onNavigate: handleNavigate,
    onBack: handleBack,
    onForward: handleForward,
    onSetZoom: handleZoomChange,
    onCaptureScreenshot: handleCaptureScreenshot,
    onToggleDevTools: handleToggleDevTools,
    onToggleConsole: handleToggleConsole,
    onHardReload: handleHardReload,
  });

  const handleRetry = useCallback(() => {
    void start();
  }, [start]);

  const handleHardRestart = useCallback(() => {
    // Invalidate any in-flight async scroll captures so they can't write
    // stale data back over the cleared position.
    scrollCaptureGenerationRef.current += 1;
    setDevPreviewScrollPosition(id, undefined);
    clearLoadTimers();
    setHistory(initializeBrowserHistory(undefined, ""));
    setBrowserUrl(id, "");
    lastSetUrlRef.current = "";
    setIsLoading(false);
    setIsSlowLoad(false);
    setIsWebviewReady(false);
    setWebviewLoadError(null);
    void restart();
  }, [
    id,
    restart,
    setBrowserUrl,
    setDevPreviewScrollPosition,
    clearLoadTimers,
    setIsLoading,
    setIsSlowLoad,
    setIsWebviewReady,
    setWebviewLoadError,
  ]);

  const handleStuckRemedy = useCallback(
    (actionId: string) => {
      if (!currentProjectId) return;
      void actionService.dispatch(
        actionId as ActionId,
        { panelId: id, projectId: currentProjectId },
        { source: "user" }
      );
    },
    [currentProjectId, id]
  );

  const handleAutoDetect = useCallback(async () => {
    if (!currentProjectId || isAutoDetecting) return;

    setIsAutoDetecting(true);
    try {
      const freshRunners = await projectClient.detectRunners(currentProjectId);
      const candidate = findDevServerCandidate(
        freshRunners,
        projectSettings?.turbopackEnabled ?? true
      );

      if (!candidate) {
        return;
      }

      const latestSettings = await projectClient.getSettings(currentProjectId);
      if (!latestSettings) {
        return;
      }

      await saveSettings({
        ...latestSettings,
        devServerCommand: candidate.command,
        devServerAutoDetected: true,
        devServerDismissed: false,
      });
    } catch (err) {
      logError("Failed to auto-detect dev server", err);
    } finally {
      if (isMountedRef.current) {
        setIsAutoDetecting(false);
      }
    }
  }, [currentProjectId, isAutoDetecting, saveSettings, projectSettings?.turbopackEnabled]);

  const handleOpenSettings = useCallback(() => {
    void actionService.dispatch("project.settings.open", undefined, { source: "user" });
  }, []);

  const handleViewportPresetChange = useCallback(
    (preset: ViewportPresetId | undefined) => {
      setViewportPreset(id, preset);
    },
    [id, setViewportPreset]
  );

  const handleViewportRotateToggle = useCallback(() => {
    setViewportRotated(id, !viewportRotated);
  }, [id, setViewportRotated, viewportRotated]);

  const handleViewportDprChange = useCallback(
    (dpr: 1 | 2 | 3) => {
      setViewportDpr(id, dpr);
      // TODO(#8278): once the enableDeviceEmulation IPC bridge lands, apply the
      // deviceScaleFactor to the live webview here. Until then this only
      // persists the preference so the toolbar shape is stable when #8278 ships.
    },
    [id, setViewportDpr]
  );

  const handleViewportFitToggle = useCallback(() => {
    setViewportFit(id, !viewportFit);
  }, [id, setViewportFit, viewportFit]);

  // Measure the available preview area so zoom-to-fit can scale the device
  // frame down to fit both pane dimensions. A static scale would break on
  // pane resize, so this tracks the container via ResizeObserver.
  // Callback ref (not useRef) so the observer effect re-runs when the
  // fit-container div mounts for the first time — it lives in the webview
  // branch, which only renders once the dev server reaches "running", long
  // after viewportFit/viewportPreset may have been set.
  const [fitContainerEl, setFitContainerEl] = useState<HTMLDivElement | null>(null);
  const [fitContainerSize, setFitContainerSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  useEffect(() => {
    if (!viewportFit || !viewportPreset || !fitContainerEl) return;
    const el = fitContainerEl;
    const measure = () => {
      setFitContainerSize({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewportFit, viewportPreset, fitContainerEl]);

  const fitScale =
    viewportFit && effectiveViewport
      ? computeFitScale(
          fitContainerSize.w,
          fitContainerSize.h,
          effectiveViewport.width,
          effectiveViewport.height
        )
      : 1;

  useEffect(() => {
    if (isWebviewReady && currentUrl && currentUrl !== lastSetUrlRef.current) {
      lastSetUrlRef.current = currentUrl;
      if (webviewElement) {
        try {
          const loadedUrl = webviewElement.getURL();
          if (loadedUrl !== currentUrl) {
            loadWebviewUrl(webviewElement, currentUrl, () => {
              webviewElement.src = currentUrl;
            });
          }
        } catch {
          webviewElement.src = currentUrl;
        }
      }
    }
  }, [currentUrl, isWebviewReady, webviewElement]);

  // Wire the guest-page CDP console capture into the renderer store. The hook
  // owns start/stop keyed on the ready/eviction lifecycle; here we only mirror
  // the live webContentsId so lazy object inspection can reach the right guest.
  useDevPreviewConsoleCapture(id, webviewRef, isWebviewReady, isEvicted);

  useEffect(() => {
    if (!isWebviewReady || isEvicted) {
      setGuestWebContentsId(undefined);
      return;
    }
    try {
      setGuestWebContentsId(webviewRef.current?.getWebContentsId());
    } catch {
      setGuestWebContentsId(undefined);
    }
  }, [isWebviewReady, isEvicted]);

  // Blank the webview and clear timers before React unmounts it for faster memory reclamation
  useEffect(() => {
    if (isEvicted && webviewRef.current) {
      try {
        // Save scroll position before eviction. Use the main-process CDP
        // Page.getLayoutMetrics path rather than executeJavaScript("window.scrollY"):
        // useWebviewThrottle freezes hidden webviews after 500ms, and frozen pages
        // suspend the JS task queue so executeJavaScript hangs indefinitely. CDP
        // reads layout state directly from Blink, bypassing the freeze.
        const wv = webviewRef.current;
        const currentWebviewUrl = wv.getURL();
        if (currentWebviewUrl && currentWebviewUrl !== "about:blank") {
          const captureGeneration = scrollCaptureGenerationRef.current;
          const wcId = (wv as unknown as { getWebContentsId(): number }).getWebContentsId();
          window.electron.webview
            .getScrollPosition(wcId)
            .then((scrollY: number) => {
              if (scrollCaptureGenerationRef.current !== captureGeneration) return;
              // See ref-cleanup path above: skip `0` so a CDP error can't
              // clobber a previously captured position.
              if (typeof scrollY === "number" && Number.isFinite(scrollY) && scrollY > 0) {
                setDevPreviewScrollPosition(id, { url: currentWebviewUrl, scrollY });
              }
            })
            .catch(() => {});
        }
        wv.src = "about:blank";
      } catch {
        // webview may already be detached
      }
      clearLoadTimers();
      clearRetryState();
    }
  }, [isEvicted, id, setDevPreviewScrollPosition, clearLoadTimers, clearRetryState]);

  useWebviewThrottle(id, location, isEvicted ? null : webviewElement, isWebviewReady && !isEvicted);

  // Apply UA override when viewport preset changes on an already-ready webview
  // Initialize to undefined so restored presets trigger the effect on first render
  const prevViewportPresetRef = useRef<ViewportPresetId | undefined>(undefined);
  useEffect(() => {
    if (!isWebviewReady || !webviewElement) return;
    if (prevViewportPresetRef.current === viewportPreset) return;
    const previousPreset = prevViewportPresetRef.current;
    prevViewportPresetRef.current = viewportPreset;

    try {
      const wc = (
        webviewElement as unknown as {
          getWebContents(): { setUserAgent(ua: string): void; getUserAgent(): string };
        }
      ).getWebContents();
      // Capture original UA on first override
      if (originalUaRef.current === null) {
        originalUaRef.current = wc.getUserAgent();
      }
      if (viewportPreset) {
        const preset = getViewportPreset(viewportPreset);
        wc.setUserAgent(preset.userAgent);
      } else if (previousPreset !== undefined) {
        // Only restore if we previously overrode (not first mount with no preset)
        wc.setUserAgent(originalUaRef.current!);
      }
      // Reload so the page re-evaluates with the new UA
      if (previousPreset !== undefined) {
        webviewElement.reload();
      }
    } catch {
      // WebContents not available (webview detached)
    }
  }, [viewportPreset, isWebviewReady, webviewElement]);
  const { currentDialog, handleDialogRespond } = useWebviewDialog(
    id,
    isEvicted ? null : webviewElement,
    isWebviewReady && !isEvicted
  );
  const findInPage = useFindInPage(
    id,
    isEvicted ? null : webviewElement,
    isWebviewReady && !isEvicted,
    isFocused
  );

  // Listen for blocked navigation events from main process
  useEffect(() => {
    let disposed = false;
    const cleanup = window.electron.webview.onNavigationBlocked((data) => {
      if (data.panelId !== id) return;
      const sessionStorageSnapshotPromise = looksLikeOAuthUrl(data.url)
        ? captureWebviewSessionStorage(webviewElement)
        : Promise.resolve<SessionStorageEntry[]>([]);
      if (blockedNavTimerRef.current) {
        clearTimeout(blockedNavTimerRef.current);
      }
      blockedNavTimerRef.current = setTimeout(() => {
        void sessionStorageSnapshotPromise
          .then((sessionStorageSnapshot) => {
            if (disposed) return;
            setBlockedNav({
              url: data.url,
              canOpenExternal: data.canOpenExternal,
              sessionStorageSnapshot,
            });
            blockedNavTimerRef.current = null;
          })
          .catch((err) => {
            if (!disposed) logError("Failed to capture session storage snapshot", err);
          });
      }, 150);
    });
    return () => {
      disposed = true;
      cleanup();
      if (blockedNavTimerRef.current) {
        clearTimeout(blockedNavTimerRef.current);
        blockedNavTimerRef.current = null;
      }
    };
  }, [id, webviewElement]);

  // Auto-dismiss blocked navigation notification after 10 seconds
  useEffect(() => {
    if (!blockedNav) return;
    const timer = setTimeout(() => setBlockedNav(null), 10_000);
    return () => clearTimeout(timer);
  }, [blockedNav]);

  return (
    <ContentPanel
      id={id}
      title={title}
      isFocused={isFocused}
      isMaximized={isMaximized}
      location={location}
      onFocus={onFocus}
      onClose={onClose}
      onToggleMaximize={onToggleMaximize}
      onTitleChange={onTitleChange}
      onMinimize={onMinimize}
      onRestore={onRestore}
      gridPanelCount={gridPanelCount}
      kind="dev-preview"
      className={stuckTier >= 1 ? "panel-state-working" : undefined}
    >
      <div className="flex flex-col h-full">
        <BrowserToolbar
          terminalId={id}
          projectId={currentProjectId}
          url={currentUrl}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          isLoading={isLoading}
          zoomFactor={zoomFactor}
          isWebviewReady={isWebviewReady}
          isConsoleOpen={isConsoleOpen}
          viewportPreset={viewportPreset}
          viewportRotated={viewportRotated}
          viewportDpr={viewportDpr}
          viewportFit={viewportFit}
          onNavigate={handleNavigate}
          onBack={handleBack}
          onForward={handleForward}
          onReload={handleReload}
          onHardReload={handleHardReload}
          onOpenExternal={handleOpenExternal}
          onZoomChange={handleZoomChange}
          onCaptureScreenshot={handleCaptureScreenshot}
          onToggleDevTools={handleToggleDevTools}
          onToggleConsole={handleToggleConsole}
          onViewportPresetChange={handleViewportPresetChange}
          onViewportRotateToggle={handleViewportRotateToggle}
          onViewportDprChange={handleViewportDprChange}
          onViewportFitToggle={handleViewportFitToggle}
        />

        {stuckTier >= 2 && (
          <DevPreviewStuckBanner
            tier={stuckTier >= 3 ? 3 : 2}
            error={error}
            isRestarting={isRestarting}
            onRestart={handleHardRestart}
            onRemedy={handleStuckRemedy}
          />
        )}

        <div
          className={cn(
            "relative flex-1 min-h-0 bg-surface-canvas",
            viewportPreset && viewportFit ? "overflow-hidden" : "overflow-auto"
          )}
        >
          {viewportPreset && effectiveViewport && (
            <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10 px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface/90 text-daintree-text/60 border border-overlay/50">
              {getViewportPreset(viewportPreset).label} · {effectiveViewport.width}×
              {effectiveViewport.height}
              {viewportFit && fitScale < 1 && ` · ${Math.round(fitScale * 100)}%`}
            </div>
          )}
          {isRestarting || status === "starting" || status === "installing" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-daintree-bg">
              <Spinner size="2xl" className="text-status-info mb-4" />
              <p className="text-sm text-daintree-text/60">
                {isRestarting ? "Restarting" : status === "installing" ? "Installing" : "Starting"}
                ...
              </p>
            </div>
          ) : status === "error" && error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-daintree-bg text-daintree-text p-6">
              <AlertTriangle className="w-6 h-6 text-status-warning mb-3" />
              <h3 className="text-sm font-medium text-daintree-text/70 mb-1">
                {error.type === "port-conflict"
                  ? "Port conflict"
                  : error.type === "missing-dependencies"
                    ? "Missing dependencies"
                    : error.type === "permission"
                      ? "Permission denied"
                      : "Dev server error"}
              </h3>
              <p className="text-xs text-daintree-text/50 text-center mb-3 max-w-md">
                {error.message}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  onClick={handleRetry}
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 px-2.5 py-1.5 group"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span className="text-xs">
                    {error.type === "missing-dependencies" ? "Retry install" : "Retry"}
                  </span>
                </Button>
                {error.type === "missing-dependencies" || error.type === "permission" ? (
                  <Button
                    onClick={() => setDevPreviewConsoleOpen(id, true)}
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 px-2.5 py-1.5 group text-daintree-text/50 hover:text-daintree-text/70"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="text-xs">View terminal</span>
                  </Button>
                ) : currentUrl ? (
                  <Button
                    onClick={handleOpenExternal}
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 px-2.5 py-1.5 group text-daintree-text/50 hover:text-daintree-text/70"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="text-xs">Open external</span>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : !currentUrl || status !== "running" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-daintree-bg text-daintree-text p-6">
              {isUnconfigured ? (
                <div className="flex flex-col items-center text-center max-w-md">
                  <h3 className="text-sm font-medium text-daintree-text/70 mb-1">
                    Configure dev server
                  </h3>
                  <p className="text-xs text-daintree-text/50 mb-4 leading-relaxed">
                    No dev server command is configured for this project.
                    {allDetectedRunners &&
                    findDevServerCandidate(
                      allDetectedRunners,
                      projectSettings?.turbopackEnabled ?? true
                    )
                      ? " We found a script in your package.json that looks like a dev server."
                      : " Configure one to preview your application."}
                  </p>
                  <div className="flex flex-col items-center gap-2">
                    {allDetectedRunners &&
                      findDevServerCandidate(
                        allDetectedRunners,
                        projectSettings?.turbopackEnabled ?? true
                      ) && (
                        <Button
                          onClick={handleAutoDetect}
                          disabled={isAutoDetecting || isSettingsLoading}
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 px-2.5 py-1.5 group"
                        >
                          <WandSparkles className="h-3.5 w-3.5" />
                          <span className="text-xs">
                            {isAutoDetecting
                              ? "Detecting..."
                              : `Use \`${findDevServerCandidate(allDetectedRunners, projectSettings?.turbopackEnabled ?? true)?.command}\``}
                          </span>
                        </Button>
                      )}
                    <Button
                      onClick={handleOpenSettings}
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 px-2.5 py-1.5 group text-daintree-text/50 hover:text-daintree-text/70"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      <span className="text-xs">Open Project Settings</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center max-w-md">
                  <h3 className="text-sm font-medium text-daintree-text/70 mb-1">
                    Waiting for dev server
                  </h3>
                  <p className="text-xs text-daintree-text/50 mb-4 leading-relaxed">
                    The development server will appear here once it starts and a URL is detected.
                  </p>
                </div>
              )}
            </div>
          ) : !hasBeenVisible ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-daintree-bg text-daintree-text">
              <p className="text-xs text-daintree-text/50">
                Preview will load when this panel is first viewed
              </p>
            </div>
          ) : isEvicted ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-daintree-bg text-daintree-text p-6">
              <p className="text-xs text-daintree-text/50">
                Preview paused to save memory — will reload when opened
              </p>
            </div>
          ) : (
            <div
              ref={setFitContainerEl}
              className={cn(
                "h-full",
                viewportPreset &&
                  (viewportFit
                    ? "flex items-center justify-center"
                    : "flex items-start justify-center pt-5")
              )}
            >
              <div
                className={cn(
                  "relative",
                  viewportPreset
                    ? "rounded-lg border border-overlay/50 shadow-[var(--theme-shadow-floating)] overflow-hidden"
                    : "h-full"
                )}
                style={
                  viewportPreset && effectiveViewport
                    ? viewportFit
                      ? {
                          width: effectiveViewport.width * fitScale,
                          height: effectiveViewport.height * fitScale,
                        }
                      : {
                          maxWidth: effectiveViewport.width,
                          width: "100%",
                          aspectRatio: `${effectiveViewport.width} / ${effectiveViewport.height}`,
                        }
                    : undefined
                }
              >
                <>
                  {reconnectAttempt > 0 && !webviewLoadError && (
                    <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-2 px-3 py-1.5 text-xs bg-status-info/10 border-t border-status-info/20 text-daintree-text/70">
                      <Spinner size="xs" className="text-status-info" />
                      <span>Reconnecting (attempt {reconnectAttempt} of 5)...</span>
                    </div>
                  )}
                  {webviewLoadError && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-daintree-bg text-daintree-text p-6">
                      <AlertTriangle className="w-6 h-6 text-status-warning mb-3" />
                      <h3 className="text-sm font-medium text-daintree-text/70 mb-1">
                        {webviewLoadError.code === "timeout"
                          ? "Page load timed out"
                          : webviewLoadError.code === "aborted"
                            ? "Load cancelled"
                            : webviewLoadError.code === "connection_refused"
                              ? "Dev server unreachable"
                              : webviewLoadError.code === "name_not_resolved"
                                ? "Couldn't resolve address"
                                : webviewLoadError.code === "internet_disconnected"
                                  ? "No internet connection"
                                  : "Page load failed"}
                      </h3>
                      <p className="text-xs text-daintree-text/50 text-center mb-3 max-w-md">
                        {webviewLoadError.message}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          onClick={
                            webviewLoadError.code === "connection_refused"
                              ? handleHardRestart
                              : handleRetryWebviewLoad
                          }
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 px-2.5 py-1.5 group"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                          <span className="text-xs">
                            {webviewLoadError.code === "connection_refused"
                              ? "Hard restart"
                              : "Retry"}
                          </span>
                        </Button>
                        {currentUrl && (
                          <Button
                            onClick={handleOpenExternal}
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 px-2.5 py-1.5 group text-daintree-text/50 hover:text-daintree-text/70"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span className="text-xs">Open external</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  {blockedNav && (
                    <BlockedNavBanner
                      blockedNav={blockedNav}
                      panelId={id}
                      webviewElement={webviewElement}
                      onDismiss={() => setBlockedNav(null)}
                    />
                  )}
                  {isLoading && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-daintree-bg gap-3">
                      <Spinner size="2xl" className="text-status-info" />
                      {isSlowLoad && (
                        <>
                          <p className="text-xs text-daintree-text/50">
                            Taking longer than usual...
                          </p>
                          <Button
                            onClick={handleCancelLoad}
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 px-2.5 py-1.5 group text-daintree-text/50 hover:text-daintree-text/70"
                          >
                            <Square className="h-3.5 w-3.5" />
                            <span className="text-xs">Cancel</span>
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  {showRecoverySpinner && !webviewLoadError && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-daintree-bg gap-3">
                      <Spinner size="2xl" className="text-status-info" />
                      <p className="text-xs text-daintree-text/50">Rehydrating preview...</p>
                    </div>
                  )}
                  {isDragging && <div className="absolute inset-0 z-10 bg-transparent" />}
                  {findInPage.isOpen && <FindBar find={findInPage} />}
                  {/* Only the webview is scaled by zoom-to-fit; overlays above
                        stay at full size relative to the outer container so
                        their action buttons remain readable and clickable. */}
                  <div
                    className={
                      viewportPreset && viewportFit
                        ? "absolute top-0 left-0 origin-top-left"
                        : "w-full h-full"
                    }
                    style={
                      viewportPreset && viewportFit && effectiveViewport
                        ? {
                            width: effectiveViewport.width,
                            height: effectiveViewport.height,
                            transform: `scale(${fitScale})`,
                          }
                        : undefined
                    }
                  >
                    <webview
                      ref={setWebviewNode}
                      src={currentUrl}
                      partition={webviewPartition}
                      // @ts-expect-error React 19 requires "" to emit the attribute; boolean true is silently dropped
                      allowpopups=""
                      className={cn(
                        "w-full h-full border-0",
                        isDragging && "invisible pointer-events-none"
                      )}
                    />
                  </div>
                  <WebviewDialog dialog={currentDialog} onRespond={handleDialogRespond} />
                </>
              </div>
            </div>
          )}
        </div>

        {forceKilled && status === "stopped" && !forceKillBannerDismissed && (
          <InlineStatusBanner
            icon={OctagonAlert}
            title="Dev server was force-quit"
            description="The server did not exit within 5 seconds and was terminated."
            severity="warning"
            onClose={() => setForceKillBannerDismissed(true)}
            actions={[]}
          />
        )}
        {consoleTerminalId && (
          <ConsoleDrawer
            terminalId={consoleTerminalId}
            paneId={id}
            webContentsId={guestWebContentsId}
            status={status}
            isOpen={isConsoleOpen}
            onOpenChange={(nextOpen) => setDevPreviewConsoleOpen(id, nextOpen)}
            activeTab={activeConsoleTab}
            onTabChange={(tab) => setDevPreviewConsoleTab(id, tab)}
            isRestarting={isRestarting}
            onHardRestart={handleHardRestart}
            onStop={stop}
          />
        )}
      </div>
    </ContentPanel>
  );
}
