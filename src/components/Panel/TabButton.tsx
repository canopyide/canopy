import React, { useCallback } from "react";
import { X } from "lucide-react";
import type { PanelKind, TerminalType, AgentState } from "@/types";
import { cn } from "@/lib/utils";
import { getBrandColorHex } from "@/lib/colorUtils";
import { TerminalIcon } from "@/components/Terminal/TerminalIcon";
import { STATE_ICONS, STATE_COLORS } from "@/components/Worktree/terminalStateConfig";

export interface TabInfo {
  id: string;
  title: string;
  type?: TerminalType;
  agentId?: string;
  kind: PanelKind;
  agentState?: AgentState;
  isActive: boolean;
}

export interface TabButtonProps {
  id: string;
  title: string;
  type?: TerminalType;
  agentId?: string;
  kind: PanelKind;
  agentState?: AgentState;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
}

function TabButtonComponent({
  id,
  title,
  type,
  agentId,
  kind,
  agentState,
  isActive,
  onClick,
  onClose,
}: TabButtonProps) {
  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose();
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
    [onClick]
  );

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Stop propagation to prevent drag handle from capturing tab interactions
    e.stopPropagation();
  }, []);

  const handleCloseKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  const showStateIcon = agentState && agentState !== "idle" && agentState !== "completed";
  const StateIcon = showStateIcon ? STATE_ICONS[agentState] : null;

  return (
    <div
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 text-xs font-medium select-none cursor-pointer group/tab",
        "border-r border-divider transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent focus-visible:outline-offset-[-2px]",
        isActive
          ? "bg-white/[0.04] text-canopy-text"
          : "text-canopy-text/60 hover:text-canopy-text hover:bg-white/[0.02]"
      )}
      title={title}
      data-tab-id={id}
    >
      <span className="shrink-0 flex items-center justify-center w-3.5 h-3.5">
        <TerminalIcon
          type={type}
          kind={kind}
          agentId={agentId}
          className="w-3.5 h-3.5"
          brandColor={getBrandColorHex(agentId ?? type)}
        />
      </span>

      <span className="truncate max-w-[100px]">{title}</span>

      {showStateIcon && StateIcon && (
        <StateIcon
          className={cn(
            "w-3 h-3 shrink-0",
            STATE_COLORS[agentState],
            agentState === "working" && "animate-spin",
            agentState === "waiting" && "animate-breathe",
            "motion-reduce:animate-none"
          )}
          aria-hidden="true"
        />
      )}

      {/* Close button - visible on hover */}
      <button
        onClick={handleClose}
        onKeyDown={handleCloseKeyDown}
        className={cn(
          "shrink-0 p-0.5 -mr-1 rounded transition-colors",
          "opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100",
          "hover:bg-[color-mix(in_oklab,var(--color-status-error)_15%,transparent)]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent focus-visible:outline-offset-1",
          "text-canopy-text/40 hover:text-[var(--color-status-error)]"
        )}
        title="Close tab"
        aria-label={`Close ${title}`}
        type="button"
      >
        <X className="w-3 h-3" aria-hidden="true" />
      </button>
    </div>
  );
}

export const TabButton = React.memo(TabButtonComponent);
