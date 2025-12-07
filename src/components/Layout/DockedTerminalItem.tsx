import { useState, useCallback, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDndMonitor } from "@dnd-kit/core";
import { Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getBrandColorHex } from "@/lib/colorUtils";
import { getTerminalAnimationDuration } from "@/lib/animationUtils";
import { useTerminalStore, useSidecarStore, type TerminalInstance } from "@/store";
import { TerminalPane } from "@/components/Terminal/TerminalPane";
import { TerminalContextMenu } from "@/components/Terminal/TerminalContextMenu";
import { TerminalIcon } from "@/components/Terminal/TerminalIcon";
import type { AgentState } from "@/types";
import { TerminalRefreshTier } from "@/types";
import { terminalClient } from "@/clients";
import { terminalInstanceService } from "@/services/TerminalInstanceService";

interface DockedTerminalItemProps {
  terminal: TerminalInstance;
}

function getStateIndicator(state?: AgentState) {
  if (!state || state === "idle" || state === "working") return null;

  switch (state) {
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

export function DockedTerminalItem({ terminal }: DockedTerminalItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);
  const moveTerminalToGrid = useTerminalStore((s) => s.moveTerminalToGrid);
  const trashTerminal = useTerminalStore((s) => s.trashTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
  const setFocused = useTerminalStore((s) => s.setFocused);

  const { isOpen: sidecarOpen, width: sidecarWidth } = useSidecarStore(
    useShallow((s) => ({ isOpen: s.isOpen, width: s.width }))
  );

  const collisionPadding = useMemo(() => {
    const basePadding = 16;
    return {
      top: basePadding,
      left: basePadding,
      bottom: basePadding,
      right: sidecarOpen ? sidecarWidth + basePadding : basePadding,
    };
  }, [sidecarOpen, sidecarWidth]);

  // Toggle buffering based on popover open state
  useEffect(() => {
    if (isRestoring) return;

    let cancelled = false;

    const applyBufferingState = async () => {
      try {
        if (isOpen) {
          if (!cancelled) {
            await terminalClient.setBuffering(terminal.id, false);
            await terminalClient.flush(terminal.id);
            terminalInstanceService.applyRendererPolicy(terminal.id, TerminalRefreshTier.VISIBLE);
          }
        } else {
          if (!cancelled) {
            await terminalClient.setBuffering(terminal.id, true);
            terminalInstanceService.applyRendererPolicy(
              terminal.id,
              TerminalRefreshTier.BACKGROUND
            );
          }
        }
      } catch (error) {
        console.warn(`Failed to apply buffering state for terminal ${terminal.id}:`, error);
      }
    };

    applyBufferingState();

    return () => {
      cancelled = true;
    };
  }, [isOpen, terminal.id, isRestoring]);

  // Auto-close popover when drag starts for this terminal
  useDndMonitor({
    onDragStart: ({ active }) => {
      if (active.id === terminal.id && isOpen) {
        setIsOpen(false);
      }
    },
  });

  const handleRestore = useCallback(() => {
    setIsRestoring(true);
    setIsOpen(false);
    moveTerminalToGrid(terminal.id);
  }, [moveTerminalToGrid, terminal.id]);

  const handleMinimize = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  const handleClose = useCallback(
    (force?: boolean) => {
      if (force) {
        removeTerminal(terminal.id);
        setIsOpen(false);
      } else {
        const duration = getTerminalAnimationDuration();
        setIsTrashing(true);
        setTimeout(() => {
          trashTerminal(terminal.id);
          setIsOpen(false);
        }, duration);
      }
    },
    [trashTerminal, removeTerminal, terminal.id, setIsOpen]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open) {
        setFocused(terminal.id);
      }
    },
    [setFocused, setIsOpen, terminal.id]
  );

  const isWorking = terminal.agentState === "working";
  const brandColor = getBrandColorHex(terminal.type);

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <TerminalContextMenu terminalId={terminal.id} forceLocation="dock">
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded text-xs border transition-all",
              "hover:bg-canopy-accent/10 border-canopy-border hover:border-canopy-accent/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canopy-bg",
              "cursor-grab active:cursor-grabbing",
              isOpen && "bg-canopy-accent/20 border-canopy-accent"
            )}
            onClick={() => setFocused(terminal.id)}
            title={`${terminal.title} - Click to preview, drag to reorder`}
          >
            {isWorking ? (
              <Loader2
                className="w-3 h-3 animate-spin"
                style={{ color: brandColor }}
                aria-hidden="true"
              />
            ) : (
              <TerminalIcon type={terminal.type} className="w-3 h-3" brandColor={brandColor} />
            )}
            {getStateIndicator(terminal.agentState)}
            <span className="truncate max-w-[120px] font-mono">{terminal.title}</span>
          </button>
        </PopoverTrigger>
      </TerminalContextMenu>

      <PopoverContent
        className="w-[700px] h-[500px] p-0 border-canopy-border bg-canopy-bg shadow-2xl"
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={collisionPadding}
      >
        <TerminalPane
          id={terminal.id}
          title={terminal.title}
          type={terminal.type}
          worktreeId={terminal.worktreeId}
          cwd={terminal.cwd}
          isFocused={true}
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
          restartKey={terminal.restartKey}
          onFocus={() => setFocused(terminal.id)}
          onClose={handleClose}
          onRestore={handleRestore}
          onMinimize={handleMinimize}
          isTrashing={isTrashing}
        />
      </PopoverContent>
    </Popover>
  );
}
