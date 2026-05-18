import { ExternalLink, Copy, Check, Loader2, X, AlertTriangle } from "lucide-react";
import { useState, useCallback } from "react";
import { extractUrlParts, looksLikeOAuthUrl, isSafeNavigationUrl } from "@shared/utils/urlUtils";
import { safeFireAndForget } from "@/utils/safeFireAndForget";
import type { SessionStorageEntry } from "./useDevPreviewLoadLifecycle";

export type OAuthPhase =
  | { phase: "started" }
  | { phase: "token-exchange-intercepted" }
  | { phase: "completed"; callbackUrl: string; success: boolean }
  | { phase: "timed-out" }
  | { phase: "error"; message: string };

export interface BlockedNavBannerProps {
  blockedNav: {
    url: string;
    canOpenExternal: boolean;
    sessionStorageSnapshot: SessionStorageEntry[];
  };
  panelId: string;
  webviewElement: Electron.WebviewTag | null;
  oauthPhase: OAuthPhase | null;
  onDismiss: () => void;
  onStartOAuth: () => void;
  onCancelOAuth: () => void;
  onRetryOAuth: () => void;
}

function UrlDisplay({ url }: { url: string }) {
  const urlParts = extractUrlParts(url);

  if (!urlParts) {
    return <span className="font-mono truncate">{url}</span>;
  }

  const { subdomain, registrableDomain } = urlParts;

  let pathAndQuery = "";
  try {
    const parsed = new URL(url);
    pathAndQuery = parsed.pathname + parsed.search + parsed.hash;
  } catch {
    // fall through — show hostname only
  }

  const domainDisplay = urlParts.isIp ? (
    <span className="font-bold">{registrableDomain}</span>
  ) : subdomain ? (
    <>
      <span className="opacity-50">{subdomain}.</span>
      <span className="font-bold">{registrableDomain}</span>
    </>
  ) : (
    <span className="font-bold">{registrableDomain}</span>
  );

  return (
    <span className="font-mono truncate">
      {domainDisplay}
      {pathAndQuery && <span className="opacity-50">{pathAndQuery}</span>}
    </span>
  );
}

function OAuthStatusRow({
  phase,
  onCancelOAuth,
  onRetryOAuth,
}: {
  phase: OAuthPhase;
  onCancelOAuth: () => void;
  onRetryOAuth: () => void;
}) {
  switch (phase.phase) {
    case "started":
      return (
        <div className="flex items-center gap-2 text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="text-daintree-text/70">Connecting to identity provider...</span>
          <button
            type="button"
            onClick={onCancelOAuth}
            className="shrink-0 px-2 py-0.5 rounded text-xs bg-status-warning/20 hover:bg-status-warning/30 text-daintree-text/90 transition-colors"
          >
            Cancel
          </button>
        </div>
      );
    case "token-exchange-intercepted":
      return (
        <div className="flex items-center gap-2 text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="text-daintree-text/70">Signing in...</span>
          <button
            type="button"
            onClick={onCancelOAuth}
            className="shrink-0 px-2 py-0.5 rounded text-xs bg-status-warning/20 hover:bg-status-warning/30 text-daintree-text/90 transition-colors"
          >
            Cancel
          </button>
        </div>
      );
    case "completed":
      return phase.success ? (
        <div className="flex items-center gap-2 text-xs">
          <Check className="h-3 w-3 text-green-400" />
          <span className="text-daintree-text/70">Sign in completed</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          <AlertTriangle className="h-3 w-3 text-status-warning" />
          <span className="text-daintree-text/70">Authorization denied</span>
          <button
            type="button"
            onClick={onRetryOAuth}
            className="shrink-0 px-2 py-0.5 rounded text-xs bg-status-warning/20 hover:bg-status-warning/30 text-daintree-text/90 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    case "timed-out":
      return (
        <div className="flex items-center gap-2 text-xs">
          <AlertTriangle className="h-3 w-3 text-status-warning" />
          <span className="text-daintree-text/70">Sign in timed out</span>
          <button
            type="button"
            onClick={onRetryOAuth}
            className="shrink-0 px-2 py-0.5 rounded text-xs bg-status-warning/20 hover:bg-status-warning/30 text-daintree-text/90 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    case "error":
      return (
        <div className="flex items-center gap-2 text-xs">
          <AlertTriangle className="h-3 w-3 text-status-warning" />
          <span className="text-daintree-text/70">Sign-in didn't complete</span>
          <button
            type="button"
            onClick={onRetryOAuth}
            className="shrink-0 px-2 py-0.5 rounded text-xs bg-status-warning/20 hover:bg-status-warning/30 text-daintree-text/90 transition-colors"
          >
            Try again
          </button>
        </div>
      );
  }
}

export function BlockedNavBanner({
  blockedNav,
  panelId: _panelId,
  webviewElement: _webviewElement,
  oauthPhase,
  onDismiss,
  onStartOAuth,
  onCancelOAuth,
  onRetryOAuth,
}: BlockedNavBannerProps) {
  const [copied, setCopied] = useState(false);
  const COPY_FEEDBACK_MS = 2000;

  const handleCopyUrl = useCallback(async () => {
    try {
      await window.electron.clipboard.writeText(blockedNav.url);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard unavailable
    }
  }, [blockedNav.url]);

  const isOAuth = looksLikeOAuthUrl(blockedNav.url);
  const canOpenExternal = isSafeNavigationUrl(blockedNav.url);
  const isOAuthInFlight =
    oauthPhase?.phase === "started" || oauthPhase?.phase === "token-exchange-intercepted";

  return (
    <div className="flex flex-col gap-1 px-3 py-1.5 text-xs bg-status-warning/10 border-b border-status-warning/20 text-daintree-text/80">
      <div className="flex items-center gap-2 min-w-0">
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-status-warning" />
        <span className="truncate min-w-0 flex items-center gap-1.5">
          <span className="text-daintree-text/50 shrink-0">
            Navigation to external site blocked:
          </span>
          <UrlDisplay url={blockedNav.url} />
        </span>
        <button
          type="button"
          onClick={handleCopyUrl}
          className="shrink-0 text-daintree-text/40 hover:text-daintree-text/70 transition-colors"
          aria-label="Copy URL"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
        {!isOAuthInFlight && (
          <>
            {isOAuth ? (
              <button
                type="button"
                onClick={onStartOAuth}
                className="shrink-0 px-2 py-0.5 rounded text-xs bg-status-warning/20 hover:bg-status-warning/30 text-daintree-text/90 transition-colors"
              >
                Sign in via browser
              </button>
            ) : canOpenExternal ? (
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
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      {oauthPhase && (
        <OAuthStatusRow
          phase={oauthPhase}
          onCancelOAuth={onCancelOAuth}
          onRetryOAuth={onRetryOAuth}
        />
      )}
    </div>
  );
}
