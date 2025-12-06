import { useMemo } from "react";
import type { WorktreeState, DevServerState } from "../../types";
import type { AppError, RetryAction } from "../../store/errorStore";
import { ErrorBanner } from "../Errors/ErrorBanner";
import { cn } from "../../lib/utils";
import { systemClient } from "@/clients";
import { Globe, Play, GitCommit } from "lucide-react";
import { parseNoteWithLinks, formatPath, type TextSegment } from "../../utils/textParsing";

export interface WorktreeDetailsProps {
  worktree: WorktreeState;
  homeDir?: string;
  effectiveNote?: string;
  showDevServer: boolean;
  serverState: DevServerState | null;
  serverLoading: boolean;
  worktreeErrors: AppError[];
  hasChanges: boolean;
  showFooter: boolean;
  isFocused: boolean;
  showLastCommit?: boolean;

  onPathClick: () => void;
  onToggleServer: () => void;
  onDismissError: (id: string) => void;
  onRetryError: (id: string, action: RetryAction, args?: Record<string, unknown>) => Promise<void>;
}

function getServerStatusIndicator(serverState: DevServerState | null): React.ReactNode {
  if (!serverState) return null;
  switch (serverState.status) {
    case "stopped":
      return <span className="text-gray-600">○</span>;
    case "starting":
      return <span className="text-[var(--color-server-starting)]">◐</span>;
    case "running":
      return <span className="text-[var(--color-server-running)]">●</span>;
    case "error":
      return <span className="text-[var(--color-server-error)]">●</span>;
    default:
      return <span className="text-gray-600">○</span>;
  }
}

function getServerLabel(serverState: DevServerState | null): string | null {
  if (!serverState) return null;
  if (serverState.status === "running" && serverState.url) {
    return serverState.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  if (serverState.status === "error") return "Error";
  if (serverState.status === "starting") return "Starting";
  return "Dev Server";
}

export function WorktreeDetails({
  worktree,
  homeDir,
  effectiveNote,
  showDevServer,
  serverState,
  serverLoading,
  worktreeErrors,
  hasChanges,
  showFooter,
  isFocused,
  onPathClick,
  onToggleServer,
  onDismissError,
  onRetryError,
  showLastCommit,
}: WorktreeDetailsProps) {
  const displayPath = formatPath(worktree.path, homeDir);
  const rawLastCommitMsg = worktree.worktreeChanges?.lastCommitMessage;

  const parsedNoteSegments: TextSegment[] = useMemo(() => {
    return effectiveNote ? parseNoteWithLinks(effectiveNote) : [];
  }, [effectiveNote]);

  const handleLinkClick = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    e.preventDefault();
    systemClient.openExternal(url);
  };

  return (
    <div
      className={cn(
        "pt-2 mt-2 space-y-2",
        (hasChanges || showFooter) && "border-t border-border/40"
      )}
    >
      {effectiveNote && (
        <div
          className={cn(
            "text-xs text-gray-400 bg-black/20 p-1.5 rounded border-l-2 border-gray-700 font-mono",
            "line-clamp-none whitespace-pre-wrap"
          )}
        >
          {parsedNoteSegments.map((segment, index) =>
            segment.type === "link" ? (
              <a
                key={index}
                href={segment.content}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-status-info)] underline hover:text-blue-300"
                onClick={(e) => handleLinkClick(e, segment.content)}
              >
                {segment.content}
              </a>
            ) : (
              <span key={index}>{segment.content}</span>
            )
          )}
        </div>
      )}

      {showDevServer && serverState && (
        <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
          <Globe className="w-3 h-3" />
          <div className="flex items-center gap-1">
            {getServerStatusIndicator(serverState)}
            <span className="truncate max-w-[120px]">{getServerLabel(serverState)}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!serverLoading && serverState.status !== "starting") {
                onToggleServer();
              }
            }}
            disabled={serverLoading || serverState.status === "starting"}
            className={cn(
              "ml-1 p-0.5 rounded hover:bg-gray-700 transition-colors",
              serverLoading ? "opacity-50" : ""
            )}
            title={serverState.status === "running" ? "Stop Server" : "Start Server"}
          >
            {serverState.status === "running" ? (
              <div className="w-1.5 h-1.5 bg-[var(--color-status-error)] rounded-sm" />
            ) : (
              <Play className="w-2 h-2 fill-current" />
            )}
          </button>
        </div>
      )}

      {worktreeErrors.length > 0 && (
        <div className="space-y-1">
          {worktreeErrors.slice(0, 3).map((error) => (
            <ErrorBanner
              key={error.id}
              error={error}
              onDismiss={onDismissError}
              onRetry={onRetryError}
              compact
            />
          ))}
          {worktreeErrors.length > 3 && (
            <div className="text-[0.65rem] text-gray-500 text-center">
              +{worktreeErrors.length - 3} more errors
            </div>
          )}
        </div>
      )}

      {/* Last Commit Message (if requested) */}
      {showLastCommit && rawLastCommitMsg && (
        <div className="text-xs text-gray-500 italic flex gap-1.5 mb-2">
          <div className="pt-0.5 shrink-0 opacity-70">
            <GitCommit className="w-3 h-3" />
          </div>
          <div className="whitespace-pre-wrap leading-normal min-w-0">
            {rawLastCommitMsg}
          </div>
        </div>
      )}

      {/* Folder path at the bottom */}
      <div className="pt-2 border-t border-border/40">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPathClick();
          }}
          className={cn(
            "text-[0.7rem] text-gray-500 hover:text-gray-400 hover:underline text-left font-mono truncate block",
            isFocused && "underline"
          )}
        >
          {displayPath}
        </button>
      </div>
    </div>
  );
}
