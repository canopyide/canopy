import { cn } from "@/lib/utils";

interface AssistantThinkingIndicatorProps {
  className?: string;
}

export function AssistantThinkingIndicator({ className }: AssistantThinkingIndicatorProps) {
  return (
    <div
      className={cn("relative pt-5 pb-6 px-0", className)}
      role="status"
      aria-label="Assistant is processing"
    >
      {/* Thread line - positioned to align with response layout */}
      <div className="absolute left-[29px] top-0 bottom-0 w-px bg-white/[0.06]" />

      {/* Animated processing indicator */}
      <div className="pl-[60px] flex items-center gap-3">
        <div className="relative w-4 h-4" aria-hidden="true">
          <div className="absolute inset-0 rounded-full border-2 border-canopy-text/10" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-canopy-accent animate-spin" />
        </div>
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-canopy-accent/60 animate-pulse [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-canopy-accent/60 animate-pulse [animation-delay:200ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-canopy-accent/60 animate-pulse [animation-delay:400ms]" />
        </div>
      </div>
    </div>
  );
}
