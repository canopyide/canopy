import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Send } from "lucide-react";
import { AppDialog } from "@/components/ui/AppDialog";
import { Spinner } from "@/components/ui/Spinner";
import { DiffViewer } from "./DiffViewer";
import { FileChangeList } from "./FileChangeList";
import { useDeferredLoading } from "@/hooks/useDeferredLoading";
import { UI_DOHERTY_THRESHOLD } from "@/lib/animationUtils";
import { isProtectedBranch } from "@shared/utils/gitConstants";
import { cn } from "@/lib/utils";
import type { FileChangeDetail } from "@shared/types/git";

export interface CommitComposerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (message: string) => void;
  isSubmitting: boolean;
  commitMessage: string;
  onCommitMessageChange: (next: string) => void;
  branch: string | undefined;
  tracking: string | null | undefined;
  changes: FileChangeDetail[];
  rootPath: string;
  diff: string | null;
  isDiffLoading: boolean;
  diffError: string | null;
  submitError: string | null;
}

export function CommitComposerDialog({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  commitMessage,
  onCommitMessageChange,
  branch,
  tracking,
  changes,
  rootPath,
  diff,
  isDiffLoading,
  diffError,
  submitError,
}: CommitComposerDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageId = useId();
  const confirmId = useId();

  const protectedBranch = isProtectedBranch(branch?.toLowerCase());
  const [confirmedProtected, setConfirmedProtected] = useState(false);

  const trackedChanges = useMemo(
    () => changes.filter((c) => c.status !== "untracked" && c.status !== "ignored"),
    [changes]
  );
  const trackedCount = trackedChanges.length;
  const totalCount = changes.length;

  const showDiffSkeleton = useDeferredLoading(isDiffLoading, UI_DOHERTY_THRESHOLD);

  useEffect(() => {
    if (!isOpen) {
      setConfirmedProtected(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    // AppDialog auto-focuses the first tabbable element in a requestAnimationFrame
    // (close button in the header). Schedule our textarea focus in the next frame
    // so it wins, putting the cursor where the user actually wants it.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [isOpen]);

  const trimmedMessage = commitMessage.trim();
  const canSubmit =
    !isSubmitting && trimmedMessage.length > 0 && (!protectedBranch || confirmedProtected);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm(trimmedMessage);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const branchLabel = branch ?? "detached HEAD";
  const remoteLabel = tracking ?? null;

  return (
    <AppDialog
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      dismissible={!isSubmitting}
      maxHeight="max-h-[85vh]"
      data-testid="commit-composer-dialog"
    >
      <AppDialog.Header>
        <div className="flex flex-col gap-0.5 min-w-0">
          <AppDialog.Title icon={<Send className="w-4 h-4 text-status-success" />}>
            Commit &amp; push
          </AppDialog.Title>
          <div className="text-xs text-text-muted flex items-center gap-1.5 truncate">
            <span className="truncate">
              <span className="font-mono">{branchLabel}</span>
              {remoteLabel ? (
                <>
                  <span className="px-1">→</span>
                  <span className="font-mono">{remoteLabel}</span>
                </>
              ) : null}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {trackedCount} file{trackedCount === 1 ? "" : "s"}
              {totalCount > trackedCount && trackedCount > 0 ? " tracked" : ""}
            </span>
          </div>
        </div>
        <AppDialog.CloseButton />
      </AppDialog.Header>

      <AppDialog.Body>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={messageId} className="text-xs font-medium text-text-secondary">
              Commit message
            </label>
            <textarea
              id={messageId}
              ref={textareaRef}
              value={commitMessage}
              onChange={(e) => onCommitMessageChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              placeholder="Describe what changed"
              disabled={isSubmitting}
              aria-label="Commit message"
              className={cn(
                "w-full resize-y rounded-[var(--radius-md)] border border-border-default bg-surface-inset px-3 py-2",
                "text-sm text-text-primary placeholder:text-text-muted",
                "focus:outline-hidden focus:ring-2 focus:ring-daintree-accent focus:border-transparent",
                "disabled:opacity-60"
              )}
            />
            <p className="text-[11px] text-text-muted">
              {trimmedMessage.length === 0
                ? "A message is required."
                : "⌘/Ctrl + Enter to commit & push"}
            </p>
          </div>

          {protectedBranch && (
            <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-status-warning/40 bg-status-warning/10 px-3 py-2.5 text-xs text-status-warning">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex flex-col gap-1.5 min-w-0">
                <span className="font-medium">
                  Committing directly to <span className="font-mono">{branchLabel}</span>
                </span>
                <span className="text-text-secondary">
                  This is a protected branch. Most teams use pull requests instead.
                </span>
                <label
                  htmlFor={confirmId}
                  className="flex items-center gap-2 cursor-pointer text-text-primary"
                >
                  <input
                    id={confirmId}
                    type="checkbox"
                    checked={confirmedProtected}
                    onChange={(e) => setConfirmedProtected(e.target.checked)}
                    disabled={isSubmitting}
                    className="rounded"
                  />
                  I understand I'm committing directly to{" "}
                  <span className="font-mono">{branchLabel}</span>
                </label>
              </div>
            </div>
          )}

          {changes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium text-text-secondary">
                Files ({trackedCount}
                {totalCount > trackedCount ? `, ${totalCount - trackedCount} untracked` : ""})
              </h3>
              <FileChangeList changes={changes} maxVisible={50} rootPath={rootPath} />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-text-secondary">Changes</h3>
            {isDiffLoading ? (
              showDiffSkeleton ? (
                <div
                  className="animate-pulse-delayed h-40 rounded-[var(--radius-md)] bg-surface-inset"
                  aria-label="Loading diff"
                  role="status"
                />
              ) : (
                <div className="h-40" aria-hidden="true" />
              )
            ) : diffError ? (
              <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-status-error/40 bg-status-error/10 px-3 py-2.5 text-xs text-status-error">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="flex-1 break-words">
                  Couldn't load diff preview. {diffError} You can still commit using the message
                  above.
                </span>
              </div>
            ) : diff && diff.trim().length > 0 ? (
              <div className="rounded-[var(--radius-md)] border border-border-default overflow-hidden">
                <DiffViewer diff={diff} filePath="" rootPath={rootPath} viewType="unified" />
              </div>
            ) : (
              <div className="rounded-[var(--radius-md)] border border-border-default bg-surface-inset px-3 py-6 text-center text-xs text-text-muted">
                No textual changes to preview.
              </div>
            )}
          </div>

          {submitError && (
            <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-status-error/40 bg-status-error/10 px-3 py-2.5 text-xs text-status-error">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="flex-1 break-words">{submitError}</span>
            </div>
          )}
        </div>
      </AppDialog.Body>

      <AppDialog.Footer
        hint={
          isSubmitting ? (
            <span className="flex items-center gap-1.5">
              <Spinner size="xs" />
              <span>Committing &amp; pushing…</span>
            </span>
          ) : undefined
        }
        primaryAction={{
          label: protectedBranch ? `Commit & push to ${branchLabel}` : "Commit & push",
          onClick: handleSubmit,
          disabled: !canSubmit,
          loading: isSubmitting,
        }}
        secondaryAction={{
          label: "Cancel",
          onClick: onClose,
          disabled: isSubmitting,
        }}
      />
    </AppDialog>
  );
}
