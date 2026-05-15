import { FileEdit } from "lucide-react";
import { InlineStatusBanner } from "./InlineStatusBanner";

export interface AgentCompletionBannerProps {
  /**
   * Number of changed files in the worktree. Drives the artifact-first copy
   * ("3 files changed, review when ready"). When omitted or zero, falls back
   * to a generic phrasing so the banner stays sensible if the count isn't
   * available yet.
   */
  fileCount?: number;
  onReview: () => void;
  onDismiss: () => void;
  className?: string;
}

function formatBannerCopy(fileCount: number | undefined): string {
  if (fileCount == null || fileCount <= 0) {
    return "Files changed, review when ready";
  }
  const noun = fileCount === 1 ? "file" : "files";
  return `${fileCount} ${noun} changed, review when ready`;
}

export function AgentCompletionBanner({
  fileCount,
  onReview,
  onDismiss,
  className,
}: AgentCompletionBannerProps) {
  return (
    <InlineStatusBanner
      icon={FileEdit}
      title={formatBannerCopy(fileCount)}
      severity="neutral"
      role="status"
      className={className ? `border-t border-divider ${className}` : "border-t border-divider"}
      actions={[
        {
          id: "review",
          label: "Review",
          variant: "primary",
          onClick: onReview,
        },
      ]}
      onClose={onDismiss}
    />
  );
}
