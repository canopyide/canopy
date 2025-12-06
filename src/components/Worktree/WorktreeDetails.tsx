import { useMemo } from "react";
import type { WorktreeState, DevServerState } from "../../types";
import type { AppError, RetryAction } from "../../store/errorStore";
import { ErrorBanner } from "../Errors/ErrorBanner";
import { FileChangeList } from "./FileChangeList";
import { cn } from "../../lib/utils";
import { systemClient } from "@/clients";
import { Globe, Play, GitCommit, Square, Terminal } from "lucide-react";
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
  isFocused: boolean;
  showLastCommit?: boolean;
  terminalCounts?: {
    total: number;
    byState: {
      idle: number;
      working: number;
      waiting: number;
      completed: number;
      failed: number;
    };
  };

  onPathClick: () => void;
  onToggleServer: () => void;
  onDismissError: (id: string) => void;
  onRetryError: (id: string, action: RetryAction, args?: Record<string, unknown>) => Promise<void>;
}

function getServerStatusIndicator(serverState: DevServerState | null): React.ReactNode {
  if (!serverState) return null;
  switch (serverState.status) {
    case "stopped":
      return <span className="text-canopy-text/40">○</span>;
    case "starting":
      return <span className="text-[var(--color-server-starting)]">◐</span>;
    case "running":
      return <span className="text-[var(--color-server-running)]">●</span>;
    case "error":
      return <span className="text-[var(--color-server-error)]">●</span>;
    default:
      return <span className="text-canopy-text/40">○</span>;
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
  isFocused,
  terminalCounts,
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
    <div className="pt-2 mt-2 space-y-3">
      {/* Zone 1: Context & Narrative */}
      {effectiveNote && (
        <div className="bg-yellow-500/5 p-2 rounded border-l-2 border-yellow-500/30">
          <div className="text-xs text-canopy-text whitespace-pre-wrap font-mono">
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
        </div>
      )}

      {showLastCommit && rawLastCommitMsg && (
        <div className="text-xs text-canopy-text/60 italic flex gap-2 p-2 bg-white/[0.02] rounded">
          <GitCommit className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" />
          <div className="whitespace-pre-wrap leading-relaxed min-w-0">{rawLastCommitMsg}</div>
        </div>
      )}

      {/* Zone 2: Operational Controls (The "Cockpit") */}
      {(showDevServer && serverState) || (terminalCounts && terminalCounts.total > 0) ? (
        <div className="space-y-2 p-2 bg-white/[0.02] rounded border border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-canopy-text/60 font-semibold">
            Controls
          </div>

          {showDevServer && serverState && (
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-canopy-text/60 font-mono">
                <Globe className="w-3.5 h-3.5" />
                <div className="flex items-center gap-1.5">
                  {getServerStatusIndicator(serverState)}
                  <span>{getServerLabel(serverState)}</span>
                </div>
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
                  "px-2 py-1 rounded text-xs font-medium transition-colors",
                  serverState.status === "running"
                    ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                    : "bg-green-500/10 text-green-400 hover:bg-green-500/20",
                  (serverLoading || serverState.status === "starting") &&
                    "opacity-50 cursor-not-allowed"
                )}
              >
                {serverState.status === "running" ? (
                  <div className="flex items-center gap-1">
                    <Square className="w-3 h-3" />
                    <span>Stop</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Play className="w-3 h-3" />
                    <span>Start</span>
                  </div>
                )}
              </button>
            </div>
          )}

          {terminalCounts && terminalCounts.total > 0 && (
            <div className="flex items-center gap-2 text-xs text-canopy-text/60 font-mono">
              <Terminal className="w-3.5 h-3.5" />
              <span>
                {terminalCounts.total} terminal{terminalCounts.total !== 1 ? "s" : ""} active
              </span>
              {terminalCounts.byState.working > 0 && (
                <div className="flex items-center gap-1 text-[var(--color-status-success)]">
                  <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  <span>{terminalCounts.byState.working} running</span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

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
            <div className="text-[0.65rem] text-canopy-text/60 text-center">
              +{worktreeErrors.length - 3} more errors
            </div>
          )}
        </div>
      )}

      {/* Zone 3: The Work (Teleported File List) */}
      {hasChanges && worktree.worktreeChanges && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-canopy-text/60 font-semibold">
            Changed Files
          </div>
          <FileChangeList
            changes={worktree.worktreeChanges.changes}
            rootPath={worktree.worktreeChanges.rootPath}
            maxVisible={8}
          />
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
            "text-[0.7rem] text-canopy-text/60 hover:text-canopy-text/80 hover:underline text-left font-mono truncate block w-full",
            isFocused && "underline"
          )}
          title={worktree.path}
        >
          {displayPath}
        </button>
      </div>
    </div>
  );
}
