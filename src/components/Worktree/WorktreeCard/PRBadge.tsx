import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { CornerDownRight, GitPullRequest } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { usePRTooltip } from "@/hooks/useGitHubTooltip";
import { useGitHubBadgeTooltip } from "./hooks/useGitHubBadgeTooltip";
import { useGitHubBadgeFreshness } from "./hooks/useGitHubBadgeFreshness";
import { freshnessOpacityClass, freshnessSuffix } from "@/components/Layout/FreshnessUtils";
import { PRTooltipContent, TooltipLoading, TokenMissingTooltip } from "./GitHubTooltipContent";

interface PRBadgeProps {
  prNumber: number;
  prState?: "open" | "merged" | "closed";
  isSubordinate: boolean;
  worktreePath: string;
  onOpen?: () => void;
  isActive?: boolean;
  underlineOnHover?: boolean;
  rowLastUpdatedAt?: number;
}

export function PRBadge({
  prNumber,
  prState,
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
          aria-label={
            missingToken
              ? "Configure GitHub token to see PR details"
              : `Open ${prStateLabel} pull request #${prNumber} on GitHub`
          }
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
