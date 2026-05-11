import { History, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SnapshotInfo } from "@shared/types/ipc/git";
import type { TierMismatchState } from "@/controllers/HelpSessionController";

interface HelpPanelBannersProps {
  showResumeBanner: boolean;
  preflightSnapshot: SnapshotInfo | null;
  tierMismatch: TierMismatchState | null;
  isApprovingTier: boolean;
  onDismissResume: () => void;
  onDismissSnapshot: () => void;
  onDismissTierMismatch: () => void;
  onApproveOnce: () => void;
  onAlwaysAllow: () => void;
}

export function HelpPanelBanners({
  showResumeBanner,
  preflightSnapshot,
  tierMismatch,
  isApprovingTier,
  onDismissResume,
  onDismissSnapshot,
  onDismissTierMismatch,
  onApproveOnce,
  onAlwaysAllow,
}: HelpPanelBannersProps) {
  return (
    <>
      {showResumeBanner && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "flex items-start gap-2 px-3 py-2 mx-3 mt-3 mb-1",
            "rounded-[var(--radius-md)] bg-overlay-subtle border border-daintree-border",
            "text-xs text-daintree-text/80"
          )}
          data-testid="help-resume-banner"
        >
          <span className="flex-1 select-text">Resumed your previous session.</span>
          <button
            type="button"
            onClick={onDismissResume}
            aria-label="Dismiss resume notice"
            className="text-daintree-text/50 hover:text-daintree-text transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-2"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {preflightSnapshot && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "flex items-start gap-2 px-3 py-2 mx-3 mt-3 mb-1",
            "rounded-[var(--radius-md)] bg-overlay-subtle border border-daintree-border",
            "text-xs text-daintree-text/80"
          )}
          data-testid="help-snapshot-banner"
        >
          <History
            className="w-3.5 h-3.5 shrink-0 mt-0.5 text-daintree-text/60"
            aria-hidden="true"
          />
          <span className="flex-1 select-text">
            Saved a snapshot of this worktree before any changes.
          </span>
          <button
            type="button"
            onClick={onDismissSnapshot}
            aria-label="Dismiss snapshot notice"
            className="text-daintree-text/50 hover:text-daintree-text transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-2"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {tierMismatch && (
        <div
          role="alert"
          className={cn(
            "flex flex-col gap-2 px-3 py-2.5 mx-3 mt-3 mb-1",
            "rounded-[var(--radius-md)]",
            "bg-status-warning/10 border border-status-warning/40",
            "text-xs text-daintree-text/85"
          )}
          data-testid="help-tier-mismatch-banner"
        >
          <div className="flex items-start gap-2">
            <ShieldAlert
              className="w-3.5 h-3.5 shrink-0 mt-0.5 text-status-warning"
              aria-hidden="true"
            />
            <div className="flex-1 select-text">
              <p className="font-medium text-daintree-text">Tool not permitted</p>
              <p className="mt-0.5 text-daintree-text/70">
                {tierMismatch.targetTier
                  ? `${tierMismatch.toolId} needs ${tierMismatch.targetTier} tier access.`
                  : `${tierMismatch.toolId} isn't available at any project tier.`}
              </p>
            </div>
            <button
              type="button"
              onClick={onDismissTierMismatch}
              aria-label="Dismiss tier mismatch notice"
              className="text-daintree-text/50 hover:text-daintree-text transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-2"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {tierMismatch.targetTier && (
            <div className="flex items-center gap-2 flex-wrap pl-5">
              <button
                type="button"
                onClick={onApproveOnce}
                disabled={isApprovingTier}
                className={cn(
                  "px-2 py-1 rounded-[var(--radius-sm)] text-xs font-medium",
                  "bg-daintree-text/10 hover:bg-daintree-text/15 text-daintree-text",
                  "disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-2"
                )}
              >
                Approve once
              </button>
              <button
                type="button"
                onClick={onAlwaysAllow}
                disabled={isApprovingTier}
                className={cn(
                  "px-2 py-1 rounded-[var(--radius-sm)] text-xs font-medium",
                  "bg-daintree-text/5 hover:bg-daintree-text/10 text-daintree-text/85",
                  "disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-2"
                )}
              >
                Always allow for this project
              </button>
              <button
                type="button"
                onClick={onDismissTierMismatch}
                disabled={isApprovingTier}
                className={cn(
                  "px-2 py-1 rounded-[var(--radius-sm)] text-xs",
                  "text-daintree-text/65 hover:text-daintree-text",
                  "disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-2"
                )}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
