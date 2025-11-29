/**
 * ArtifactOverlay Component
 *
 * Floating overlay showing extracted artifacts from agent output in a terminal.
 * Displays a compact badge that expands to show artifact details and actions.
 */

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useArtifacts } from "@/hooks/useArtifacts";
import type { Artifact } from "@shared/types";

interface ArtifactOverlayProps {
  terminalId: string;
  worktreeId?: string;
  cwd?: string;
  className?: string;
}

const ARTIFACT_TYPE_COLORS: Record<string, string> = {
  code: "border-blue-500 bg-blue-500/10 text-[var(--color-status-info)]",
  patch: "border-green-500 bg-green-500/10 text-[var(--color-status-success)]",
  file: "border-purple-500 bg-purple-500/10 text-purple-400",
  summary: "border-yellow-500 bg-yellow-500/10 text-[var(--color-status-warning)]",
  other: "border-gray-500 bg-gray-500/10 text-gray-400",
};

const ARTIFACT_TYPE_ICONS: Record<string, string> = {
  code: "{ }",
  patch: "+/-",
  file: "[ ]",
  summary: "#",
  other: "...",
};

interface ArtifactItemProps {
  artifact: Artifact;
  onCopy: (artifact: Artifact) => Promise<boolean>;
  onSave: (artifact: Artifact) => Promise<{ filePath: string; success: boolean } | null>;
  onApplyPatch: (
    artifact: Artifact
  ) => Promise<{ success: boolean; error?: string; modifiedFiles?: string[] }>;
  canApplyPatch: boolean;
  isProcessing: boolean;
}

function ArtifactItem({
  artifact,
  onCopy,
  onSave,
  onApplyPatch,
  canApplyPatch,
  isProcessing,
}: ArtifactItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const showFeedback = useCallback((message: string) => {
    setFeedbackMessage(message);
    setTimeout(() => setFeedbackMessage(null), 2000);
  }, []);

  const handleCopy = useCallback(async () => {
    const success = await onCopy(artifact);
    if (success) {
      showFeedback("Copied!");
    } else {
      showFeedback("Copy failed");
    }
  }, [artifact, onCopy, showFeedback]);

  const handleSave = useCallback(async () => {
    const result = await onSave(artifact);
    if (result) {
      showFeedback("Saved!");
    } else {
      showFeedback("Save failed");
    }
  }, [artifact, onSave, showFeedback]);

  const handleApplyPatch = useCallback(async () => {
    const result = await onApplyPatch(artifact);
    if (result.success) {
      showFeedback("Patch applied!");
    } else {
      showFeedback(result.error || "Patch failed");
    }
  }, [artifact, onApplyPatch, showFeedback]);

  const colorClass = ARTIFACT_TYPE_COLORS[artifact.type] || ARTIFACT_TYPE_COLORS.other;
  const icon = ARTIFACT_TYPE_ICONS[artifact.type] || ARTIFACT_TYPE_ICONS.other;
  const title = artifact.filename || artifact.language || artifact.type;
  const previewLines = artifact.content.split("\n").slice(0, 2);
  const hasMore = artifact.content.split("\n").length > 2;
  const lineCount = artifact.content.split("\n").length;

  return (
    <div className={cn("border rounded-md overflow-hidden", colorClass.split(" ")[0])}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 text-left",
          colorClass.split(" ")[1],
          "hover:brightness-110 transition-all"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("font-mono text-xs shrink-0", colorClass.split(" ")[2])}>{icon}</span>
          <span className="text-sm text-gray-200 font-medium truncate">{title}</span>
          {artifact.language && artifact.language !== artifact.type && (
            <span className="text-xs text-gray-500 shrink-0">{artifact.language}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-500">
            {lineCount} line{lineCount !== 1 ? "s" : ""}
          </span>
          <span className="text-gray-400">{isExpanded ? "▼" : "▶"}</span>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="bg-gray-900/50">
          {/* Preview */}
          <pre className="font-mono text-xs p-3 overflow-x-auto max-h-32 overflow-y-auto">
            <code className="text-gray-300">
              {previewLines.join("\n")}
              {hasMore && <span className="text-gray-500">{"\n"}...</span>}
            </code>
          </pre>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 border-t border-gray-700">
            <button
              onClick={handleCopy}
              disabled={isProcessing}
              className={cn(
                "px-3 py-1 text-xs rounded transition-colors",
                "bg-blue-600 hover:bg-blue-700 text-white",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              Copy Code
            </button>
            <button
              onClick={handleSave}
              disabled={isProcessing}
              className={cn(
                "px-3 py-1 text-xs rounded transition-colors",
                "bg-gray-600 hover:bg-gray-700 text-white",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              Save to File
            </button>
            {artifact.type === "patch" && (
              <button
                onClick={handleApplyPatch}
                disabled={isProcessing || !canApplyPatch}
                className={cn(
                  "px-3 py-1 text-xs rounded transition-colors",
                  "bg-green-600 hover:bg-green-700 text-white",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
                title={!canApplyPatch ? "No worktree context available" : "Apply patch to worktree"}
              >
                Apply Patch
              </button>
            )}
            {feedbackMessage && (
              <span className="ml-auto text-xs text-[var(--color-status-success)] animate-pulse">
                {feedbackMessage}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ArtifactOverlay({ terminalId, worktreeId, cwd, className }: ArtifactOverlayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    artifacts,
    actionInProgress,
    hasArtifacts,
    copyToClipboard,
    saveToFile,
    applyPatch,
    clearArtifacts,
    canApplyPatch,
  } = useArtifacts(terminalId, worktreeId, cwd);

  const handleCopy = useCallback(
    async (artifact: Artifact) => {
      return await copyToClipboard(artifact);
    },
    [copyToClipboard]
  );

  const handleSave = useCallback(
    async (artifact: Artifact) => {
      return await saveToFile(artifact);
    },
    [saveToFile]
  );

  const handleApplyPatch = useCallback(
    async (artifact: Artifact) => {
      return await applyPatch(artifact);
    },
    [applyPatch]
  );

  if (!hasArtifacts) {
    return null;
  }

  return (
    <div className={cn("absolute bottom-4 right-4 z-10", className)}>
      {!isExpanded ? (
        // Compact Badge
        <button
          onClick={() => setIsExpanded(true)}
          className={cn(
            "px-3 py-2 rounded-md shadow-lg",
            "bg-blue-600 hover:bg-blue-700 text-white",
            "text-sm font-medium transition-all",
            "flex items-center gap-2"
          )}
        >
          <span className="font-mono">{}</span>
          <span>
            {artifacts.length} artifact{artifacts.length !== 1 ? "s" : ""}
          </span>
        </button>
      ) : (
        // Expanded Overlay
        <div
          className={cn(
            "bg-gray-800 border border-gray-700 rounded-lg shadow-2xl",
            "w-96 max-h-96 flex flex-col overflow-hidden"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[var(--color-status-info)]">{}</span>
              <span className="text-sm font-medium text-gray-200">
                {artifacts.length} Artifact{artifacts.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearArtifacts}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                ×
              </button>
            </div>
          </div>

          {/* Artifact List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {artifacts.map((artifact) => (
              <ArtifactItem
                key={artifact.id}
                artifact={artifact}
                onCopy={handleCopy}
                onSave={handleSave}
                onApplyPatch={handleApplyPatch}
                canApplyPatch={canApplyPatch(artifact)}
                isProcessing={actionInProgress === artifact.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ArtifactOverlay;
