import { cn } from "@/lib/utils";

interface GridPlaceholderProps {
  className?: string;
}

export function GridPlaceholder({ className }: GridPlaceholderProps) {
  return (
    <div
      className={cn(
        "h-full min-h-[200px] rounded-lg",
        "border-2 border-dashed border-canopy-accent/40",
        "bg-canopy-accent/5",
        "animate-pulse",
        className
      )}
      aria-hidden="true"
    />
  );
}
