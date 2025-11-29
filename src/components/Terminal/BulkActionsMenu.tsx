/**
 * Bulk Actions Menu Component
 *
 * Dropdown menu for bulk terminal management actions like closing
 * all completed/failed terminals or restarting failed agents.
 */

import { useState, useCallback } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, CheckCircle, XCircle, Clock, Trash2, RefreshCw } from "lucide-react";
import { useTerminalStore } from "@/store/terminalStore";
import { ConfirmDialog } from "./ConfirmDialog";

export interface BulkActionsMenuProps {
  /** Optional worktree ID to scope actions to a specific worktree */
  worktreeId?: string;
  /** Custom trigger element (if not provided, uses default button) */
  trigger?: React.ReactNode;
  /** Additional class name for the trigger button */
  className?: string;
}

export function BulkActionsMenu({ worktreeId, trigger, className }: BulkActionsMenuProps) {
  const terminals = useTerminalStore((state) => state.terminals);
  const bulkCloseByState = useTerminalStore((state) => state.bulkCloseByState);
  const bulkCloseByWorktree = useTerminalStore((state) => state.bulkCloseByWorktree);
  const bulkCloseAll = useTerminalStore((state) => state.bulkCloseAll);
  const restartFailedAgents = useTerminalStore((state) => state.restartFailedAgents);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  // Calculate counts based on scope
  const scopedTerminals = worktreeId
    ? terminals.filter((t) => t.worktreeId === worktreeId)
    : terminals;

  const completedCount = scopedTerminals.filter((t) => t.agentState === "completed").length;
  const failedCount = scopedTerminals.filter((t) => t.agentState === "failed").length;
  const idleCount = scopedTerminals.filter((t) => t.agentState === "idle").length;
  const totalCount = scopedTerminals.length;

  // Failed agents that can be restarted (only agent terminals)
  const restartableCount = scopedTerminals.filter(
    (t) => t.agentState === "failed" && (t.type === "claude" || t.type === "gemini")
  ).length;

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleCloseCompleted = useCallback(() => {
    if (worktreeId) {
      bulkCloseByWorktree(worktreeId, "completed");
    } else {
      bulkCloseByState("completed");
    }
  }, [worktreeId, bulkCloseByState, bulkCloseByWorktree]);

  const handleCloseFailed = useCallback(() => {
    if (worktreeId) {
      bulkCloseByWorktree(worktreeId, "failed");
    } else {
      bulkCloseByState("failed");
    }
  }, [worktreeId, bulkCloseByState, bulkCloseByWorktree]);

  const handleCloseIdle = useCallback(() => {
    if (worktreeId) {
      bulkCloseByWorktree(worktreeId, "idle");
    } else {
      bulkCloseByState("idle");
    }
  }, [worktreeId, bulkCloseByState, bulkCloseByWorktree]);

  const handleCloseAll = useCallback(() => {
    const count = worktreeId ? totalCount : terminals.length;
    setConfirmDialog({
      isOpen: true,
      title: "Close All Terminals",
      description: `This will close ${count} terminal${count !== 1 ? "s" : ""}. This action cannot be undone.`,
      onConfirm: () => {
        if (worktreeId) {
          bulkCloseByWorktree(worktreeId);
        } else {
          bulkCloseAll();
        }
        closeConfirmDialog();
      },
    });
  }, [
    worktreeId,
    totalCount,
    terminals.length,
    bulkCloseByWorktree,
    bulkCloseAll,
    closeConfirmDialog,
  ]);

  const handleRestartFailed = useCallback(() => {
    // Note: This restarts ALL failed agents globally, not just for this worktree
    const globalRestartMessage = worktreeId
      ? `This will restart ${restartableCount} failed agent${restartableCount !== 1 ? "s" : ""} across ALL worktrees (not just this one). The terminals will be closed and new ones will be spawned with the same configuration.`
      : `This will restart ${restartableCount} failed agent${restartableCount !== 1 ? "s" : ""}. The terminals will be closed and new ones will be spawned with the same configuration.`;

    setConfirmDialog({
      isOpen: true,
      title: "Restart Failed Agents",
      description: globalRestartMessage,
      onConfirm: async () => {
        await restartFailedAgents();
        closeConfirmDialog();
      },
    });
  }, [worktreeId, restartableCount, restartFailedAgents, closeConfirmDialog]);

  const defaultTrigger = (
    <Button
      variant="ghost"
      size="sm"
      className={className || "text-canopy-text hover:bg-canopy-border hover:text-canopy-accent"}
    >
      <span>Actions</span>
      <ChevronDown className="h-4 w-4 ml-1" />
    </Button>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger || defaultTrigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem
            onClick={handleCloseCompleted}
            disabled={completedCount === 0}
            className="flex items-center gap-2"
          >
            <CheckCircle className="h-4 w-4 text-[var(--color-status-success)]" />
            <span>Close Completed</span>
            <span className="ml-auto text-xs text-canopy-text/50">({completedCount})</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleCloseFailed}
            disabled={failedCount === 0}
            className="flex items-center gap-2"
          >
            <XCircle className="h-4 w-4 text-[var(--color-status-error)]" />
            <span>Close Failed</span>
            <span className="ml-auto text-xs text-canopy-text/50">({failedCount})</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleCloseIdle}
            disabled={idleCount === 0}
            className="flex items-center gap-2"
          >
            <Clock className="h-4 w-4 text-gray-400" />
            <span>Close Idle</span>
            <span className="ml-auto text-xs text-canopy-text/50">({idleCount})</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleRestartFailed}
            disabled={restartableCount === 0}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4 text-[var(--color-status-warning)]" />
            <span>Restart Failed Agents</span>
            <span className="ml-auto text-xs text-canopy-text/50">({restartableCount})</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleCloseAll}
            disabled={totalCount === 0}
            className="flex items-center gap-2 text-[var(--color-status-error)] focus:text-[var(--color-status-error)]"
          >
            <Trash2 className="h-4 w-4" />
            <span>Close All Terminals...</span>
            <span className="ml-auto text-xs text-canopy-text/50">({totalCount})</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirmDialog}
      />
    </>
  );
}
