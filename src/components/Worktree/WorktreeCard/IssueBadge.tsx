import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { CircleDot } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { useIssueTooltip } from "@/hooks/useGitHubTooltip";
import { useGitHubBadgeTooltip } from "./hooks/useGitHubBadgeTooltip";
import { useGitHubBadgeFreshness } from "./hooks/useGitHubBadgeFreshness";
import { freshnessOpacityClass, freshnessSuffix } from "@/components/Layout/FreshnessUtils";
import { IssueTooltipContent, TooltipLoading, TokenMissingTooltip } from "./GitHubTooltipContent";

interface IssueBadgeProps {
  issueNumber: number;
  issueTitle?: string;
  worktreePath: string;
  onOpen?: () => void;
  isHeadline?: boolean;
  isActive?: boolean;
  underlineOnHover?: boolean;
  rowLastUpdatedAt?: number;
}

export const IssueBadge = memo(function IssueBadge({
  issueNumber,
  issueTitle,
  worktreePath,
  onOpen,
  isHeadline,
  isActive,
  underlineOnHover,
  rowLastUpdatedAt,
}: IssueBadgeProps) {
  const { data, loading, error, missingToken, fetchTooltip, reset } = useIssueTooltip(
    worktreePath,
    issueNumber
  );

  const { isOpen, handleOpenChange, handleClick } = useGitHubBadgeTooltip({
    fetchTooltip,
    reset,
    missingToken,
    isActive: isActive ?? false,
    onOpen,
  });

  const { freshnessLevel, cacheLastUpdatedAt, now } = useGitHubBadgeFreshness(
    "issue",
    rowLastUpdatedAt
  );

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
            "flex items-center gap-1.5 text-left cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent min-w-0",
            freshnessOpacityClass(freshnessLevel),
            isHeadline ? "text-[13px]" : "text-xs"
          )}
          aria-disabled={!isActive || undefined}
          aria-label={
            missingToken
              ? "Configure GitHub token to see issue details"
              : issueTitle
                ? `Open issue #${issueNumber}: ${issueTitle}`
                : `Open issue #${issueNumber} on GitHub`
          }
        >
          <CircleDot
            className={cn(
              "shrink-0",
              isHeadline ? "w-3.5 h-3.5" : "w-3 h-3",
              missingToken ? "grayscale opacity-50" : "text-github-open"
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              "truncate flex-1 min-w-0",
              underlineOnHover && "hover:underline",
              missingToken
                ? "text-text-muted"
                : isHeadline
                  ? isActive
                    ? "text-text-primary font-medium"
                    : "text-text-secondary font-medium"
                  : "text-text-primary/90"
            )}
          >
            {issueTitle || (
              <span
                className={cn("font-mono", missingToken ? "text-text-muted" : "text-github-open")}
              >
                #{issueNumber}
              </span>
            )}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" className="p-3">
        {missingToken ? (
          <TokenMissingTooltip type="issue" />
        ) : loading ? (
          <TooltipLoading />
        ) : data ? (
          <IssueTooltipContent data={data} />
        ) : error ? (
          <span className="text-xs text-text-secondary">Failed to load issue details</span>
        ) : (
          <span className="text-xs text-text-secondary">Issue #{issueNumber}</span>
        )}
        {freshnessSuffixStr && (
          <span className="block text-[11px] text-text-muted mt-1">{freshnessSuffixStr}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
});
