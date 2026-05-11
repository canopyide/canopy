import { FileEdit, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AgentCompletionBannerProps {
  onReview: () => void;
  onDismiss: () => void;
  className?: string;
}

export function AgentCompletionBanner({
  onReview,
  onDismiss,
  className,
}: AgentCompletionBannerProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 shrink-0",
        "bg-overlay-subtle border-t border-divider",
        className
      )}
      role="status"
      aria-label="Agent completed with file changes"
    >
      <div className="flex items-center gap-2 min-w-0">
        <FileEdit className="w-4 h-4 shrink-0 text-daintree-text/60" aria-hidden="true" />
        <span className="text-sm text-daintree-text truncate">
          Files changed, review when ready
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReview();
          }}
          className={cn(
            "px-2 py-1 text-xs font-medium rounded",
            "bg-daintree-border text-daintree-text hover:bg-daintree-border/80",
            "transition-colors",
            "outline-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daintree-accent"
          )}
        >
          Review
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label="Dismiss"
          className={cn(
            "p-1 rounded text-daintree-text/60 hover:text-daintree-text hover:bg-daintree-border/50",
            "transition-colors",
            "outline-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daintree-accent"
          )}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
