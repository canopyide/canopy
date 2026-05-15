import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAnimatedPresence } from "../../hooks/useAnimatedPresence";
import { ScrollPill } from "@/components/ui/ScrollPill";

interface ScrollIndicatorProps {
  direction: "above" | "below";
  count: number;
  onClick: () => void;
  tabIndex?: number;
  ariaHidden?: boolean;
}

export function ScrollIndicator({
  direction,
  count,
  onClick,
  tabIndex,
  ariaHidden,
}: ScrollIndicatorProps) {
  const { isVisible, shouldRender } = useAnimatedPresence({ isOpen: count > 0 });

  if (!shouldRender) return null;

  const Icon = direction === "above" ? ChevronUp : ChevronDown;

  return (
    <div
      aria-hidden={ariaHidden || undefined}
      className={cn(
        "absolute left-0 right-0 z-20 pointer-events-none flex justify-center",
        direction === "above" ? "top-0 pt-2" : "bottom-0 pb-2"
      )}
    >
      <ScrollPill
        isVisible={isVisible}
        translateDirection={direction === "above" ? "up" : "down"}
        onClick={onClick}
        onPointerDown={(e) => e.stopPropagation()}
        tabIndex={tabIndex}
        aria-label={
          direction === "above"
            ? `Scroll up, ${count} more above`
            : `Scroll down, ${count} more below`
        }
        className="flex items-center gap-1.5 px-2.5 py-1"
      >
        <Icon className="h-3 w-3" />
        <span className="font-medium tabular-nums">{count}</span>
        <span>more {direction}</span>
      </ScrollPill>
    </div>
  );
}
