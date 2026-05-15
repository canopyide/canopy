import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/AppDialog";
import { TypedNameConfirmInput } from "@/components/ui/TypedNameConfirmInput";
import { AlertTriangle, Trash2 } from "lucide-react";
import { FolderGit2 } from "@/components/icons";
import { useWorktreeTerminals } from "@/hooks/useWorktreeTerminals";
import { actionService } from "@/services/ActionService";
import type { WorktreeState } from "@/types";
import { cn } from "@/lib/utils";
import { formatErrorMessage } from "@shared/utils/errorMessage";
import { isProtectedBranch as isProtectedBranchName } from "@shared/utils/gitConstants";

interface WorktreeDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  worktree: WorktreeState;
}

export function WorktreeDeleteDialog({ isOpen, onClose, worktree }: WorktreeDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [force, setForce] = useState(false);
  const [closeTerminals, setCloseTerminals] = useState(true);
  const [deleteBranch, setDeleteBranch] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const deleteInFlightRef = useRef(false);

  const { counts: terminalCounts } = useWorktreeTerminals(worktree.id);

  const changes = worktree.worktreeChanges?.changes ?? [];
  const trackedChangeCount = changes.filter(
    (c) => c.status !== "untracked" && c.status !== "ignored"
  ).length;
  const untrackedFileCount = changes.filter((c) => c.status === "untracked").length;
  const hasTrackedChanges = trackedChangeCount > 0;
  const hasUntrackedFiles = untrackedFileCount > 0;
  const hasChanges = hasTrackedChanges || hasUntrackedFiles;
  const hasTerminals = terminalCounts.total > 0;

  const isProtectedBranch = isProtectedBranchName(worktree.branch?.toLowerCase());
  const isDetachedHead = !worktree.branch;
  const canDeleteBranch =
    !isProtectedBranch && !isDetachedHead && worktree.isMainWorktree === false;

  const confirmTarget = worktree.branch || worktree.name;
  const highTierPreamble =
    isProtectedBranch || worktree.isMainWorktree === true
      ? "Force-deleting this protected worktree is irreversible."
      : "Force-deleting this worktree discards uncommitted tracked changes — this is irreversible.";
  const isHighTier =
    force && (isProtectedBranch || worktree.isMainWorktree === true || hasTrackedChanges);
  const isConfirmMatched = confirmInput === confirmTarget;
  const canSubmit = !isDeleting && (!isHighTier || isConfirmMatched);

  useEffect(() => {
    if (isOpen) {
      setForce(false);
      setCloseTerminals(true);
      setDeleteBranch(false);
      setConfirmInput("");
      setError(null);
    }
  }, [isOpen, worktree.id]);

  useEffect(() => {
    if (!force) {
      setConfirmInput("");
    }
  }, [force]);

  useEffect(() => {
    if (!canDeleteBranch && deleteBranch) {
      setDeleteBranch(false);
    }
  }, [canDeleteBranch, deleteBranch]);

  const handleDelete = async () => {
    if (deleteInFlightRef.current) return;
    if (isHighTier && !isConfirmMatched) return;

    deleteInFlightRef.current = true;
    setIsDeleting(true);
    setError(null);

    const effectiveDeleteBranch = deleteBranch && canDeleteBranch;

    try {
      const payload = {
        worktreeId: worktree.id,
        force,
        deleteBranch: effectiveDeleteBranch,
        ...(closeTerminals && hasTerminals ? { closeTerminals: true } : {}),
      };
      const result = await actionService.dispatch("worktree.delete", payload, { source: "user" });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      onClose();
    } catch (err) {
      const msg = formatErrorMessage(err, "Failed to delete worktree");
      setError(msg);
    } finally {
      setIsDeleting(false);
      deleteInFlightRef.current = false;
    }
  };

  const deleteButtonLabel = "Delete worktree";

  return (
    <AppDialog
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      variant="destructive"
      dismissible={!isDeleting}
      data-testid="delete-worktree-dialog"
    >
      <AppDialog.Body>
        <div className="flex items-center gap-3 mb-4 text-status-error">
          <div className="p-2 bg-status-error/10 rounded-full">
            <Trash2 className="w-6 h-6" />
          </div>
          <AppDialog.Title>Delete '{confirmTarget}'?</AppDialog.Title>
        </div>

        {isDeleting ? (
          <div
            role="status"
            aria-busy="true"
            aria-live="polite"
            className="space-y-4"
            data-testid="delete-worktree-skeleton"
          >
            <span className="sr-only">Deleting worktree…</span>
            <div className="animate-pulse-delayed h-4 w-3/4 bg-muted rounded" />
            <div className="animate-pulse-delayed h-4 w-full bg-muted rounded" />
            <div className="animate-pulse-delayed h-8 w-full bg-muted rounded" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <span
                role="heading"
                aria-level={3}
                className="text-[11px] font-semibold uppercase tracking-wider text-daintree-text/60"
              >
                What will happen
              </span>
              <ul className="mt-2 space-y-1">
                <li className="text-sm text-daintree-text">Worktree directory will be deleted</li>
                <li
                  className={cn(
                    "text-sm",
                    closeTerminals && hasTerminals
                      ? "text-daintree-text"
                      : "text-daintree-text/40 line-through"
                  )}
                >
                  {terminalCounts.total} terminal{terminalCounts.total === 1 ? "" : "s"} will be
                  closed
                </li>
                <li
                  className={cn(
                    "text-sm",
                    force && hasChanges ? "text-status-error" : "text-daintree-text/40 line-through"
                  )}
                >
                  Uncommitted changes will be lost
                </li>
                <li
                  className={cn(
                    "text-sm",
                    deleteBranch && canDeleteBranch && force
                      ? "text-status-warning"
                      : deleteBranch && canDeleteBranch
                        ? "text-daintree-text"
                        : "text-daintree-text/40 line-through"
                  )}
                >
                  {worktree.branch ? (
                    <>
                      Branch <span className="font-mono break-all">{worktree.branch}</span> will be
                      deleted
                    </>
                  ) : (
                    "Branch will be deleted"
                  )}
                </li>
              </ul>
            </div>
            <p className="text-xs text-daintree-text/50">This cannot be undone.</p>

            <div className="text-xs text-daintree-text/60 bg-daintree-bg/50 p-3 rounded border border-daintree-border font-mono break-all">
              {worktree.path}
            </div>

            {hasChanges && !force && (
              <div className="flex items-start gap-2 p-3 bg-status-warning/10 border border-status-warning/20 rounded text-status-warning text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <p>
                  This worktree has{" "}
                  {hasTrackedChanges && hasUntrackedFiles
                    ? `${trackedChangeCount} uncommitted file${trackedChangeCount === 1 ? "" : "s"} and ${untrackedFileCount} untracked file${untrackedFileCount === 1 ? "" : "s"}`
                    : hasTrackedChanges
                      ? `${trackedChangeCount} uncommitted file${trackedChangeCount === 1 ? "" : "s"}`
                      : `${untrackedFileCount} untracked file${untrackedFileCount === 1 ? "" : "s"}`}
                  . Standard deletion will fail.
                </p>
              </div>
            )}

            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-3 bg-status-error/10 border border-status-error/20 rounded text-status-error text-xs"
              >
                {error}
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => {
                  setForce(e.target.checked);
                  setError(null);
                }}
                className="rounded border-daintree-border bg-daintree-bg text-status-error focus:ring-status-error"
              />
              <span className="text-sm text-daintree-text">
                {hasTrackedChanges && hasUntrackedFiles
                  ? "Force delete (lose uncommitted changes and untracked files)"
                  : hasUntrackedFiles
                    ? "Force delete (remove untracked files)"
                    : "Force delete (lose uncommitted changes)"}
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={closeTerminals}
                onChange={(e) => setCloseTerminals(e.target.checked)}
                className="rounded border-daintree-border bg-daintree-bg text-daintree-accent focus:ring-daintree-accent"
              />
              <span className="text-sm text-daintree-text">
                Close all terminals{hasTerminals ? ` (${terminalCounts.total})` : ""}
              </span>
            </label>

            {canDeleteBranch && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteBranch}
                  onChange={(e) => setDeleteBranch(e.target.checked)}
                  className="mt-0.5 rounded border-daintree-border bg-daintree-bg text-status-error focus:ring-status-error"
                />
                <span className="text-sm text-daintree-text">
                  <span className="flex items-center gap-1.5">
                    <FolderGit2 className="w-3.5 h-3.5" />
                    Delete branch{" "}
                    <code className="text-xs bg-daintree-bg/50 px-1.5 py-0.5 rounded border border-daintree-border">
                      {worktree.branch}
                    </code>
                  </span>
                  {deleteBranch && (
                    <span className="block text-xs text-daintree-text/60 mt-1">
                      Safe delete — fails if branch has unmerged changes
                    </span>
                  )}
                </span>
              </label>
            )}

            {isHighTier && (
              <TypedNameConfirmInput
                target={confirmTarget}
                value={confirmInput}
                onChange={setConfirmInput}
                onMatchSubmit={() => void handleDelete()}
                preamble={highTierPreamble}
                data-testid="delete-worktree-confirm-input"
              />
            )}
          </div>
        )}
      </AppDialog.Body>

      <AppDialog.Footer>
        <Button variant="ghost" onClick={onClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={!canSubmit}
          data-testid="delete-worktree-confirm"
        >
          {isDeleting ? "Deleting…" : deleteButtonLabel}
        </Button>
      </AppDialog.Footer>
    </AppDialog>
  );
}
