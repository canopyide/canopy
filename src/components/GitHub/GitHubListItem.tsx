import {
  CircleDot,
  CheckCircle2,
  GitPullRequest,
  GitMerge,
  GitPullRequestClosed,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GitHubIssue, GitHubPR } from "@shared/types/github";

interface GitHubListItemProps {
  item: GitHubIssue | GitHubPR;
  type: "issue" | "pr";
}

function getStateIcon(state: string, type: "issue" | "pr") {
  if (type === "issue") {
    return state === "OPEN" ? CircleDot : CheckCircle2;
  }
  if (state === "MERGED") return GitMerge;
  if (state === "OPEN") return GitPullRequest;
  return GitPullRequestClosed;
}

function getStateColor(state: string): string {
  if (state === "OPEN") return "text-green-500";
  if (state === "MERGED") return "text-purple-500";
  return "text-muted-foreground";
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

function isPR(item: GitHubIssue | GitHubPR): item is GitHubPR {
  return "isDraft" in item;
}

export function GitHubListItem({ item, type }: GitHubListItemProps) {
  const StateIcon = getStateIcon(item.state, type);
  const stateColor = getStateColor(item.state);
  const isItemPR = isPR(item);

  const handleOpenExternal = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.electron.system.openExternal(item.url);
  };

  return (
    <div className="p-3 hover:bg-muted/50 transition-colors group cursor-default">
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 shrink-0", stateColor)}>
          <StateIcon className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-foreground truncate">{item.title}</h4>
            {isItemPR && item.isDraft && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                Draft
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            <span>#{item.number}</span>
            <span>&middot;</span>
            <span>{item.author.login}</span>
            <span>&middot;</span>
            <span>{formatTimeAgo(item.updatedAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {type === "issue" && "assignees" in item && item.assignees.length > 0 && (
            <div className="flex -space-x-1.5">
              {item.assignees.slice(0, 3).map((assignee) => (
                <img
                  key={assignee.login}
                  src={assignee.avatarUrl}
                  alt={assignee.login}
                  title={assignee.login}
                  className="w-5 h-5 rounded-full border-2 border-canopy-sidebar"
                />
              ))}
              {item.assignees.length > 3 && (
                <span className="w-5 h-5 rounded-full border-2 border-canopy-sidebar bg-muted flex items-center justify-center text-[9px] font-medium text-muted-foreground">
                  +{item.assignees.length - 3}
                </span>
              )}
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            onClick={handleOpenExternal}
            title="Open in GitHub"
            aria-label="Open in GitHub"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
