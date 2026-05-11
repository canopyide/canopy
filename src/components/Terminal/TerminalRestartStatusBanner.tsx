import { AlertTriangle, RotateCcw } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { InlineStatusBanner } from "./InlineStatusBanner";
import type { RestartBannerVariant } from "./restartStatus";

export interface TerminalRestartStatusBannerProps {
  variant: RestartBannerVariant;
  onRestart: () => void;
  onDismiss: () => void;
}

export function TerminalRestartStatusBanner({
  variant,
  onRestart,
  onDismiss,
}: TerminalRestartStatusBannerProps) {
  switch (variant.type) {
    case "none":
      return null;

    case "auto-restarting":
      return (
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-daintree-text/60 bg-status-info/10 border-b border-daintree-border shrink-0"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <Spinner size="xs" className="text-activity-working" />
          <span>Auto-restarting…</span>
        </div>
      );

    case "exit-error":
      return (
        <InlineStatusBanner
          icon={AlertTriangle}
          title={`Session exited with code ${variant.exitCode}`}
          severity="error"
          animated={false}
          actions={[
            {
              id: "restart",
              label: "Restart session",
              icon: RotateCcw,
              variant: "dangerFilled",
              onClick: onRestart,
              title: "Restart session",
              ariaLabel: "Restart session",
            },
          ]}
          onClose={onDismiss}
        />
      );
  }
}
