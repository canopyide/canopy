import { useMemo } from "react";
import type { CommitItem } from "@shared/types";
import { GitCommit } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecentCommitsListProps {
  commits: CommitItem[];
  maxItems?: number;
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp || timestamp <= 0) return "unknown";

  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function RecentCommitsList({ commits, maxItems = 5 }: RecentCommitsListProps) {
  const displayCommits = useMemo(() => {
    return commits.slice(0, maxItems);
  }, [commits, maxItems]);

  if (displayCommits.length === 0) {
    return <div className="text-xs text-canopy-text/40 italic py-2">No recent commits</div>;
  }

  return (
    <div className="space-y-1.5">
      {displayCommits.map((commit, index) => (
        <div
          key={commit.sha}
          className={cn(
            "flex items-start gap-2 text-xs py-1 px-1.5 rounded",
            "hover:bg-white/[0.02] transition-colors",
            index === 0 && "bg-white/[0.02]"
          )}
        >
          <GitCommit
            className={cn(
              "w-3 h-3 mt-0.5 shrink-0",
              index === 0 ? "text-emerald-400/70" : "text-canopy-text/30"
            )}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-canopy-text/50 shrink-0">
                {commit.sha.slice(0, 7)}
              </span>
              <span className="text-canopy-text/30 shrink-0">
                {formatRelativeTime(commit.timestamp)}
              </span>
            </div>
            <p className="text-canopy-text/70 truncate mt-0.5" title={commit.subject}>
              {commit.subject}
            </p>
          </div>
        </div>
      ))}

      {commits.length > maxItems && (
        <div className="text-xs text-canopy-text/30 pl-1.5">
          +{commits.length - maxItems} more commits
        </div>
      )}
    </div>
  );
}
