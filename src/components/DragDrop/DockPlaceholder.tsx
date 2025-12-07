import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { useDndPlaceholder } from "./DndProvider";

interface DockPlaceholderProps {
  className?: string;
}

export const DOCK_PLACEHOLDER_ID = "__dock-placeholder__";

export function DockPlaceholder({ className }: DockPlaceholderProps) {
  const { activeTerminal } = useDndPlaceholder();

  if (!activeTerminal) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-1 min-w-[120px] h-full",
        "rounded",
        className
      )}
      aria-hidden="true"
    />
  );
}

export function SortableDockPlaceholder() {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: DOCK_PLACEHOLDER_ID,
    data: { container: "dock", isPlaceholder: true },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="h-full"
      data-placeholder-id={DOCK_PLACEHOLDER_ID}
    >
      <DockPlaceholder />
    </div>
  );
}