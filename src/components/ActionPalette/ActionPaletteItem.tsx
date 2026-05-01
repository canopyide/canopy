import React from "react";
import { cn } from "@/lib/utils";
import type { ActionPaletteItem as ActionPaletteItemType } from "@/hooks/useActionPalette";
import { ACTION_CATEGORY_COLORS, ACTION_CATEGORY_DEFAULT_COLOR } from "@/config/categoryColors";

interface ActionPaletteItemProps {
  item: ActionPaletteItemType;
  isSelected: boolean;
  onSelect: (item: ActionPaletteItemType) => void;
  onHover?: () => void;
}

export const ActionPaletteItem = React.memo(function ActionPaletteItem({
  item,
  isSelected,
  onSelect,
  onHover,
}: ActionPaletteItemProps) {
  const categoryColor = ACTION_CATEGORY_COLORS[item.category] ?? ACTION_CATEGORY_DEFAULT_COLOR;

  return (
    <button
      id={`action-option-${item.id}`}
      tabIndex={-1}
      onPointerDown={(e) => e.preventDefault()}
      onPointerMove={onHover}
      role="option"
      aria-selected={isSelected}
      aria-disabled={!item.enabled}
      disabled={!item.enabled}
      className={cn(
        "group relative w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-left transition-colors",
        "border border-transparent text-daintree-text/70",
        "hover:bg-overlay-subtle hover:text-daintree-text",
        "aria-selected:bg-overlay-soft aria-selected:border-overlay aria-selected:text-daintree-text",
        "aria-selected:before:absolute aria-selected:before:left-0 aria-selected:before:top-2 aria-selected:before:bottom-2",
        "aria-selected:before:w-[2px] aria-selected:before:rounded-r aria-selected:before:bg-daintree-accent aria-selected:before:content-['']",
        !item.enabled && "opacity-40 cursor-not-allowed"
      )}
      onClick={() => item.enabled && onSelect(item)}
    >
      <span
        className={cn(
          "shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight",
          categoryColor
        )}
      >
        {item.category}
      </span>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{item.title}</div>
        {item.description && (
          <div className="text-xs text-daintree-text/50 truncate">{item.description}</div>
        )}
        {!item.enabled && item.disabledReason && (
          <div className="text-[10px] text-daintree-text/40 italic truncate">
            {item.disabledReason}
          </div>
        )}
      </div>

      {item.keybinding && (
        <span className="shrink-0 text-[11px] font-mono text-daintree-text/40 transition-colors group-aria-selected:text-daintree-text/60">
          {item.keybinding}
        </span>
      )}
    </button>
  );
});
