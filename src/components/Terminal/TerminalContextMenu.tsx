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
  Copy,
  Settings2,
  Skull,
  RotateCcw,
} from "lucide-react";
import { useTerminalStore } from "@/store";
import type { TerminalLocation } from "@/types";

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
  const isMaximized = useTerminalStore((s) => s.maximizedId === terminalId);

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
          <Skull className="w-4 h-4 mr-2" aria-hidden="true" />
          Force Kill
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
