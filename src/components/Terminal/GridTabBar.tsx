import React from "react";
import { cn } from "@/lib/utils";
import { TerminalIcon } from "./TerminalIcon";
import type { TerminalInstance } from "@/store";
import type { AgentState } from "@/types";
import { STATE_ICONS, STATE_COLORS } from "@/components/Worktree/terminalStateConfig";

export interface GridTabBarProps {
  groupId: string;
  panels: TerminalInstance[];
  activeTabId: string;
  onTabClick: (panelId: string) => void;
  isDragging?: boolean;
}

function GridTabBarComponent({
  groupId,
  panels,
  activeTabId,
  onTabClick,
  isDragging = false,
}: GridTabBarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 border-b border-divider bg-canopy-sidebar/50 px-1 py-0.5 shrink-0 overflow-x-auto",
        isDragging && "opacity-70"
      )}
      role="tablist"
      aria-label={`Tab group ${groupId}`}
    >
      {panels.map((panel) => {
        const isActive = activeTabId === panel.id;
        const agentState = panel.agentState;
        const showStateBadge =
          !isActive &&
          agentState &&
          (agentState === "waiting" || agentState === "failed" || agentState === "working");

        return (
          <button
            key={panel.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${panel.id}`}
            onClick={() => onTabClick(panel.id)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-t transition-colors min-w-0 max-w-[200px] group",
              isActive
                ? "bg-canopy-bg text-canopy-text border-t border-l border-r border-divider -mb-px"
                : "text-canopy-text/60 hover:text-canopy-text hover:bg-canopy-bg/50"
            )}
            title={panel.title}
          >
            <span className="shrink-0">
              <TerminalIcon
                type={panel.type}
                kind={panel.kind}
                agentId={panel.agentId}
                className="w-3.5 h-3.5"
              />
            </span>
            <span className="truncate">{panel.title}</span>
            {showStateBadge && <AgentStateBadge state={agentState} />}
          </button>
        );
      })}
    </div>
  );
}

interface AgentStateBadgeProps {
  state: AgentState;
}

function AgentStateBadge({ state }: AgentStateBadgeProps) {
  const StateIcon = STATE_ICONS[state];
  if (!StateIcon) return null;

  return (
    <span
      className={cn(
        "shrink-0 flex items-center justify-center w-4 h-4 rounded-full",
        STATE_COLORS[state]
      )}
      title={`Agent ${state}`}
      aria-label={`Agent state: ${state}`}
    >
      <StateIcon
        className={cn(
          "w-3 h-3",
          state === "working" && "animate-spin",
          state === "waiting" && "animate-breathe",
          "motion-reduce:animate-none"
        )}
        aria-hidden="true"
      />
    </span>
  );
}

export const GridTabBar = React.memo(GridTabBarComponent);
