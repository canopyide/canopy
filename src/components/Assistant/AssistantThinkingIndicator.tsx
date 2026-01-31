import { cn } from "@/lib/utils";

interface AssistantThinkingIndicatorProps {
  className?: string;
}

export function AssistantThinkingIndicator({ className }: AssistantThinkingIndicatorProps) {
  return (
    <div
      className={cn("relative pt-5 pb-12 px-0 group", className)}
      role="status"
      aria-label="Assistant is processing"
    >
      {/* Thread line - positioned to align with response layout */}
      <div className="absolute left-[29px] top-0 bottom-0 w-px bg-white/[0.06] group-hover:bg-white/[0.1] transition-colors" />

      {/* Animated processing indicator */}
      <div className="pl-[60px] flex items-center gap-3">
        {/* Terminal-style CSS Spinner */}
        <div className="relative w-3.5 h-3.5" aria-hidden="true">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-canopy-accent animate-spin" />
        </div>

        {/* Subtle Pulsing Text with bouncing dots */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-canopy-text/50 font-mono animate-pulse">Thinking</span>
          <span className="flex gap-0.5 mt-1">
            <span className="w-0.5 h-0.5 bg-canopy-text/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-0.5 h-0.5 bg-canopy-text/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-0.5 h-0.5 bg-canopy-text/50 rounded-full animate-bounce" />
          </span>
        </div>
      </div>
    </div>
  );
}
