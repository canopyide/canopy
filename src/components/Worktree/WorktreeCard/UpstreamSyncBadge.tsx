import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { actionService } from "@/services/ActionService";
import { useDeferredLoading } from "@/hooks/useDeferredLoading";
import { UI_SKELETON_GATE_MS } from "@/lib/animationUtils";

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatLastFetched(epochMs: number, now: number = Date.now()): string {
  const deltaSeconds = Math.round((epochMs - now) / 1000);
  const absSeconds = Math.abs(deltaSeconds);
  if (absSeconds < 60) return RELATIVE_TIME_FORMATTER.format(deltaSeconds, "second");
  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (Math.abs(deltaMinutes) < 60) return RELATIVE_TIME_FORMATTER.format(deltaMinutes, "minute");
  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) return RELATIVE_TIME_FORMATTER.format(deltaHours, "hour");
  const deltaDays = Math.round(deltaHours / 24);
  return RELATIVE_TIME_FORMATTER.format(deltaDays, "day");
}

interface UpstreamSyncBadgeProps {
  aheadCount: number | undefined;
  behindCount: number | undefined;
  isFetchInFlight: boolean;
  lastFetchedAt: number | null | undefined;
  fetchAuthFailed: boolean;
  fetchNetworkFailed: boolean;
  isGitHubRemote: boolean;
  containerGapClass: string;
}

export function UpstreamSyncBadge({
  aheadCount,
  behindCount,
  isFetchInFlight,
  lastFetchedAt,
  fetchAuthFailed,
  fetchNetworkFailed,
  isGitHubRemote,
  containerGapClass,
}: UpstreamSyncBadgeProps) {
  const hasAhead = aheadCount !== undefined && aheadCount > 0;
  const hasBehind = behindCount !== undefined && behindCount > 0;
  const showPulse = useDeferredLoading(isFetchInFlight, UI_SKELETON_GATE_MS);

  const handleSignInClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    void actionService.dispatch(
      "app.settings.openTab",
      { tab: "github", sectionId: "github-token" },
      { source: "user" }
    );
  }, []);

  if (fetchAuthFailed && isGitHubRemote) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleSignInClick}
            data-no-dnd
            className={cn(
              "flex items-center text-[10px] font-mono tabular-nums cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent",
              containerGapClass
            )}
            data-testid="upstream-sync-indicator"
            data-fetch-auth-failed="true"
            aria-label="GitHub authentication failed — click to reconnect"
          >
            <span className="flex items-center gap-1.5 grayscale opacity-50 text-text-primary/50">
              {hasAhead && <span>↑{aheadCount}</span>}
              {hasBehind && <span>↓{behindCount}</span>}
              {!hasAhead && !hasBehind && <span>—</span>}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          <div>GitHub authentication failed</div>
          <div className="text-daintree-text/70 mt-0.5">Click to reconnect GitHub</div>
          {lastFetchedAt != null && (
            <div className="text-text-muted">Last fetched {formatLastFetched(lastFetchedAt)}</div>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!hasAhead && !hasBehind) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "flex items-center text-[10px] font-mono tabular-nums",
            containerGapClass,
            isFetchInFlight && showPulse && "animate-pulse-immediate"
          )}
          data-testid="upstream-sync-indicator"
          data-fetch-in-flight={isFetchInFlight ? "true" : undefined}
        >
          {hasAhead && <span className="text-status-success">↑{aheadCount}</span>}
          {hasBehind && <span className="text-status-warning">↓{behindCount}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        <div>
          {hasAhead && (
            <span>
              {aheadCount} commit{aheadCount !== 1 ? "s" : ""} ahead
            </span>
          )}
          {hasAhead && hasBehind && <span>, </span>}
          {hasBehind && (
            <span>
              {behindCount} commit{behindCount !== 1 ? "s" : ""} behind
            </span>
          )}
          <span> upstream</span>
        </div>
        {fetchNetworkFailed && (
          <div className="text-status-warning/80" data-testid="upstream-sync-network-warning">
            Couldn't reach origin
          </div>
        )}
        {lastFetchedAt != null && (
          <div className="text-text-muted">Last fetched {formatLastFetched(lastFetchedAt)}</div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
