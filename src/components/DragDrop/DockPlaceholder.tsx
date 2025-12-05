import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDndPlaceholder } from "./DndProvider";

interface DockPlaceholderProps {
  className?: string;
}

export function DockPlaceholder({ className }: DockPlaceholderProps) {
  const { activeTerminal } = useDndPlaceholder();

  if (!activeTerminal) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-1 min-w-[120px]",
        "rounded border-2 border-dashed border-canopy-accent/50 bg-canopy-accent/5",
        "text-canopy-accent/70 text-xs font-medium",
        "animate-in fade-in duration-150",
        className
      )}
      aria-hidden="true"
    >
      <ArrowDown className="w-3 h-3" />
      <span>Drop here</span>
    </div>
  );
}
