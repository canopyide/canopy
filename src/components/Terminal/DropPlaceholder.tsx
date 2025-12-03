import { cn } from "@/lib/utils";

interface DropPlaceholderProps {
  className?: string;
  label?: string;
}

export function DropPlaceholder({ className, label }: DropPlaceholderProps) {
  return (
    <div
      className={cn(
        "h-full w-full rounded-lg border-2 border-dashed border-canopy-accent/30 bg-canopy-accent/5",
        "flex items-center justify-center p-4",
        "animate-in fade-in duration-200",
        className
      )}
    >
      <span className="text-sm font-medium text-canopy-accent/50 select-none">
        {label || "Drop here"}
      </span>
    </div>
  );
}
