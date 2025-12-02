import { useState, useCallback } from "react";
import { Maximize2, X, Loader2, Terminal, Command } from "lucide-react";
import {
  ClaudeIcon,
  GeminiIcon,
  CodexIcon,
  NpmIcon,
  YarnIcon,
  PnpmIcon,
  BunIcon,
} from "@/components/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useTerminalStore, type TerminalInstance } from "@/store";
import { XtermAdapter } from "@/components/Terminal/XtermAdapter";
import type { AgentState, TerminalType } from "@/types";
import { setTerminalDragData } from "@/utils/dragDrop";

interface DockedTerminalItemProps {
  terminal: TerminalInstance;
  index: number;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onDragStart?: (id: string, index: number) => void;
  onDragEnd?: () => void;
}

function getTerminalIcon(type: TerminalType, className?: string) {
  const props = { className: cn("w-3 h-3", className), "aria-hidden": "true" as const };
  switch (type) {
    case "claude":
      return <ClaudeIcon {...props} />;
    case "gemini":
      return <GeminiIcon {...props} />;
    case "codex":
      return <CodexIcon {...props} />;
    case "npm":
      return <NpmIcon {...props} />;
    case "yarn":
      return <YarnIcon {...props} />;
    case "pnpm":
      return <PnpmIcon {...props} />;
    case "bun":
      return <BunIcon {...props} />;
    case "custom":
      return <Command {...props} />;
    case "shell":
    default:
      return <Terminal {...props} />;
  }
}

// Uses Digital Ecology palette: violet for working, emerald for success.
function getStateIndicator(state?: AgentState) {
  if (!state || state === "idle") return null;

  switch (state) {
    case "working":
      return <Loader2 className="h-3 w-3 animate-spin text-purple-500" aria-hidden="true" />;
    case "waiting":
      return (
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
      );
    case "completed":
      return <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />;
    case "failed":
      return <span className="w-2 h-2 rounded-full bg-red-400" aria-hidden="true" />;
    default:
      return null;
  }
}

export function DockedTerminalItem({
  terminal,
  index,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
}: DockedTerminalItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const moveTerminalToGrid = useTerminalStore((s) => s.moveTerminalToGrid);
  const trashTerminal = useTerminalStore((s) => s.trashTerminal);

  const handleRestore = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      moveTerminalToGrid(terminal.id);
      setIsOpen(false);
    },
    [moveTerminalToGrid, terminal.id]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      trashTerminal(terminal.id);
      setIsOpen(false);
    },
    [trashTerminal, terminal.id]
  );

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (isOpen) {
        e.preventDefault();
        return;
      }

      // Create custom drag image that looks like a terminal card
      const dragIcon = document.createElement("div");
      dragIcon.style.cssText = `
        position: absolute;
        top: -1000px;
        width: 200px;
        height: 150px;
        background-color: #18181b;
        border: 1px solid #27272a;
        border-radius: 8px;
        padding: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        color: #e5e5e5;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        pointer-events: none;
      `;
      dragIcon.innerText = terminal.title;
      document.body.appendChild(dragIcon);

      // Set the custom drag image centered on cursor
      e.dataTransfer.setDragImage(dragIcon, 100, 75);

      // Clean up after browser captures the image (Firefox/Safari need a tick)
      requestAnimationFrame(() => {
        if (dragIcon.parentNode) {
          dragIcon.remove();
        }
      });

      setTerminalDragData(e.dataTransfer, {
        terminalId: terminal.id,
        sourceLocation: "dock",
        sourceIndex: index,
      });

      onDragStart?.(terminal.id, index);
    },
    [terminal.id, terminal.title, index, isOpen, onDragStart]
  );

  const handleDragEnd = useCallback(() => {
    onDragEnd?.();
  }, [onDragEnd]);

  return (
    <div className="relative flex items-center">
      {isDropTarget && <div className="absolute -left-1.5 w-0.5 h-6 bg-canopy-accent rounded" />}

      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            data-docked-terminal-id={terminal.id}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded text-xs border transition-all",
              "hover:bg-canopy-accent/10 border-canopy-border hover:border-canopy-accent/50",
              "cursor-grab active:cursor-grabbing",
              isOpen && "bg-canopy-accent/20 border-canopy-accent",
              isDragging && "opacity-50 ring-2 ring-canopy-accent"
            )}
            title={`${terminal.title} - Click to preview, drag to reorder`}
            draggable={!isOpen}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            aria-grabbed={isDragging}
          >
            {getTerminalIcon(terminal.type)}
            {getStateIndicator(terminal.agentState)}
            <span className="truncate max-w-[120px] font-mono">{terminal.title}</span>
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[700px] h-[500px] p-0 border-canopy-border bg-canopy-bg shadow-2xl"
          side="top"
          align="start"
          sideOffset={8}
        >
          <div className="flex flex-col h-full">
            <div className="h-9 flex items-center justify-between px-3 border-b border-canopy-border bg-canopy-bg shrink-0">
              <div className="flex items-center gap-2">
                {getTerminalIcon(terminal.type, "text-canopy-text/70")}
                {getStateIndicator(terminal.agentState)}
                <span className="font-mono text-xs text-canopy-text">{terminal.title}</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleRestore}
                  className="p-1 hover:bg-canopy-accent/20 rounded transition-colors text-canopy-text/60 hover:text-canopy-text"
                  title="Restore to grid"
                >
                  <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>

                <button
                  onClick={handleClose}
                  className="p-1 hover:bg-red-500/20 rounded transition-colors text-canopy-text/60 hover:text-red-400"
                  title="Close session"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex-1 relative overflow-hidden min-h-0">
              <XtermAdapter terminalId={terminal.id} className="absolute inset-0" />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
