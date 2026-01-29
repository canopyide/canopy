import { cn } from "@/lib/utils";

interface StreamingCursorProps {
  className?: string;
}

export function StreamingCursor({ className }: StreamingCursorProps) {
  return (
    <span
      className={cn(
        "inline-block w-1.5 h-4 bg-canopy-accent/70 ml-1 align-middle rounded-sm animate-pulse",
        className
      )}
      aria-hidden="true"
      aria-label="Assistant is typing"
    />
  );
}
