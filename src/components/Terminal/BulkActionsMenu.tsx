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
import {
  ChevronDown,
  ArrowDownToLine,
  Minimize2,
  Maximize2,
  Trash2,
  X,
  RotateCcw,
} from "lucide-react";
import { useTerminalStore } from "@/store/terminalStore";
import { useSidecarStore } from "@/store/sidecarStore";
import { ConfirmDialog } from "./ConfirmDialog";

export interface BulkActionsMenuProps {
  trigger?: React.ReactNode;
  className?: string;
}

export function BulkActionsMenu({ trigger, className }: BulkActionsMenuProps) {
  const terminals = useTerminalStore(useShallow((state) => state.terminals));
  const focusedId = useTerminalStore((state) => state.focusedId);
  const moveTerminalToDock = useTerminalStore((state) => state.moveTerminalToDock);
  const bulkMoveToDock = useTerminalStore((state) => state.bulkMoveToDock);
  const bulkMoveToGrid = useTerminalStore((state) => state.bulkMoveToGrid);
  const bulkTrashAll = useTerminalStore((state) => state.bulkTrashAll);
  const bulkCloseAll = useTerminalStore((state) => state.bulkCloseAll);
  const bulkRestartAll = useTerminalStore((state) => state.bulkRestartAll);

  const sidecarOpen = useSidecarStore((state) => state.isOpen);
  const sidecarWidth = useSidecarStore((state) => state.width);
  const layoutMode = useSidecarStore((state) => state.layoutMode);

  const collisionPadding = {
    right: sidecarOpen && layoutMode === "overlay" ? sidecarWidth + 20 : 10,
  };

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

  const activeTerminals = terminals.filter((t) => t.location !== "trash");
  const gridTerminals = terminals.filter((t) => t.location === "grid");
  const dockedTerminals = terminals.filter((t) => t.location === "dock");

  const totalCount = activeTerminals.length;
  const gridCount = gridTerminals.length;
  const dockedCount = dockedTerminals.length;

  const focusedTerminal = focusedId ? terminals.find((t) => t.id === focusedId) : null;
  const canMinimizeFocused = focusedTerminal?.location === "grid";

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleMinimizeToDock = useCallback(() => {
    if (focusedId && canMinimizeFocused) {
      moveTerminalToDock(focusedId);
    }
  }, [focusedId, canMinimizeFocused, moveTerminalToDock]);

  const handleMinimizeAll = useCallback(() => {
    bulkMoveToDock();
  }, [bulkMoveToDock]);

  const handleMaximizeAll = useCallback(() => {
    bulkMoveToGrid();
  }, [bulkMoveToGrid]);

  const handleCloseAll = useCallback(() => {
    setConfirmDialog({
      isOpen: true,
      title: "Close All Terminals",
      description: `This will close ${totalCount} terminal${totalCount !== 1 ? "s" : ""}. They can be restored from the trash.`,
      onConfirm: () => {
        bulkTrashAll();
        closeConfirmDialog();
      },
    });
  }, [totalCount, bulkTrashAll, closeConfirmDialog]);

  const handleKillAll = useCallback(() => {
    setConfirmDialog({
      isOpen: true,
      title: "Kill All Terminals",
      description: `This will permanently kill ${totalCount} terminal${totalCount !== 1 ? "s" : ""} and their processes. This action cannot be undone.`,
      onConfirm: () => {
        bulkCloseAll();
        closeConfirmDialog();
      },
    });
  }, [totalCount, bulkCloseAll, closeConfirmDialog]);

  const handleRestartAll = useCallback(() => {
    setConfirmDialog({
      isOpen: true,
      title: "Restart All Terminals",
      description: `This will restart ${totalCount} terminal${totalCount !== 1 ? "s" : ""}.`,
      onConfirm: () => {
        bulkRestartAll();
        closeConfirmDialog();
      },
    });
  }, [totalCount, bulkRestartAll, closeConfirmDialog]);

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
        <DropdownMenuContent align="start" className="w-56" collisionPadding={collisionPadding}>
          <DropdownMenuItem
            onClick={handleMinimizeToDock}
            disabled={!canMinimizeFocused}
            className="flex items-center gap-2"
          >
            <ArrowDownToLine className="h-4 w-4" />
            <span>Minimize to Dock</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleMinimizeAll}
            disabled={gridCount === 0}
            className="flex items-center gap-2"
          >
            <Minimize2 className="h-4 w-4" />
            <span>Minimize All Terminals</span>
            <span className="ml-auto text-xs text-canopy-text/50">({gridCount})</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={handleMaximizeAll}
            disabled={dockedCount === 0}
            className="flex items-center gap-2"
          >
            <Maximize2 className="h-4 w-4" />
            <span>Maximize All Terminals</span>
            <span className="ml-auto text-xs text-canopy-text/50">({dockedCount})</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleCloseAll}
            disabled={totalCount === 0}
            className="flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            <span>Close All Terminals</span>
            <span className="ml-auto text-xs text-canopy-text/50">({totalCount})</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={handleKillAll}
            disabled={totalCount === 0}
            className="flex items-center gap-2 text-[var(--color-status-error)] focus:text-[var(--color-status-error)]"
          >
            <X className="h-4 w-4" />
            <span>Kill All Terminals</span>
            <span className="ml-auto text-xs text-canopy-text/50">({totalCount})</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleRestartAll}
            disabled={totalCount === 0}
            className="flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Restart All Terminals</span>
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
