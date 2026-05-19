import { CloudOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePRCircuitBreakerStore } from "@/store/prCircuitBreakerStore";

export function PRDetectionPausedIndicator({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const tripped = usePRCircuitBreakerStore((s) => s.tripped);

  if (!tripped) return null;

  return (
    <Tooltip defaultOpen={defaultOpen}>
      <TooltipTrigger asChild>
        <div
          role="status"
          aria-live="polite"
          aria-label="PR detection paused — retrying"
          className="flex h-full items-center gap-1.5 px-2.5 text-[10px] font-medium text-muted-foreground"
        >
          <CloudOff className="h-3 w-3 opacity-70" aria-hidden />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="px-3 py-1.5">
        <span className="text-xs text-text-secondary">PR detection paused — retrying</span>
      </TooltipContent>
    </Tooltip>
  );
}
