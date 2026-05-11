import { Clock, RotateCcw, AlertTriangle } from "lucide-react";
import { InlineStatusBanner } from "./InlineStatusBanner";
import { boundedErrorText } from "@/utils/errorText";
import type { TerminalReconnectError } from "@/types";

export interface ReconnectErrorBannerProps {
  terminalId: string;
  error: TerminalReconnectError;
  onDismiss: (id: string) => void;
  onRestart: (id: string) => void;
  isRestarting?: boolean;
  className?: string;
}

function getErrorTitle(type: TerminalReconnectError["type"]): string {
  switch (type) {
    case "timeout":
      return "Reconnection timed out";
    case "not_found":
      return "Previous session not found";
    default:
      return "Reconnection failed";
  }
}

function getErrorSeverity(type: TerminalReconnectError["type"]): "warning" | "error" {
  switch (type) {
    case "timeout":
      return "warning";
    case "not_found":
    case "error":
      return "error";
    default:
      return "warning";
  }
}

function getErrorIcon(type: TerminalReconnectError["type"]) {
  switch (type) {
    case "timeout":
      return Clock;
    default:
      return AlertTriangle;
  }
}

export function ReconnectErrorBanner({
  terminalId,
  error,
  onDismiss,
  onRestart,
  isRestarting = false,
  className,
}: ReconnectErrorBannerProps) {
  return (
    <InlineStatusBanner
      icon={getErrorIcon(error.type)}
      title={getErrorTitle(error.type)}
      description={boundedErrorText(error.message)}
      severity={getErrorSeverity(error.type)}
      actions={[
        {
          id: "restart",
          label: "Restart",
          icon: RotateCcw,
          variant: "primary",
          onClick: () => onRestart(terminalId),
          title: "Restart terminal",
          ariaLabel: "Restart terminal",
          loading: isRestarting,
        },
      ]}
      onClose={() => onDismiss(terminalId)}
      className={className}
    />
  );
}
