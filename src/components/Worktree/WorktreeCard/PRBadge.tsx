import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, CornerDownRight, GitPullRequest, XCircle } from "lucide-react";
import type { GitHubPRCIStatus } from "@shared/types/github";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { usePRTooltip } from "@/hooks/useGitHubTooltip";
import { useGitHubBadgeTooltip } from "./hooks/useGitHubBadgeTooltip";
import { useGitHubBadgeFreshness } from "./hooks/useGitHubBadgeFreshness";
import { freshnessOpacityClass, freshnessSuffix } from "@/components/Layout/FreshnessUtils";
import { PRTooltipContent, TooltipLoading, TokenMissingTooltip } from "./GitHubTooltipContent";

interface PRBadgeProps {
  prNumber: number;
  prState?: "open" | "merged" | "closed";
  prCiStatus?: GitHubPRCIStatus;
  isSubordinate: boolean;
  worktreePath: string;
  onOpen?: () => void;
  isActive?: boolean;
  underlineOnHover?: boolean;
  rowLastUpdatedAt?: number;
}

function prCIStatusVisual(
  status: GitHubPRCIStatus | undefined
): { Icon: typeof CheckCircle2; className: string; label: string } | null {
  switch (status) {
    case "SUCCESS":
      return { Icon: CheckCircle2, className: "text-status-success", label: "CI passing" };
    case "FAILURE":
    case "ERROR":
      return { Icon: XCircle, className: "text-status-error", label: "CI failing" };
    case "PENDING":
    case "EXPECTED":
      return { Icon: Clock, className: "text-status-warning", label: "CI pending" };
    default:
      return null;
  }
}

export function PRBadge({
  prNumber,
  prState,
  prCiStatus,
  isSubordinate,
  worktreePath,
  onOpen,
  isActive,
  underlineOnHover,
  rowLastUpdatedAt,
}: PRBadgeProps) {
  const { data, loading, error, missingToken, fetchTooltip, reset } = usePRTooltip(
    worktreePath,
    prNumber
  );

  const { isOpen, handleOpenChange, handleClick } = useGitHubBadgeTooltip({
    fetchTooltip,
    reset,
    missingToken,
    isActive: isActive ?? false,
    onOpen,
  });

  const { freshnessLevel, cacheLastUpdatedAt, now } = useGitHubBadgeFreshness(
    "pr",
    rowLastUpdatedAt
  );

  const prStateColor =
    prState === "merged"
      ? "text-github-merged"
      : prState === "closed"
        ? "text-github-closed"
        : "text-github-open";

  const prStateLabel = prState === "merged" ? "merged" : prState === "closed" ? "closed" : "open";

  const ciVisual = prCIStatusVisual(prCiStatus);

  const ariaLabel = missingToken
    ? "Configure GitHub token to see PR details"
    : ciVisual
      ? `Open ${prStateLabel} pull request #${prNumber} on GitHub — ${ciVisual.label}`
      : `Open ${prStateLabel} pull request #${prNumber} on GitHub`;

  const freshnessSuffixStr = useMemo(
    () => freshnessSuffix(freshnessLevel, cacheLastUpdatedAt, now),
    [freshnessLevel, cacheLastUpdatedAt, now]
  );

  return (
    <Tooltip open={isOpen} onOpenChange={handleOpenChange} delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          data-no-dnd
          className={cn(
            "flex items-center gap-1 text-xs text-left cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent min-w-0",
            freshnessOpacityClass(freshnessLevel)
          )}
          aria-disabled={!isActive || undefined}
          aria-label={ariaLabel}
        >
          {isSubordinate && (
            <CornerDownRight
              className={cn(
                "w-3 h-3 shrink-0",
                missingToken ? "grayscale opacity-50" : "text-text-muted"
              )}
              aria-hidden="true"
            />
          )}
          <GitPullRequest
            className={cn("w-3 h-3 shrink-0", missingToken ? "grayscale opacity-50" : prStateColor)}
            aria-hidden="true"
          />
          <span
            className={cn(
              "font-mono",
              underlineOnHover && "hover:underline",
              missingToken ? "text-text-muted" : prStateColor
            )}
          >
            #{prNumber}
          </span>
          {ciVisual && !missingToken && (
            <ciVisual.Icon
              className={cn("w-2.5 h-2.5 shrink-0", ciVisual.className)}
              aria-hidden="true"
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" className="p-3">
        {missingToken ? (
          <TokenMissingTooltip type="pr" />
        ) : loading ? (
          <TooltipLoading />
        ) : data ? (
          <PRTooltipContent data={data} />
        ) : error ? (
          <span className="text-xs text-text-secondary">Failed to load PR details</span>
        ) : (
          <span className="text-xs text-text-secondary">PR #{prNumber}</span>
        )}
        {freshnessSuffixStr && (
          <span className="block text-[11px] text-text-muted mt-1">{freshnessSuffixStr}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
