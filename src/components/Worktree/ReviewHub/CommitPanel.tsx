import { useState, useCallback, useRef, useEffect } from "react";
import type { PushProgressEvent } from "@shared/types/ipc/gitPush";
import { cn } from "@/lib/utils";
import { GitCommit, ArrowUpFromLine, Check, CircleX } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { SplitButton } from "@/components/ui/split-button";

const MAX_SUBJECT_LENGTH = 72;

interface CommitPanelProps {
  stagedCount: number;
  isDetachedHead: boolean;
  hasConflicts: boolean;
  hasRemote: boolean;
  worktreePath: string;
  commitMessage: string;
  onCommitMessageChange: (message: string) => void;
  onCommit: (message: string) => Promise<void>;
  onCommitAndPush: (message: string) => Promise<void>;
  onFocusBlocker?: (blocker: "conflicts" | "staged-files") => void;
  isPushing: boolean;
  pushProgress: Map<string, PushProgressEvent>;
  pushTargetBranch: string | null;
}

export function CommitPanel({
  stagedCount,
  isDetachedHead,
  hasConflicts,
  hasRemote,
  worktreePath,
  commitMessage,
  onCommitMessageChange,
  onCommit,
  onCommitAndPush,
  onFocusBlocker,
  isPushing,
  pushProgress,
  pushTargetBranch,
}: CommitPanelProps) {
  const [isCommitting, setIsCommitting] = useState(false);

  const actionInFlightRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const detachedHeadRef = useRef<HTMLDivElement>(null);

  const subjectLine = commitMessage.split("\n")[0] || "";
  const hasLineOverflow = /.{73,}/.test(commitMessage);
  const isBusy = isCommitting || isPushing;
  const canCommit =
    stagedCount > 0 && commitMessage.trim().length > 0 && !isDetachedHead && !hasConflicts;

  const blockers = [
    { key: "detached-head" as const, active: isDetachedHead, label: "Not on detached HEAD" },
    { key: "conflicts" as const, active: hasConflicts, label: "No merge conflicts" },
    { key: "zero-staged" as const, active: stagedCount === 0, label: "Files staged for commit" },
    {
      key: "empty-message" as const,
      active: commitMessage.trim().length === 0,
      label: "Commit message entered",
    },
  ];

  const primaryBlocker = blockers.find((b) => b.active) ?? null;
  const isBlocked = primaryBlocker !== null;

  const focusBlocker = useCallback(() => {
    if (!primaryBlocker) return;
    switch (primaryBlocker.key) {
      case "detached-head":
        detachedHeadRef.current?.focus();
        break;
      case "conflicts":
        onFocusBlocker?.("conflicts");
        break;
      case "zero-staged":
        onFocusBlocker?.("staged-files");
        break;
      case "empty-message":
        textareaRef.current?.focus();
        break;
    }
  }, [primaryBlocker, onFocusBlocker]);

  const historyMessagesRef = useRef<string[] | null>(null);
  const historyIndexRef = useRef(-1);
  const isFetchingHistoryRef = useRef(false);
  const draftBeforeHistoryRef = useRef("");
  const pendingFirstApplyRef = useRef(false);

  useEffect(() => {
    historyMessagesRef.current = null;
    historyIndexRef.current = -1;
    isFetchingHistoryRef.current = false;
    draftBeforeHistoryRef.current = "";
    pendingFirstApplyRef.current = false;
  }, [worktreePath]);

  const fetchHistoryMessages = useCallback(async (): Promise<string[]> => {
    if (historyMessagesRef.current !== null) return historyMessagesRef.current;
    if (isFetchingHistoryRef.current) {
      while (isFetchingHistoryRef.current) {
        await new Promise((r) => setTimeout(r, 10));
      }
      return historyMessagesRef.current ?? [];
    }
    isFetchingHistoryRef.current = true;
    try {
      const result = await window.electron.git.listCommits({ cwd: worktreePath, limit: 8 });
      historyMessagesRef.current = result.items
        .map((c) => (c.body?.trim() ? `${c.message}\n\n${c.body.trim()}` : c.message))
        .filter((m) => m.length > 0);
      return historyMessagesRef.current;
    } catch {
      historyMessagesRef.current = [];
      return [];
    } finally {
      isFetchingHistoryRef.current = false;
    }
  }, [worktreePath]);

  const handleCommit = useCallback(async () => {
    if (!canCommit || isBusy) return;
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setIsCommitting(true);
    try {
      await onCommit(commitMessage);
      onCommitMessageChange("");
    } catch {
      // Error is handled by the parent via setActionError
    } finally {
      setIsCommitting(false);
      actionInFlightRef.current = false;
    }
  }, [canCommit, isBusy, commitMessage, onCommit, onCommitMessageChange]);

  const handleCommitAndPush = useCallback(async () => {
    if (!canCommit || isBusy) return;
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    try {
      await onCommitAndPush(commitMessage);
      onCommitMessageChange("");
    } catch {
      // Error is handled by the parent via setActionError
    } finally {
      actionInFlightRef.current = false;
    }
  }, [canCommit, isBusy, commitMessage, onCommitAndPush, onCommitMessageChange]);

  const handlePrimaryClick = useCallback(() => {
    if (isBlocked) {
      focusBlocker();
      return;
    }
    if (hasRemote) {
      void handleCommitAndPush();
    } else {
      void handleCommit();
    }
  }, [isBlocked, hasRemote, focusBlocker, handleCommitAndPush, handleCommit]);

  const progressEntries = [...pushProgress.values()];
  const hasProgress = progressEntries.length > 0;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        !e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        e.currentTarget.selectionStart === 0 &&
        e.currentTarget.selectionEnd === 0
      ) {
        e.preventDefault();

        if (e.key === "ArrowUp") {
          if (historyIndexRef.current < 0) {
            draftBeforeHistoryRef.current = commitMessage;
            pendingFirstApplyRef.current = true;
          }

          const messages = historyMessagesRef.current;
          if (messages !== null) {
            if (messages.length === 0) return;

            if (pendingFirstApplyRef.current) {
              pendingFirstApplyRef.current = false;
              historyIndexRef.current = 0;
              onCommitMessageChange(messages[0]);
            } else if (historyIndexRef.current < messages.length - 1) {
              historyIndexRef.current++;
              onCommitMessageChange(messages[historyIndexRef.current]!);
            }

            requestAnimationFrame(() => {
              textareaRef.current?.setSelectionRange(0, 0);
            });
          } else {
            void fetchHistoryMessages().then((msgs) => {
              if (msgs.length === 0) return;

              if (pendingFirstApplyRef.current) {
                pendingFirstApplyRef.current = false;
                historyIndexRef.current = 0;
                onCommitMessageChange(msgs[0]);
              }

              requestAnimationFrame(() => {
                textareaRef.current?.setSelectionRange(0, 0);
              });
            });
          }
        } else {
          if (historyIndexRef.current < 0) return;
          historyIndexRef.current--;
          if (historyIndexRef.current < 0) {
            pendingFirstApplyRef.current = false;
            onCommitMessageChange(draftBeforeHistoryRef.current);
          } else {
            const messages = historyMessagesRef.current!;
            onCommitMessageChange(messages[historyIndexRef.current]!);
          }

          requestAnimationFrame(() => {
            textareaRef.current?.setSelectionRange(0, 0);
          });
        }
        return;
      }

      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (isBlocked) {
          focusBlocker();
          return;
        }
        if (e.shiftKey && hasRemote) {
          void handleCommit();
        } else {
          void handlePrimaryClick();
        }
      }
    },
    [
      handlePrimaryClick,
      handleCommit,
      hasRemote,
      isBlocked,
      focusBlocker,
      commitMessage,
      fetchHistoryMessages,
      onCommitMessageChange,
    ]
  );

  const blockerTooltip = (
    <div>
      <div className="text-[11px] font-semibold text-daintree-text/60 mb-2">Cannot commit</div>
      <ul className="flex flex-col gap-1.5 text-xs">
        {blockers.map((b) => (
          <li key={b.key} className="flex items-center gap-2">
            {b.active ? (
              <CircleX className="w-3 h-3 text-status-error shrink-0" />
            ) : (
              <Check className="w-3 h-3 text-status-success shrink-0" />
            )}
            <span
              className={b.active ? "text-daintree-text" : "text-daintree-text/40 line-through"}
            >
              {b.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  const primaryLabel = hasRemote ? "Commit & Push" : "Commit";

  return (
    <div className="border-t border-divider p-3 space-y-2">
      {isDetachedHead && (
        <div
          ref={detachedHeadRef}
          tabIndex={-1}
          className="text-xs text-status-warning bg-status-warning/10 rounded px-2 py-1.5 outline-hidden focus:ring-2 focus:ring-daintree-accent"
        >
          Detached HEAD — commits are not allowed in this state.
        </div>
      )}

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={commitMessage}
          onChange={(e) => {
            historyIndexRef.current = -1;
            pendingFirstApplyRef.current = false;
            onCommitMessageChange(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Commit message…"
          rows={4}
          disabled={isBusy || isDetachedHead}
          style={
            {
              backgroundImage: `linear-gradient(to right, transparent 72ch, rgba(128,128,128,0.14) 72ch)`,
              backgroundOrigin: "content-box",
              backgroundClip: "content-box",
              backgroundAttachment: "local",
            } as React.CSSProperties
          }
          className={cn(
            "w-full resize-none rounded-md border bg-daintree-bg px-3 py-2 text-xs font-mono",
            "placeholder:text-daintree-text/30 text-daintree-text",
            "focus:outline-hidden focus:ring-2 focus:ring-daintree-accent focus:border-transparent",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            hasLineOverflow ? "border-status-warning" : "border-divider"
          )}
        />
        <div
          className={cn(
            "absolute bottom-1.5 right-2 text-[10px] flex items-center gap-1.5",
            hasLineOverflow ? "text-status-warning" : "text-daintree-text/30"
          )}
        >
          <span className="tabular-nums">
            {subjectLine.length}/{MAX_SUBJECT_LENGTH}
          </span>
          {hasLineOverflow && <span>Line over 72 chars</span>}
        </div>
      </div>

      {isPushing && pushTargetBranch && (
        <div className="text-[10px] text-daintree-text/50 truncate">
          Pushing to <span className="text-daintree-text/70 font-mono">{pushTargetBranch}</span>
        </div>
      )}

      {isPushing && hasProgress && (
        <div className="space-y-1">
          {progressEntries.map((e) => (
            <div
              key={e.stage}
              className="flex items-center gap-2 text-[10px] text-daintree-text/70"
            >
              <span className="w-20 truncate capitalize">{e.stage}</span>
              <div className="flex-1 h-1 bg-daintree-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, e.progress ?? 0))}%` }}
                />
              </div>
              {e.progress != null && (
                <span className="tabular-nums w-8 text-right">{e.progress}%</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        {hasRemote ? (
          <SplitButton
            primaryLabel={`${primaryLabel} (${stagedCount})`}
            primaryIcon={
              isPushing ? (
                <Spinner size="sm" className="mr-1.5" />
              ) : (
                <ArrowUpFromLine className="w-3.5 h-3.5 mr-1.5" />
              )
            }
            onPrimaryClick={handlePrimaryClick}
            menuItems={[
              {
                label: `Commit (${stagedCount})`,
                icon: isCommitting ? <Spinner size="sm" /> : <GitCommit className="w-3.5 h-3.5" />,
                shortcut: "⇧⌘↵",
                onClick: () => void handleCommit(),
              },
            ]}
            ariaDisabled={!canCommit || isBusy}
            disabledReason={isBlocked ? blockerTooltip : undefined}
            isBusy={isBusy}
            variant="default"
            size="sm"
            className="flex-1"
          />
        ) : (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                onClick={handlePrimaryClick}
                aria-disabled={!canCommit || isBusy || undefined}
                className={cn(
                  "flex-1",
                  "aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
                )}
              >
                {isCommitting ? (
                  <Spinner size="sm" className="mr-1.5" />
                ) : (
                  <GitCommit className="w-3.5 h-3.5 mr-1.5" />
                )}
                Commit ({stagedCount})
              </Button>
            </TooltipTrigger>
            {isBlocked && (
              <TooltipContent side="top" align="center" className="p-3 max-w-[260px]">
                {blockerTooltip}
              </TooltipContent>
            )}
          </Tooltip>
        )}
      </div>
    </div>
  );
}
