import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { m } from "framer-motion";
import { cn } from "@/lib/utils";
import type { TerminalInstance } from "@/store";
import type { WorktreeDragData } from "./DndProvider";
import { pixelSnapTransform } from "./SortableTerminal";

interface SortableWorktreeTerminalProps {
  terminal: TerminalInstance;
  worktreeId: string;
  sourceIndex: number;
  children:
    | React.ReactNode
    | ((props: { listeners: ReturnType<typeof useSortable>["listeners"] }) => React.ReactNode);
}

export function getAccordionDragId(terminalId: string): string {
  return `accordion-${terminalId}`;
}

export function parseAccordionDragId(dragId: string | number): string | null {
  if (typeof dragId !== "string") return null;
  if (dragId.startsWith("accordion-")) {
    return dragId.slice("accordion-".length);
  }
  return null;
}

export function SortableWorktreeTerminal({
  terminal,
  worktreeId,
  sourceIndex,
  children,
}: SortableWorktreeTerminalProps) {
  const dragData: WorktreeDragData = {
    terminal,
    sourceLocation: terminal.location === "dock" ? "dock" : "grid",
    sourceIndex,
    worktreeId,
    origin: "accordion",
  };

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: getAccordionDragId(terminal.id),
    data: dragData,
    animateLayoutChanges: () => false,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const { role: _role, "aria-roledescription": _ariaRoleDesc, ...filteredAttributes } = attributes;

  return (
    <m.div layout="position" transformTemplate={pixelSnapTransform} className="h-full min-w-0">
      <div
        ref={setNodeRef}
        style={style}
        className={cn("h-full min-w-0")}
        role="listitem"
        aria-roledescription="sortable item"
        {...filteredAttributes}
      >
        <m.div
          animate={{ opacity: isDragging ? 0.4 : 1 }}
          transition={{ duration: isDragging ? 0.15 : 0, ease: "easeOut" }}
        >
          {typeof children === "function" ? (
            children({ listeners })
          ) : (
            <div {...listeners}>{children}</div>
          )}
        </m.div>
      </div>
    </m.div>
  );
}
