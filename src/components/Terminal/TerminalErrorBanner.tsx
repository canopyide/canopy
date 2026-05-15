import { XCircle, RotateCcw, FolderEdit, Trash2 } from "lucide-react";
import { InlineStatusBanner, type BannerAction } from "./InlineStatusBanner";
import { sanitizeErrorText, boundedErrorText } from "@/utils/errorText";
import type { TerminalRestartError } from "@/types";

export interface TerminalErrorBannerProps {
  terminalId: string;
  error: TerminalRestartError;
  onUpdateCwd: (id: string) => void;
  onRetry: (id: string) => void;
  onTrash: (id: string) => void;
  isRestarting?: boolean;
  className?: string;
}

export function TerminalErrorBanner({
  terminalId,
  error,
  onUpdateCwd,
  onRetry,
  onTrash,
  isRestarting = false,
  className,
}: TerminalErrorBannerProps) {
  const isCwdError = error.code === "ENOENT" && error.context?.failedCwd;

  const actions: BannerAction[] = [];
  if (error.recoverable && isCwdError) {
    actions.push({
      id: "update-cwd",
      label: "Change directory",
      icon: FolderEdit,
      variant: "accent",
      onClick: () => onUpdateCwd(terminalId),
      title: "Change working directory",
      ariaLabel: "Update working directory",
      disabled: isRestarting,
    });
  }
  actions.push(
    {
      id: "retry",
      label: "Retry",
      icon: RotateCcw,
      variant: "primary",
      onClick: () => onRetry(terminalId),
      title: "Retry restart",
      ariaLabel: "Retry restart",
      loading: isRestarting,
    },
    {
      id: "trash",
      label: "Remove terminal",
      icon: Trash2,
      variant: "danger",
      onClick: () => onTrash(terminalId),
      title: "Move to trash",
      ariaLabel: "Move to trash",
      disabled: isRestarting,
    }
  );

  return (
    <InlineStatusBanner
      icon={XCircle}
      title="Terminal restart failed"
      description={boundedErrorText(error.message)}
      contextLine={
        error.context?.failedCwd
          ? `Directory: ${sanitizeErrorText(error.context.failedCwd)}`
          : undefined
      }
      severity="error"
      actions={actions}
      className={className}
    />
  );
}
