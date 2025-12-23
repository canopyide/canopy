import { cn } from "@/lib/utils";
import { Square, FileText, GitBranch, Globe } from "lucide-react";
import type { PanelKind } from "@/types";

export interface PanelListItemProps {
  id: string;
  kind: PanelKind;
  name: string;
  iconId: string;
  color: string;
  description?: string;
  isSelected: boolean;
  onClick: () => void;
}

const ICON_MAP: Record<string, typeof Square> = {
  note: FileText,
  "git-branch": GitBranch,
  globe: Globe,
  square: Square,
};

export function PanelListItem({
  id,
  kind,
  name,
  iconId,
  color,
  description,
  isSelected,
  onClick,
}: PanelListItemProps) {
  const Icon = ICON_MAP[iconId] || Square;

  return (
    <div
      id={id}
      role="option"
      aria-selected={isSelected}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 cursor-pointer",
        "transition-colors duration-100",
        isSelected
          ? "bg-[var(--color-surface-dim)]"
          : "hover:bg-[var(--color-surface-dim)]/50"
      )}
      onClick={onClick}
    >
      <div
        className="flex items-center justify-center w-8 h-8 rounded"
        style={{ backgroundColor: `${color}20`, color }}
      >
        <Icon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-canopy-text truncate">{name}</span>
          {description && (
            <span className="text-xs text-canopy-text/50 truncate">{description}</span>
          )}
        </div>
        <div className="text-xs text-canopy-text/60 truncate">{kind}</div>
      </div>
    </div>
  );
}
