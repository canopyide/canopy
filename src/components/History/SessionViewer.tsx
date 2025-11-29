/**
 * SessionViewer Component
 *
 * Displays a full agent session with transcript, artifacts, and metadata.
 * Provides export and resume functionality.
 */

import { useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ArtifactList } from "./ArtifactList";
import type { AgentSession } from "@shared/types";

interface SessionViewerProps {
  session: AgentSession;
  onResume?: (session: AgentSession) => void;
  onExport?: (sessionId: string, format: "json" | "markdown") => Promise<void>;
  onClose?: () => void;
  className?: string;
}

type TabId = "transcript" | "artifacts";

const AGENT_COLORS: Record<string, string> = {
  claude: "text-orange-400",
  gemini: "text-[var(--color-status-info)]",
  custom: "text-purple-400",
};

const STATE_COLORS: Record<string, string> = {
  active: "text-[var(--color-status-warning)]",
  completed: "text-[var(--color-status-success)]",
  failed: "text-[var(--color-status-error)]",
};

function formatDuration(startTime: number, endTime?: number): string {
  const end = endTime || Date.now();
  const durationMs = end - startTime;
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

export function SessionViewer({
  session,
  onResume,
  onExport,
  onClose,
  className,
}: SessionViewerProps) {
  const [activeTab, setActiveTab] = useState<TabId>("transcript");
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "markdown">("markdown");

  // Combine transcript entries for display
  const transcriptText = useMemo(() => {
    return session.transcript
      .map((entry) => {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        return `[${time}] ${entry.type}: ${entry.content}`;
      })
      .join("\n\n");
  }, [session.transcript]);

  const handleExport = useCallback(async () => {
    if (!onExport || isExporting) return;

    setIsExporting(true);
    try {
      await onExport(session.id, exportFormat);
    } finally {
      setIsExporting(false);
    }
  }, [onExport, session.id, exportFormat, isExporting]);

  const handleCopyTranscript = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(transcriptText);
    } catch (error) {
      console.error("Failed to copy transcript:", error);
    }
  }, [transcriptText]);

  const agentColor = AGENT_COLORS[session.agentType] || AGENT_COLORS.custom;
  const stateColor = STATE_COLORS[session.state] || STATE_COLORS.active;

  return (
    <div className={cn("flex flex-col bg-gray-900 rounded-lg overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={cn("font-semibold capitalize", agentColor)}>{session.agentType}</span>
            <span className={cn("text-sm", stateColor)}>
              {session.state === "completed"
                ? "Completed"
                : session.state === "failed"
                  ? "Failed"
                  : "Active"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onExport && (
            <div className="flex items-center gap-1">
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as "json" | "markdown")}
                className="text-xs px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-300"
              >
                <option value="markdown">Markdown</option>
                <option value="json">JSON</option>
              </select>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className={cn(
                  "text-xs px-3 py-1 rounded border transition-colors",
                  "border-gray-600 text-gray-300 hover:bg-gray-700",
                  isExporting && "opacity-50 cursor-not-allowed"
                )}
              >
                {isExporting ? "..." : "Export"}
              </button>
            </div>
          )}
          {onResume && session.state !== "active" && (
            <button
              onClick={() => onResume(session)}
              className={cn(
                "text-xs px-3 py-1 rounded border transition-colors",
                "border-green-600 text-[var(--color-status-success)] hover:bg-green-900"
              )}
            >
              Resume
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 px-2"
              title="Close"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="px-4 py-2 border-b border-gray-700/50 bg-gray-800/30 text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
        <span>Started: {formatRelativeTime(session.startTime)}</span>
        <span>Duration: {formatDuration(session.startTime, session.endTime)}</span>
        {session.worktreeId && <span>Worktree: {session.worktreeId}</span>}
        <span>Artifacts: {session.artifacts.length}</span>
        {session.metadata?.exitCode !== undefined && (
          <span
            className={
              session.metadata.exitCode === 0
                ? "text-[var(--color-status-success)]"
                : "text-[var(--color-status-error)]"
            }
          >
            Exit: {session.metadata.exitCode}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab("transcript")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "transcript"
              ? "text-[var(--color-status-info)] border-b-2 border-blue-400"
              : "text-gray-400 hover:text-gray-200"
          )}
        >
          Transcript ({session.transcript.length})
        </button>
        <button
          onClick={() => setActiveTab("artifacts")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "artifacts"
              ? "text-[var(--color-status-info)] border-b-2 border-blue-400"
              : "text-gray-400 hover:text-gray-200"
          )}
        >
          Artifacts ({session.artifacts.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "transcript" ? (
          <div className="relative">
            <button
              onClick={handleCopyTranscript}
              className={cn(
                "absolute top-2 right-2 px-2 py-1 text-xs rounded z-10",
                "bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors"
              )}
            >
              Copy
            </button>
            <div className="p-4 space-y-4">
              {session.transcript.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No transcript entries</div>
              ) : (
                session.transcript.map((entry, index) => (
                  <div
                    key={`${entry.timestamp}-${index}`}
                    className={cn(
                      "rounded-md p-3",
                      entry.type === "user" && "bg-blue-900/20 border border-blue-700/30",
                      entry.type === "agent" && "bg-gray-800/50 border border-gray-700/30",
                      entry.type === "system" && "bg-gray-700/30 border border-gray-600/30"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2 text-xs">
                      <span
                        className={cn(
                          "font-medium capitalize",
                          entry.type === "user" && "text-[var(--color-status-info)]",
                          entry.type === "agent" && agentColor,
                          entry.type === "system" && "text-gray-500"
                        )}
                      >
                        {entry.type}
                      </span>
                      <span className="text-gray-500">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono overflow-x-auto">
                      {entry.content}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="p-4">
            <ArtifactList artifacts={session.artifacts} />
          </div>
        )}
      </div>
    </div>
  );
}
