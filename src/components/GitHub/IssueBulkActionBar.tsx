import { useState, useRef, useCallback, useReducer } from "react";
import PQueue from "p-queue";
import { X, GitBranch, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { actionService } from "@/services/ActionService";
import { detectPrefixFromIssue, buildBranchName } from "@/components/Worktree/branchPrefixUtils";
import { generateBranchSlug } from "@/utils/textParsing";
import { notify } from "@/lib/notify";
import { RecipePicker } from "./RecipePicker";
import type { GitHubIssue } from "@shared/types/github";

interface IssueBulkActionBarProps {
  selectedIssues: GitHubIssue[];
  onClear: () => void;
}

interface ProgressState {
  phase: "idle" | "executing" | "done";
  total: number;
  completed: number;
  failed: number;
}

type ProgressAction =
  | { type: "START"; total: number }
  | { type: "COMPLETED" }
  | { type: "FAILED" }
  | { type: "DONE" }
  | { type: "RESET" };

function progressReducer(state: ProgressState, action: ProgressAction): ProgressState {
  switch (action.type) {
    case "START":
      return { phase: "executing", total: action.total, completed: 0, failed: 0 };
    case "COMPLETED":
      return { ...state, completed: state.completed + 1 };
    case "FAILED":
      return { ...state, failed: state.failed + 1 };
    case "DONE":
      return { ...state, phase: "done" };
    case "RESET":
      return { phase: "idle", total: 0, completed: 0, failed: 0 };
  }
}

export function IssueBulkActionBar({ selectedIssues, onClear }: IssueBulkActionBarProps) {
  const [showRecipePicker, setShowRecipePicker] = useState(false);
  const [progress, dispatchProgress] = useReducer(progressReducer, {
    phase: "idle",
    total: 0,
    completed: 0,
    failed: 0,
  });
  const queueRef = useRef<PQueue | null>(null);

  const executeBulkCreate = useCallback(
    async (recipeId: string | null) => {
      const issues = selectedIssues.filter((i) => i.state === "OPEN");
      if (issues.length === 0) return;

      dispatchProgress({ type: "START", total: issues.length });

      const queue = new PQueue({ concurrency: 4 });
      queueRef.current = queue;
      let succeeded = 0;
      let failed = 0;

      for (const issue of issues) {
        void queue.add(async () => {
          try {
            const prefix = detectPrefixFromIssue(issue) ?? "feature";
            const slug = generateBranchSlug(issue.title);
            const issuePrefix = `issue-${issue.number}-`;
            const branchName = buildBranchName(prefix, `${issuePrefix}${slug || "worktree"}`);

            const result = await actionService.dispatch(
              "worktree.createWithRecipe",
              {
                branchName,
                recipeId: recipeId ?? undefined,
                issueNumber: issue.number,
              },
              { source: "user", confirmed: true }
            );

            if (result.ok) {
              succeeded++;
              dispatchProgress({ type: "COMPLETED" });
            } else {
              failed++;
              dispatchProgress({ type: "FAILED" });
            }
          } catch {
            failed++;
            dispatchProgress({ type: "FAILED" });
          }
        });
      }

      await queue.onIdle();
      queueRef.current = null;
      dispatchProgress({ type: "DONE" });

      if (failed === 0) {
        notify({
          type: "success",
          title: "Bulk Create Complete",
          message: `Created ${succeeded} worktree${succeeded !== 1 ? "s" : ""}`,
        });
      } else {
        notify({
          type: "error",
          title: "Bulk Create Partial Failure",
          message: `${succeeded} created, ${failed} failed`,
        });
      }
    },
    [selectedIssues]
  );

  const handleRecipeSelect = useCallback(
    (recipeId: string | null) => {
      setShowRecipePicker(false);
      void executeBulkCreate(recipeId);
    },
    [executeBulkCreate]
  );

  const handleDismiss = useCallback(() => {
    if (progress.phase === "executing") {
      queueRef.current?.clear();
      queueRef.current = null;
    }
    dispatchProgress({ type: "RESET" });
    onClear();
  }, [progress.phase, onClear]);

  if (selectedIssues.length === 0 && progress.phase === "idle") return null;

  const isExecuting = progress.phase === "executing";
  const isDone = progress.phase === "done";
  const processedCount = progress.completed + progress.failed;

  return (
    <>
      <div
        role="toolbar"
        aria-label="Bulk actions"
        className={cn(
          "absolute bottom-3 left-1/2 -translate-x-1/2 z-50",
          "animate-pill-enter",
          "flex items-center gap-2 px-3 py-2 rounded-full",
          "bg-black/70 backdrop-blur-xl",
          "shadow-lg border border-white/10",
          "text-white text-sm"
        )}
      >
        {isExecuting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>
              Creating {processedCount}/{progress.total}...
            </span>
          </>
        ) : isDone ? (
          <>
            <GitBranch className="w-4 h-4" />
            <span>
              {progress.completed} created
              {progress.failed > 0 && `, ${progress.failed} failed`}
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-canopy-accent text-white text-xs font-medium">
              {selectedIssues.length}
            </span>
            <button
              type="button"
              onClick={() => setShowRecipePicker(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-canopy-accent hover:bg-canopy-accent/90 text-white text-xs font-medium transition-colors"
            >
              <GitBranch className="w-3.5 h-3.5" />
              Create Worktrees
            </button>
          </>
        )}
        <div className="w-px h-4 bg-white/20" />
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={isDone ? "Dismiss" : "Clear selection"}
          className="flex items-center justify-center w-5 h-5 rounded-full hover:bg-white/20 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <RecipePicker
        isOpen={showRecipePicker}
        onClose={() => setShowRecipePicker(false)}
        onSelect={handleRecipeSelect}
      />
    </>
  );
}
