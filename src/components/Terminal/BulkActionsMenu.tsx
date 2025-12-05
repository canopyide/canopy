import { useState, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, CheckCircle, Trash2, RefreshCw, Play } from "lucide-react";
import { useTerminalStore } from "@/store/terminalStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { isAgentTerminal } from "@/store/utils/terminalTypeGuards";

export interface BulkActionsMenuProps {
  worktreeId?: string;
  trigger?: React.ReactNode;
  className?: string;
}

export function BulkActionsMenu({ worktreeId, trigger, className }: BulkActionsMenuProps) {
  const terminals = useTerminalStore(useShallow((state) => state.terminals));
  const bulkCloseByState = useTerminalStore((state) => state.bulkCloseByState);
  const bulkCloseByWorktree = useTerminalStore((state) => state.bulkCloseByWorktree);
  const bulkCloseAll = useTerminalStore((state) => state.bulkCloseAll);
  const restartFailedAgents = useTerminalStore((state) => state.restartFailedAgents);
  const restartIdleAgents = useTerminalStore((state) => state.restartIdleAgents);

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

  const scopedTerminals = worktreeId
    ? terminals.filter((t) => t.worktreeId === worktreeId)
    : terminals;

  const completedCount = scopedTerminals.filter((t) => t.agentState === "completed").length;
  const totalCount = scopedTerminals.length;

  const failedAgentCount = scopedTerminals.filter(
    (t) => t.agentState === "failed" && isAgentTerminal(t.type)
  ).length;
  const idleAgentCount = scopedTerminals.filter(
    (t) => t.agentState === "idle" && isAgentTerminal(t.type)
  ).length;

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleRestartIdle = useCallback(() => {
    restartIdleAgents();
  }, [restartIdleAgents]);

  const handleRestartFailed = useCallback(() => {
    restartFailedAgents();
  }, [restartFailedAgents]);

  const handleCloseCompleted = useCallback(() => {
    if (worktreeId) {
      bulkCloseByWorktree(worktreeId, "completed");
    } else {
      bulkCloseByState("completed");
    }
  }, [worktreeId, bulkCloseByState, bulkCloseByWorktree]);

  const handleCloseAll = useCallback(() => {
    const count = worktreeId ? totalCount : terminals.length;
    setConfirmDialog({
      isOpen: true,
      title: "Close All Sessions",
      description: `This will close ${count} session${count !== 1 ? "s" : ""} (including agents and shells). This action cannot be undone.`,
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
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuItem
            onClick={handleRestartIdle}
            disabled={idleAgentCount === 0}
            className="flex items-center gap-2"
          >
            <Play className="h-4 w-4 text-[var(--color-state-waiting)]" />
            <span>Restart Idle Agents</span>
            <span className="ml-auto text-xs text-canopy-text/50">({idleAgentCount})</span>
          </DropdownMenuItem>

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
            onClick={handleRestartFailed}
            disabled={failedAgentCount === 0}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4 text-[var(--color-status-warning)]" />
            <span>Restart Failed Agents</span>
            <span className="ml-auto text-xs text-canopy-text/50">({failedAgentCount})</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleCloseAll}
            disabled={totalCount === 0}
            className="flex items-center gap-2 text-[var(--color-status-error)] focus:text-[var(--color-status-error)]"
          >
            <Trash2 className="h-4 w-4" />
            <span>Close All Sessions...</span>
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
