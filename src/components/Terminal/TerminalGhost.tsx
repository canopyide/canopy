import { cn } from "@/lib/utils";

interface TerminalGhostProps {
  className?: string;
  label?: string;
}

export function TerminalGhost({ className, label }: TerminalGhostProps) {
  return (
    <div
      className={cn(
        "flex flex-col h-full w-full rounded-lg border-2 border-dashed transition-all duration-200",
        "border-white/10 bg-white/[0.02]",
        className
      )}
    >
      {/* Ghost Header */}
      <div className="flex items-center h-7 px-3 border-b border-white/5 bg-white/[0.02]">
        <div className="w-3 h-3 rounded-full bg-white/10 mr-2" />
        <div className="h-2 w-24 bg-white/10 rounded" />
      </div>

      {/* Ghost Body */}
      <div className="flex-1 flex items-center justify-center">
        {label && (
          <span className="text-xs font-mono text-white/20 select-none uppercase tracking-widest">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
