import { useState, useCallback, useEffect } from "react";
import { Loader2, Terminal, Command } from "lucide-react";
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
import { getBrandColorHex } from "@/lib/colorUtils";
import { useTerminalStore, type TerminalInstance } from "@/store";
import { TerminalPane } from "@/components/Terminal/TerminalPane";
import { useContextInjection } from "@/hooks/useContextInjection";
import type { AgentState, TerminalType } from "@/types";
import { TerminalRefreshTier } from "@/types";
import { setTerminalDragData } from "@/utils/dragDrop";
import { terminalClient } from "@/clients";
import { terminalInstanceService } from "@/services/TerminalInstanceService";

interface DockedTerminalItemProps {
  terminal: TerminalInstance;
  index: number;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onDragStart?: (id: string, index: number) => void;
  onDragEnd?: () => void;
}

function getTerminalIcon(type: TerminalType, className?: string) {
  const brandColor = getBrandColorHex(type);
  const props = { className: cn("w-3 h-3", className), "aria-hidden": "true" as const };
  switch (type) {
    case "claude":
      return <ClaudeIcon {...props} brandColor={brandColor} />;
    case "gemini":
      return <GeminiIcon {...props} brandColor={brandColor} />;
    case "codex":
      return <CodexIcon {...props} brandColor={brandColor} />;
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

function getStateIndicator(state?: AgentState) {
  if (!state || state === "idle") return null;

  switch (state) {
    case "working":
      return (
        <Loader2
          className="h-3 w-3 animate-spin text-[var(--color-state-working)]"
          aria-hidden="true"
        />
      );
    case "completed":
      return (
        <span
          className="w-2 h-2 rounded-full bg-[var(--color-status-success)]"
          aria-hidden="true"
        />
      );
    case "failed":
      return (
        <span className="w-2 h-2 rounded-full bg-[var(--color-status-error)]" aria-hidden="true" />
      );
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
  const [isRestoring, setIsRestoring] = useState(false);
  const moveTerminalToGrid = useTerminalStore((s) => s.moveTerminalToGrid);
  const trashTerminal = useTerminalStore((s) => s.trashTerminal);

  const { inject, cancel, isInjecting, progress } = useContextInjection();

  // Toggle buffering based on popover open state
  useEffect(() => {
    // Skip if terminal is being restored to avoid race with moveTerminalToGrid
    if (isRestoring) return;

    let cancelled = false;

    const applyBufferingState = async () => {
      try {
        if (isOpen) {
          // Popover opened - disable buffering and flush queued data
          if (!cancelled) {
            await terminalClient.setBuffering(terminal.id, false);
            await terminalClient.flush(terminal.id);
            terminalInstanceService.applyRendererPolicy(terminal.id, TerminalRefreshTier.VISIBLE);
          }
        } else {
          // Popover closed - enable buffering for resource optimization
          if (!cancelled) {
            await terminalClient.setBuffering(terminal.id, true);
            terminalInstanceService.applyRendererPolicy(
              terminal.id,
              TerminalRefreshTier.BACKGROUND
            );
          }
        }
      } catch (error) {
        // Terminal may have been trashed/exited - ignore errors
        console.warn(`Failed to apply buffering state for terminal ${terminal.id}:`, error);
      }
    };

    applyBufferingState();

    return () => {
      cancelled = true;
    };
  }, [isOpen, terminal.id, isRestoring]);

  const handleRestore = useCallback(() => {
    setIsRestoring(true);
    setIsOpen(false);
    moveTerminalToGrid(terminal.id);
  }, [moveTerminalToGrid, terminal.id]);

  const handleClose = useCallback(() => {
    trashTerminal(terminal.id);
    setIsOpen(false);
  }, [trashTerminal, terminal.id]);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const handleInjectContext = useCallback(async () => {
    if (!terminal.worktreeId) return;
    await inject(terminal.worktreeId, terminal.id);
  }, [inject, terminal.id, terminal.worktreeId]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (isOpen) {
        e.preventDefault();
        return;
      }

      // Create custom drag image that looks like a terminal card
      const dragIcon = document.createElement("div");
      const bgColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--color-canopy-bg")
        .trim();
      const borderColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--color-canopy-border")
        .trim();
      const textColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--color-canopy-text")
        .trim();

      dragIcon.style.cssText = `
        position: absolute;
        top: -1000px;
        width: 200px;
        height: 150px;
        background-color: ${bgColor || "#18181b"};
        border: 1px solid ${borderColor || "#27272a"};
        border-radius: 8px;
        padding: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        color: ${textColor || "#e5e5e5"};
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
          <TerminalPane
            id={terminal.id}
            title={terminal.title}
            type={terminal.type}
            worktreeId={terminal.worktreeId}
            cwd={terminal.cwd}
            isFocused={true}
            isInjecting={isInjecting}
            injectionProgress={progress}
            agentState={terminal.agentState}
            activity={
              terminal.activityHeadline
                ? {
                    headline: terminal.activityHeadline,
                    status: terminal.activityStatus ?? "working",
                    type: terminal.activityType ?? "interactive",
                  }
                : null
            }
            location="dock"
            onFocus={() => {}}
            onClose={handleClose}
            onRestore={handleRestore}
            onInjectContext={terminal.worktreeId ? handleInjectContext : undefined}
            onCancelInjection={cancel}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
