/**
 * ArtifactList Component
 *
 * Displays extracted artifacts from an agent session with syntax highlighting
 * and copy-to-clipboard functionality.
 */

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { Artifact } from "@shared/types";

interface ArtifactListProps {
  artifacts: Artifact[];
  className?: string;
}

interface ArtifactCardProps {
  artifact: Artifact;
  isExpanded: boolean;
  onToggle: () => void;
}

const ARTIFACT_TYPE_COLORS: Record<string, string> = {
  code: "border-blue-500 text-blue-400",
  patch: "border-green-500 text-green-400",
  file: "border-purple-500 text-purple-400",
  summary: "border-yellow-500 text-yellow-400",
  other: "border-gray-500 text-gray-400",
};

const ARTIFACT_TYPE_ICONS: Record<string, string> = {
  code: "{ }",
  patch: "+/-",
  file: "[ ]",
  summary: "#",
  other: "...",
};

function ArtifactCard({ artifact, isExpanded, onToggle }: ArtifactCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy artifact:", error);
    }
  }, [artifact.content]);

  const colorClass = ARTIFACT_TYPE_COLORS[artifact.type] || ARTIFACT_TYPE_COLORS.other;
  const icon = ARTIFACT_TYPE_ICONS[artifact.type] || ARTIFACT_TYPE_ICONS.other;
  const title = artifact.filename || artifact.language || artifact.type;
  const previewLines = artifact.content.split("\n").slice(0, 3);
  const hasMore = artifact.content.split("\n").length > 3;

  return (
    <div className={cn("border rounded-md overflow-hidden", colorClass.split(" ")[0])}>
      {/* Header */}
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 bg-gray-800/50 text-left",
          "hover:bg-gray-800 transition-colors"
        )}
      >
        <div className="flex items-center gap-2">
          <span className={cn("font-mono text-xs", colorClass.split(" ")[1])}>{icon}</span>
          <span className="text-sm text-gray-200 font-medium">{title}</span>
          {artifact.language && artifact.language !== artifact.type && (
            <span className="text-xs text-gray-500">{artifact.language}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{artifact.content.split("\n").length} lines</span>
          <span className="text-gray-500">{isExpanded ? "−" : "+"}</span>
        </div>
      </button>

      {/* Content */}
      <div className="relative">
        <pre
          className={cn(
            "font-mono text-xs p-3 overflow-x-auto bg-gray-900/50",
            !isExpanded && "max-h-20 overflow-hidden"
          )}
        >
          <code className="text-gray-300">
            {isExpanded ? artifact.content : previewLines.join("\n")}
            {!isExpanded && hasMore && <span className="text-gray-500">{"\n"}...</span>}
          </code>
        </pre>

        {/* Copy button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopy();
          }}
          className={cn(
            "absolute top-2 right-2 px-2 py-1 text-xs rounded",
            "bg-gray-800 hover:bg-gray-700 transition-colors",
            copied ? "text-green-400" : "text-gray-400"
          )}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function ArtifactList({ artifacts, className }: ArtifactListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  if (artifacts.length === 0) {
    return (
      <div className={cn("text-center py-8 text-gray-500 text-sm", className)}>
        No artifacts extracted from this session
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {artifacts.map((artifact) => (
        <ArtifactCard
          key={artifact.id}
          artifact={artifact}
          isExpanded={expandedIds.has(artifact.id)}
          onToggle={() => toggleExpanded(artifact.id)}
        />
      ))}
    </div>
  );
}
