import { CircleDot, Terminal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ProjectActionRowProps {
  activeCount: number | null;
  waitingCount: number | null;
  isLoading?: boolean;
  showTerminate?: boolean;
  terminateDisabled?: boolean;
  onTerminate: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

export function ProjectActionRow({
  activeCount,
  waitingCount,
  isLoading = false,
  showTerminate = false,
  terminateDisabled = false,
  onTerminate,
  className,
}: ProjectActionRowProps) {
  const activeLabel = isLoading || activeCount == null ? "—" : String(activeCount);
  const waitingLabel = isLoading || waitingCount == null ? "—" : String(waitingCount);

  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <div className="flex items-center gap-1.5 min-w-0">
        <div
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-md)]",
            "bg-white/[0.03] border border-white/[0.06]",
            "text-[11px] font-mono tabular-nums text-canopy-text/65"
          )}
          aria-label={
            isLoading || activeCount == null
              ? "Active terminals loading"
              : `${activeCount} active terminal${activeCount === 1 ? "" : "s"}`
          }
        >
          <Terminal className="h-3.5 w-3.5 text-canopy-text/50" aria-hidden="true" />
          <span className="min-w-[1ch] text-right">{activeLabel}</span>
        </div>

        <div
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-md)]",
            "bg-white/[0.03] border border-white/[0.06]",
            "text-[11px] font-mono tabular-nums",
            (waitingCount ?? 0) > 0 ? "text-emerald-300/90" : "text-canopy-text/55"
          )}
          aria-label={
            isLoading || waitingCount == null
              ? "Waiting terminals loading"
              : `${waitingCount} waiting terminal${waitingCount === 1 ? "" : "s"}`
          }
        >
          <CircleDot className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          <span className="min-w-[1ch] text-right">{waitingLabel}</span>
        </div>
      </div>

      {showTerminate && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={terminateDisabled}
          onClick={onTerminate}
          className={cn(
            "h-7 px-2 gap-1.5",
            "text-muted-foreground hover:text-red-500",
            "hover:bg-red-500/10"
          )}
          aria-label="Terminate project terminals"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-[11px] font-medium">Terminate</span>
        </Button>
      )}
    </div>
  );
}
