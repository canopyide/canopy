import React from "react";
import { AlertTriangle, RotateCcw, FolderEdit, Trash2 } from "lucide-react";
import { InlineStatusBanner, type BannerAction } from "./InlineStatusBanner";
import type { SpawnError } from "@/types";

export interface SpawnErrorBannerProps {
  terminalId: string;
  error: SpawnError;
  cwd?: string;
  onUpdateCwd: (id: string) => void;
  onRetry: (id: string) => void;
  onTrash: (id: string) => void;
  className?: string;
}

function getErrorTitle(code: SpawnError["code"]): string {
  switch (code) {
    case "ENOENT":
      return "Couldn't find shell or command";
    case "EACCES":
      return "Couldn't execute shell";
    case "ENOTDIR":
      return "Invalid working directory";
    case "EIO":
      return "Couldn't allocate terminal";
    case "EMFILE":
      return "File descriptor limit reached";
    case "EAGAIN":
      return "Process limit reached";
    case "ENOMEM":
      return "Out of memory";
    case "ENXIO":
      return "PTY pool exhausted";
    case "EBUSY":
      return "Terminal device busy";
    case "DISCONNECTED":
      return "Terminal disconnected";
    default:
      return "Couldn't start terminal";
  }
}

function getErrorDescription(error: SpawnError, cwd?: string): string {
  switch (error.code) {
    case "ENOENT":
      if (error.path) {
        return `Couldn't find: ${error.path}`;
      }
      return error.message;
    case "EACCES":
      return `Couldn't execute ${error.path || "the shell"} — check permissions`;
    case "ENOTDIR":
      return `The working directory isn't valid: ${cwd || "(unknown)"}`;
    case "EIO":
      return "Couldn't allocate a terminal session. The system may be running low on resources.";
    case "EMFILE":
      return "The per-process file descriptor limit was reached. Try closing some terminals to free up descriptors.";
    case "EAGAIN":
      return "The system process limit was hit (fork failed). Wait a moment and retry, or close some terminals.";
    case "ENOMEM":
      return "The system is out of memory. Try closing other applications to free up memory.";
    case "ENXIO":
      return "The pseudo-terminal pool is exhausted. Try closing some terminals and retrying.";
    case "EBUSY":
      return "The terminal device is busy. Retry or close the conflicting terminal.";
    case "DISCONNECTED":
      return "The terminal process is no longer running.";
    default:
      return error.message;
  }
}

function SpawnErrorBannerComponent({
  terminalId,
  error,
  cwd,
  onUpdateCwd,
  onRetry,
  onTrash,
  className,
}: SpawnErrorBannerProps) {
  const isCwdError = error.code === "ENOTDIR";

  const actions: BannerAction[] = [];
  if (isCwdError) {
    actions.push({
      id: "update-cwd",
      label: "Change directory",
      icon: FolderEdit,
      variant: "accent",
      onClick: () => onUpdateCwd(terminalId),
      title: "Change working directory",
      ariaLabel: "Update working directory",
    });
  }
  actions.push(
    {
      id: "retry",
      label: "Retry",
      icon: RotateCcw,
      variant: "primary",
      onClick: () => onRetry(terminalId),
      title: "Retry",
      ariaLabel: "Retry starting terminal",
    },
    {
      id: "trash",
      label: "Trash",
      icon: Trash2,
      variant: "danger",
      onClick: () => onTrash(terminalId),
      title: "Move to trash",
      ariaLabel: "Move to trash",
    }
  );

  return (
    <InlineStatusBanner
      icon={AlertTriangle}
      title={getErrorTitle(error.code)}
      description={getErrorDescription(error, cwd)}
      contextLine={cwd && `Directory: ${cwd}`}
      severity="error"
      actions={actions}
      className={className}
    />
  );
}

export const SpawnErrorBanner = React.memo(SpawnErrorBannerComponent);
