import { cn } from "../../lib/utils";

/**
 * WorktreeCardSkeleton Component
 *
 * Skeleton placeholder that matches the 3-line status card structure of WorktreeCard
 * to prevent layout shift during initial worktree list loading.
 */
export function WorktreeCardSkeleton() {
  return (
    <div
      className={cn(
        "border rounded-lg p-3 mb-2",
        "border-transparent bg-white/5", // Match the inactive card style (transparent border, subtle bg)
        "motion-safe:animate-pulse motion-reduce:animate-none"
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading worktree"
    >
      <span className="sr-only">Loading worktree</span>

      {/* Line 1: Header (Status Icon + Branch + Actions) */}
      <div className="flex items-center justify-between gap-3 mb-2" aria-hidden="true">
        <div className="flex items-center gap-3 w-full">
          {/* Status Icon */}
          <div className="h-4 w-4 bg-muted/50 rounded-full shrink-0" />
          {/* Branch Name */}
          <div className="h-4 w-32 bg-muted/50 rounded" />
        </div>
        {/* Action buttons */}
        <div className="flex gap-1 shrink-0">
          <div className="h-4 w-4 bg-muted/30 rounded" />
          <div className="h-4 w-4 bg-muted/30 rounded" />
          <div className="h-4 w-4 bg-muted/30 rounded" />
        </div>
      </div>

      {/* Line 2: Meta Strip (Path | Metrics) */}
      <div className="mb-2" aria-hidden="true">
        <div className="h-3 w-3/4 bg-muted/30 rounded" />
      </div>

      {/* Line 3: Summary */}
      <div aria-hidden="true">
        <div className="h-3 w-full bg-muted/20 rounded" />
      </div>
    </div>
  );
}
