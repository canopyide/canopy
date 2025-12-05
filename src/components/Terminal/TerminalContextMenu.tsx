import { useCallback } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuCheckboxItem,
} from "@/components/ui/context-menu";
import { Maximize2, Minimize2, Trash2, ArrowUp, ArrowDownToLine, Copy, Settings2, Skull, RotateCcw } from "lucide-react";
import { useTerminalStore } from "@/store";
import { useContextInjection } from "@/hooks/useContextInjection";
import type { TerminalLocation } from "@/types";

interface TerminalContextMenuProps {
  terminalId: string;
  children: React.ReactNode;
  forceLocation?: TerminalLocation;
}

/**
 * Right-click context menu for terminal components.
 * Integrates with terminal store for actions and context injection.
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
  const updateTerminalSettings = useTerminalStore((s) => s.updateTerminalSettings);
  const restartTerminal = useTerminalStore((s) => s.restartTerminal);
  const isMaximized = useTerminalStore((s) => s.maximizedId === terminalId);

  const { inject } = useContextInjection();

  const handleInjectContext = useCallback(() => {
    if (terminal?.worktreeId) {
      inject(terminal.worktreeId, terminalId);
    }
  }, [terminal, terminalId, inject]);

  if (!terminal) return <>{children}</>;

  const currentLocation: TerminalLocation = forceLocation ?? terminal.location ?? "grid";
  const isAgent = ["claude", "gemini", "codex"].includes(terminal.type);
  const canInjectContext = terminal.worktreeId && isAgent;

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

        {/* Functionality Actions */}
        {terminal.worktreeId && (
          <ContextMenuItem onClick={handleInjectContext} disabled={!canInjectContext}>
            <Copy className="w-4 h-4 mr-2" aria-hidden="true" />
            Inject Context
            <ContextMenuShortcut>^⇧I</ContextMenuShortcut>
          </ContextMenuItem>
        )}

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Settings2 className="w-4 h-4 mr-2" aria-hidden="true" />
            Settings
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuCheckboxItem
              checked={terminal.settings?.autoRestart ?? isAgent}
              onCheckedChange={(checked) =>
                updateTerminalSettings(terminalId, { autoRestart: checked === true })
              }
            >
              Auto-restart on open
            </ContextMenuCheckboxItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

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
