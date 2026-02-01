import { cn } from "@/lib/utils";

interface RetryState {
  attempt: number;
  maxAttempts: number;
  isRetrying: boolean;
}

interface AssistantThinkingIndicatorProps {
  className?: string;
  retryState?: RetryState | null;
}

export function AssistantThinkingIndicator({
  className,
  retryState,
}: AssistantThinkingIndicatorProps) {
  const isRetrying = retryState?.isRetrying ?? false;
  const statusText = isRetrying
    ? `Retrying (${retryState!.attempt}/${retryState!.maxAttempts})`
    : "Thinking";
  const ariaLabel = isRetrying
    ? `Retrying request, attempt ${retryState!.attempt} of ${retryState!.maxAttempts}`
    : "Assistant is processing";

  return (
    <div className={cn("relative py-5 group", className)} role="status" aria-label={ariaLabel}>
      {/* Thread line - positioned to align with response layout */}
      <div className="absolute left-[29px] top-0 bottom-0 w-px bg-white/[0.06] group-hover:bg-white/[0.1] transition-colors" />

      {/* Animated processing indicator */}
      <div className="pl-[60px] flex items-center gap-3">
        {/* Terminal-style CSS Spinner - amber when retrying */}
        <div className="relative w-3.5 h-3.5" aria-hidden="true">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div
            className={cn(
              "absolute inset-0 rounded-full border-2 border-transparent animate-spin",
              isRetrying ? "border-t-amber-400" : "border-t-canopy-accent"
            )}
          />
        </div>

        {/* Subtle Pulsing Text with bouncing dots */}
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "text-xs font-mono animate-pulse",
              isRetrying ? "text-amber-400/70" : "text-canopy-text/50"
            )}
          >
            {statusText}
          </span>
          <span className="flex gap-0.5 mt-1">
            <span
              className={cn(
                "w-0.5 h-0.5 rounded-full animate-bounce [animation-delay:-0.3s]",
                isRetrying ? "bg-amber-400/50" : "bg-canopy-text/50"
              )}
            />
            <span
              className={cn(
                "w-0.5 h-0.5 rounded-full animate-bounce [animation-delay:-0.15s]",
                isRetrying ? "bg-amber-400/50" : "bg-canopy-text/50"
              )}
            />
            <span
              className={cn(
                "w-0.5 h-0.5 rounded-full animate-bounce",
                isRetrying ? "bg-amber-400/50" : "bg-canopy-text/50"
              )}
            />
          </span>
        </div>
      </div>
    </div>
  );
}
