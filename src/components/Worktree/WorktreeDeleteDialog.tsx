import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useOverlayState } from "@/hooks/useOverlayState";
import { useWorktreeTerminals } from "@/hooks/useWorktreeTerminals";
import { useTerminalStore } from "@/store";
import { worktreeClient } from "@/clients";
import type { WorktreeState } from "@/types";

interface WorktreeDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  worktree: WorktreeState;
}

export function WorktreeDeleteDialog({ isOpen, onClose, worktree }: WorktreeDeleteDialogProps) {
  useOverlayState(isOpen);
  const [isDeleting, setIsDeleting] = useState(false);
  const [force, setForce] = useState(false);
  const [closeTerminals, setCloseTerminals] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const { counts: terminalCounts } = useWorktreeTerminals(worktree.id);
  const bulkCloseByWorktree = useTerminalStore((state) => state.bulkCloseByWorktree);

  const hasChanges = (worktree.worktreeChanges?.changedFileCount ?? 0) > 0;
  const hasTerminals = terminalCounts.total > 0;

  useEffect(() => {
    if (isOpen) {
      setForce(false);
      setError(null);
      setTimeout(() => dialogRef.current?.focus(), 0);
    }
  }, [isOpen, worktree.id]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, isDeleting, onClose]);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      if (closeTerminals && hasTerminals) {
        bulkCloseByWorktree(worktree.id);
      }
      await worktreeClient.delete(worktree.id, force);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBackdropClick = () => {
    if (!isDeleting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="bg-canopy-sidebar border border-canopy-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        tabIndex={-1}
      >
        <div className="flex items-center gap-3 mb-4 text-[var(--color-status-error)]">
          <div className="p-2 bg-[var(--color-status-error)]/10 rounded-full">
            <Trash2 className="w-6 h-6" />
          </div>
          <h2 id="delete-dialog-title" className="text-lg font-semibold text-canopy-text">
            Delete Worktree?
          </h2>
        </div>

        <div className="space-y-4 mb-6">
          <p className="text-sm text-canopy-text/80">
            Are you sure you want to delete{" "}
            <span className="font-mono font-medium text-canopy-text">
              {worktree.branch || worktree.name}
            </span>
            ?
          </p>

          <div className="text-xs text-canopy-text/60 bg-canopy-bg/50 p-3 rounded border border-canopy-border font-mono break-all">
            {worktree.path}
          </div>

          {hasChanges && !force && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded text-amber-500 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p>This worktree has uncommitted changes. Standard deletion will fail.</p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="p-3 bg-red-500/10 border border-red-500/20 rounded text-[var(--color-status-error)] text-xs"
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
              className="rounded border-canopy-border bg-canopy-bg text-[var(--color-status-error)] focus:ring-[var(--color-status-error)]"
            />
            <span className="text-sm text-canopy-text">
              Force delete (lose uncommitted changes)
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={closeTerminals}
              onChange={(e) => setCloseTerminals(e.target.checked)}
              className="rounded border-canopy-border bg-canopy-bg text-canopy-accent focus:ring-canopy-accent"
            />
            <span className="text-sm text-canopy-text">
              Close all terminals{hasTerminals ? ` (${terminalCounts.total})` : ""}
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-[var(--color-status-error)] hover:bg-[var(--color-status-error)]/90"
          >
            {isDeleting ? "Deleting..." : "Delete Worktree"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
