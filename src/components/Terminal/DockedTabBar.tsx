import { cn, getBaseTitle } from "@/lib/utils";
import { getBrandColorHex } from "@/lib/colorUtils";
import { TerminalIcon } from "./TerminalIcon";
import type { TerminalInstance } from "@/store";

interface DockedTabBarProps {
  panels: TerminalInstance[];
  activeTabId: string;
  onTabClick: (panelId: string) => void;
}

export function DockedTabBar({ panels, activeTabId, onTabClick }: DockedTabBarProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-black/20 border-b border-white/5 overflow-x-auto no-scrollbar">
      {panels.map((panel) => {
        const isActive = activeTabId === panel.id;
        const brandColor = getBrandColorHex(panel.type);
        const displayTitle = getBaseTitle(panel.title);

        return (
          <button
            key={panel.id}
            onClick={(e) => {
              e.stopPropagation();
              onTabClick(panel.id);
            }}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors shrink-0",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent",
              isActive
                ? "bg-white/10 text-canopy-text"
                : "text-canopy-text/60 hover:bg-white/5 hover:text-canopy-text/80"
            )}
            title={panel.title}
          >
            <TerminalIcon
              type={panel.type}
              kind={panel.kind}
              className="w-3 h-3 shrink-0"
              brandColor={brandColor}
            />
            <span className="truncate max-w-[80px]">{displayTitle}</span>
          </button>
        );
      })}
    </div>
  );
}
