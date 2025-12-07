import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Download, Trash2, Copy, Check, ChevronDown, ChevronRight, Code } from "lucide-react";
import type { AgentSession, Artifact } from "@shared/types";

interface SessionDetailProps {
  session: AgentSession | null;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  className?: string;
}

export function SessionDetail({ session, onDelete, onExport, className }: SessionDetailProps) {
  const [copied, setCopied] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["transcript", "artifacts"])
  );
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setCopied(false);
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, [session?.id]);

  if (!session) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-sm text-muted-foreground h-full",
          className
        )}
      >
        <p>Select a session to view details</p>
      </div>
    );
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const copyTranscript = async () => {
    try {
      const text = session.transcript
        .map((entry) => {
          const time = new Date(entry.timestamp).toLocaleTimeString();
          // eslint-disable-next-line no-control-regex
          const clean = entry.content.replace(/\x1b\[[0-9;]*m/g, "");
          return `[${time}] ${entry.type}: ${clean}`;
        })
        .join("\n\n");

      await navigator.clipboard.writeText(text);
      setCopied(true);

      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy transcript:", err);
    }
  };

  const copyArtifact = async (artifact: Artifact) => {
    try {
      await navigator.clipboard.writeText(artifact.content);
    } catch (err) {
      console.error("Failed to copy artifact:", err);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = () => {
    if (!session.endTime) return "In progress";
    const duration = session.endTime - session.startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      <div className="flex-shrink-0 p-4 border-b">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-1">
            <h3 className="text-sm font-semibold capitalize">{session.agentType} Session</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatTimestamp(session.startTime)}</span>
              <span>•</span>
              <span>{formatDuration()}</span>
              <span>•</span>
              <span className={session.state === "failed" ? "text-red-400" : ""}>
                {session.state}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onExport(session.id)}
              title="Export as Markdown"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDelete(session.id)}
              title="Delete session"
              className="hover:text-red-400"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="border-b">
          <button
            onClick={() => toggleSection("transcript")}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedSections.has("transcript") ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <span className="text-sm font-medium">Transcript</span>
              <span className="text-xs text-muted-foreground">
                ({session.transcript.length} entries)
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                copyTranscript();
              }}
              title="Copy transcript"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </button>
          {expandedSections.has("transcript") && (
            <div className="px-4 pb-4 space-y-3 max-h-96 overflow-y-auto">
              {session.transcript.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No output recorded</p>
              ) : (
                session.transcript.map((entry, i) => {
                  const time = new Date(entry.timestamp).toLocaleTimeString();
                  // eslint-disable-next-line no-control-regex
                  const cleanContent = entry.content.replace(/\x1b\[[0-9;]*m/g, "");

                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground font-mono">{time}</span>
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-medium",
                            entry.type === "agent"
                              ? "bg-purple-500/20 text-purple-400"
                              : entry.type === "user"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-gray-500/20 text-gray-400"
                          )}
                        >
                          {entry.type}
                        </span>
                      </div>
                      <pre className="text-xs font-mono bg-muted/50 p-2 rounded whitespace-pre-wrap break-words overflow-x-auto">
                        {cleanContent || "(empty)"}
                      </pre>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {session.artifacts.length > 0 && (
          <div className="border-b">
            <button
              onClick={() => toggleSection("artifacts")}
              className="w-full px-4 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors"
            >
              {expandedSections.has("artifacts") ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <Code className="w-4 h-4" />
              <span className="text-sm font-medium">Artifacts</span>
              <span className="text-xs text-muted-foreground">({session.artifacts.length})</span>
            </button>
            {expandedSections.has("artifacts") && (
              <div className="px-4 pb-4 space-y-3">
                {session.artifacts.map((artifact, i) => (
                  <div key={artifact.id || i} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-medium",
                            artifact.type === "code"
                              ? "bg-green-500/20 text-green-400"
                              : artifact.type === "patch"
                                ? "bg-orange-500/20 text-orange-400"
                                : "bg-gray-500/20 text-gray-400"
                          )}
                        >
                          {artifact.type}
                        </span>
                        {artifact.language && (
                          <span className="text-muted-foreground">{artifact.language}</span>
                        )}
                        {artifact.filename && (
                          <span className="font-mono text-muted-foreground">
                            {artifact.filename}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => copyArtifact(artifact)}
                        title="Copy artifact"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <pre className="text-xs font-mono bg-muted/50 p-2 rounded overflow-x-auto max-h-48">
                      {artifact.content.slice(0, 500)}
                      {artifact.content.length > 500 && "..."}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-4 py-3">
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Session Info</h4>
          <div className="grid grid-cols-[100px_1fr] gap-2 text-xs">
            <span className="text-muted-foreground">ID:</span>
            <span className="font-mono truncate" title={session.id}>
              {session.id}
            </span>
            <span className="text-muted-foreground">Agent:</span>
            <span className="capitalize">{session.agentType}</span>
            {session.worktreeId && (
              <>
                <span className="text-muted-foreground">Worktree:</span>
                <span className="font-mono truncate">{session.worktreeId}</span>
              </>
            )}
            {session.metadata.cwd && (
              <>
                <span className="text-muted-foreground">Working Dir:</span>
                <span className="font-mono truncate" title={session.metadata.cwd}>
                  {session.metadata.cwd}
                </span>
              </>
            )}
            {session.metadata.exitCode !== undefined && (
              <>
                <span className="text-muted-foreground">Exit Code:</span>
                <span>{session.metadata.exitCode}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
