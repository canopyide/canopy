import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuShortcut,
} from "@/components/ui/context-menu";
import {
  Maximize2,
  Minimize2,
  Trash2,
  ArrowUp,
  ArrowDownToLine,
  X,
  RotateCcw,
  Copy,
  Eraser,
} from "lucide-react";
import { useTerminalStore } from "@/store";
import type { TerminalLocation } from "@/types";
import { terminalInstanceService } from "@/services/TerminalInstanceService";
import { VT100_FULL_CLEAR } from "@/services/clearCommandDetection";

interface TerminalContextMenuProps {
  terminalId: string;
  children: React.ReactNode;
  forceLocation?: TerminalLocation;
}

/**
 * Right-click context menu for terminal components.
 * Used by both DockedTerminalItem and TerminalHeader.
 */
export function TerminalContextMenu({
  terminalId,
  children,
  forceLocation,
}: TerminalContextMenuProps) {
  const terminal = useTerminalStore((state) => state.terminals.find((t) => t.id === terminalId));

  const moveTerminalToDock = useTerminalStore((s) => s.moveTerminalToDock);
  const moveTerminalToGrid = useTerminalStore((s) => s.moveTerminalToGrid);
  const trashTerminal = useTerminalStore((s) => s.trashTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
  const toggleMaximize = useTerminalStore((s) => s.toggleMaximize);
  const restartTerminal = useTerminalStore((s) => s.restartTerminal);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const isMaximized = useTerminalStore((s) => s.maximizedId === terminalId);

  const handleDuplicate = async () => {
    if (!terminal) return;
    try {
      await addTerminal({
        type: terminal.type,
        cwd: terminal.cwd,
        location: terminal.location === "trash" ? "grid" : terminal.location,
        title: `${terminal.title} (copy)`,
        worktreeId: terminal.worktreeId,
        command: terminal.command,
      });
    } catch (error) {
      console.error("Failed to duplicate terminal:", error);
    }
  };

  const handleClearBuffer = () => {
    const managed = terminalInstanceService.get(terminalId);
    if (managed?.terminal) {
      managed.terminal.write(VT100_FULL_CLEAR);
    }
  };

  if (!terminal) return <>{children}</>;

  const currentLocation: TerminalLocation = forceLocation ?? terminal.location ?? "grid";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {/* Layout Actions */}
        {currentLocation === "grid" ? (
          <ContextMenuItem onClick={() => moveTerminalToDock(terminalId)}>
            <ArrowDownToLine className="w-4 h-4 mr-2" aria-hidden="true" />
            Minimize to Dock
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onClick={() => moveTerminalToGrid(terminalId)}>
            <ArrowUp className="w-4 h-4 mr-2" aria-hidden="true" />
            Restore to Grid
          </ContextMenuItem>
        )}

        {currentLocation === "grid" && (
          <ContextMenuItem onClick={() => toggleMaximize(terminalId)}>
            {isMaximized ? (
              <>
                <Minimize2 className="w-4 h-4 mr-2" aria-hidden="true" />
                Restore Size
                <ContextMenuShortcut>^⇧F</ContextMenuShortcut>
              </>
            ) : (
              <>
                <Maximize2 className="w-4 h-4 mr-2" aria-hidden="true" />
                Maximize
                <ContextMenuShortcut>^⇧F</ContextMenuShortcut>
              </>
            )}
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => restartTerminal(terminalId)}>
          <RotateCcw className="w-4 h-4 mr-2" aria-hidden="true" />
          Restart Terminal
        </ContextMenuItem>

        <ContextMenuItem onClick={handleDuplicate}>
          <Copy className="w-4 h-4 mr-2" aria-hidden="true" />
          Duplicate Terminal
        </ContextMenuItem>

        <ContextMenuItem onClick={handleClearBuffer}>
          <Eraser className="w-4 h-4 mr-2" aria-hidden="true" />
          Clear Scrollback
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          onClick={() => trashTerminal(terminalId)}
          className="text-[var(--color-status-error)] focus:text-[var(--color-status-error)]"
        >
          <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
          Close Terminal
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => removeTerminal(terminalId)}
          className="text-[var(--color-status-error)] focus:text-[var(--color-status-error)]"
        >
          <X className="w-4 h-4 mr-2" aria-hidden="true" />
          End Terminal
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
