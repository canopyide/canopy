import { ChevronDown } from "lucide-react";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";
import { ScrollPill } from "@/components/ui/ScrollPill";
import { useUnseenOutput } from "@/hooks/useUnseenOutput";
import { terminalInstanceService } from "@/services/TerminalInstanceService";

export interface TerminalScrollIndicatorProps {
  terminalId: string;
}

export function TerminalScrollIndicator({ terminalId }: TerminalScrollIndicatorProps) {
  const { hasUnseenOutput } = useUnseenOutput(terminalId);
  // Instant hide (animationDuration: 0): once the user catches up the pill
  // should disappear immediately rather than fade out symmetrically with show.
  const { isVisible, shouldRender } = useAnimatedPresence({
    isOpen: hasUnseenOutput,
    animationDuration: 0,
  });

  if (!shouldRender) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    terminalInstanceService.resumeAutoScroll(terminalId);
    requestAnimationFrame(() => terminalInstanceService.focus(terminalId));
  };

  return (
    <div className="absolute inset-0 z-30 pointer-events-none flex items-end justify-end pb-1.5 pr-[14px]">
      <ScrollPill
        isVisible={isVisible}
        translateDirection="down"
        className="flex items-center gap-1 px-2 py-0.5"
        onClick={handleClick}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Scroll to latest output"
      >
        <ChevronDown className="h-3 w-3" />
        New output below
      </ScrollPill>
    </div>
  );
}
