/**
 * New Worktree Dialog Component
 *
 * Modal UI for creating new git worktrees.
 * Allows users to select a base branch, enter a new branch name,
 * and choose a worktree path.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, FolderOpen, GitBranch, Check, AlertCircle, Loader2 } from "lucide-react";
import type { BranchInfo, CreateWorktreeOptions } from "@/types/electron";

interface NewWorktreeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  onWorktreeCreated?: () => void;
}

export function NewWorktreeDialog({
  isOpen,
  onClose,
  rootPath,
  onWorktreeCreated,
}: NewWorktreeDialogProps) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [baseBranch, setBaseBranch] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [worktreePath, setWorktreePath] = useState("");
  const [fromRemote, setFromRemote] = useState(false);

  // Load branches when dialog opens
  useEffect(() => {
    if (!isOpen || !window.electron?.worktree) return;

    setLoading(true);
    setError(null);

    window.electron.worktree
      .listBranches(rootPath)
      .then((branchList) => {
        setBranches(branchList);
        // Set default base branch (current or main/master)
        const currentBranch = branchList.find((b) => b.current);
        const mainBranch =
          branchList.find((b) => b.name === "main") || branchList.find((b) => b.name === "master");
        setBaseBranch(mainBranch?.name || currentBranch?.name || branchList[0]?.name || "");
      })
      .catch((err) => {
        setError(`Failed to load branches: ${err.message}`);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, rootPath]);

  // Auto-suggest worktree path based on branch name
  useEffect(() => {
    if (newBranch && rootPath) {
      const repoName = rootPath.split("/").pop() || "repo";
      const sanitizedBranch = newBranch.replace(/[^a-zA-Z0-9-_]/g, "-");
      const suggestedPath = `${rootPath}/../${repoName}-worktrees/${sanitizedBranch}`;
      setWorktreePath(suggestedPath);
    }
  }, [newBranch, rootPath]);

  const handleCreate = async () => {
    if (!window.electron?.worktree) return;

    // Validation
    if (!baseBranch) {
      setError("Please select a base branch");
      return;
    }
    if (!newBranch.trim()) {
      setError("Please enter a new branch name");
      return;
    }
    if (!worktreePath.trim()) {
      setError("Please enter a worktree path");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const options: CreateWorktreeOptions = {
        baseBranch,
        newBranch: newBranch.trim(),
        path: worktreePath.trim(),
        fromRemote,
      };

      await window.electron.worktree.create(options, rootPath);

      // Success! Call callback and close
      onWorktreeCreated?.();
      onClose();

      // Reset form
      setNewBranch("");
      setWorktreePath("");
      setFromRemote(false);
    } catch (err: any) {
      setError(err.message || "Failed to create worktree");
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-canopy-sidebar border border-canopy-border rounded-lg shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-worktree-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-canopy-border">
          <h2
            id="new-worktree-title"
            className="text-lg font-medium text-canopy-text flex items-center gap-2"
          >
            <GitBranch className="w-5 h-5 text-canopy-accent" />
            Create New Worktree
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-canopy-text transition-colors"
            disabled={creating}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-canopy-accent" />
              <span className="ml-2 text-sm text-gray-400">Loading branches...</span>
            </div>
          ) : (
            <>
              {/* Base Branch */}
              <div className="space-y-2">
                <label htmlFor="base-branch" className="block text-sm font-medium text-canopy-text">
                  Base Branch
                </label>
                <select
                  id="base-branch"
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  className="w-full px-3 py-2 bg-canopy-bg border border-canopy-border rounded-md text-canopy-text focus:outline-none focus:ring-2 focus:ring-canopy-accent"
                  disabled={creating}
                >
                  {branches.map((branch) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name}
                      {branch.current ? " (current)" : ""}
                      {branch.remote ? " (remote)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400">The branch to create the new worktree from</p>
              </div>

              {/* New Branch Name */}
              <div className="space-y-2">
                <label htmlFor="new-branch" className="block text-sm font-medium text-canopy-text">
                  New Branch Name
                </label>
                <input
                  id="new-branch"
                  type="text"
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  placeholder="feature/my-feature"
                  className="w-full px-3 py-2 bg-canopy-bg border border-canopy-border rounded-md text-canopy-text focus:outline-none focus:ring-2 focus:ring-canopy-accent"
                  disabled={creating}
                />
                <p className="text-xs text-gray-400">Name for the new branch</p>
              </div>

              {/* Worktree Path */}
              <div className="space-y-2">
                <label
                  htmlFor="worktree-path"
                  className="block text-sm font-medium text-canopy-text"
                >
                  Worktree Path
                </label>
                <div className="flex gap-2">
                  <input
                    id="worktree-path"
                    type="text"
                    value={worktreePath}
                    onChange={(e) => setWorktreePath(e.target.value)}
                    placeholder="/path/to/worktree"
                    className="flex-1 px-3 py-2 bg-canopy-bg border border-canopy-border rounded-md text-canopy-text focus:outline-none focus:ring-2 focus:ring-canopy-accent"
                    disabled={creating}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // TODO: Implement file picker dialog
                    }}
                    disabled={creating}
                  >
                    <FolderOpen className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-400">
                  Directory where the worktree will be created
                </p>
              </div>

              {/* Remote Checkbox */}
              <div className="flex items-center gap-2">
                <input
                  id="from-remote"
                  type="checkbox"
                  checked={fromRemote}
                  onChange={(e) => setFromRemote(e.target.checked)}
                  className="rounded border-canopy-border text-canopy-accent focus:ring-canopy-accent"
                  disabled={creating}
                />
                <label htmlFor="from-remote" className="text-sm text-canopy-text">
                  Create from remote branch
                </label>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md">
                  <AlertCircle className="w-4 h-4 text-[var(--color-status-error)] mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-[var(--color-status-error)]">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-canopy-border">
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating || loading} className="min-w-[100px]">
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Create
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
