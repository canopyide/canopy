import { useCallback, useState } from "react";
import { GitPullRequest } from "lucide-react";
import { useWorktreeStore } from "@/hooks/useWorktreeStore";
import { ReviewHubContent } from "@/components/Worktree/ReviewHub/ReviewHubContent";
import { EmptyState } from "@/components/ui/EmptyState";

export interface ReviewPaneProps {
  id: string;
  worktreeId?: string;
}

const noop = () => {};

export function ReviewPane({ worktreeId }: ReviewPaneProps) {
  // Callback ref via useState so React re-renders once the container element
  // commits to the DOM. A plain useRef would freeze `current` at `null` for
  // the lifetime of the first render and `keyboardScope` would never receive
  // the element — `ReviewHubContent` would fall back to a document-scoped
  // Escape listener that swallows the key across the whole app.
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);

  // Resolve worktree path fresh from the worktree store so renames/moves are
  // reflected without restarting the panel. Missing worktreeId yields an empty
  // state instead of an IPC call with an empty path.
  const worktreePath = useWorktreeStore(
    useCallback(
      (state) => (worktreeId ? (state.worktrees.get(worktreeId)?.path ?? "") : ""),
      [worktreeId]
    )
  );

  if (!worktreePath) {
    return (
      <div ref={setContainerEl} className="flex h-full w-full items-center justify-center">
        <EmptyState
          variant="zero-data"
          scale="canvas"
          icon={<GitPullRequest className="h-6 w-6" />}
          title="Worktree unavailable"
          description="Open a worktree to review and commit changes."
        />
      </div>
    );
  }

  return (
    <div ref={setContainerEl} className="flex h-full w-full flex-col bg-daintree-bg">
      <ReviewHubContent
        isOpen={true}
        worktreePath={worktreePath}
        onClose={noop}
        keyboardScope={containerEl ?? undefined}
      />
    </div>
  );
}
