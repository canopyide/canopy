import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { m } from "framer-motion";
import { cn } from "@/lib/utils";
import type { TerminalInstance } from "@/store";
import type { DragData } from "./DndProvider";
import { DragHandleProvider } from "./DragHandleContext";

interface SortableDockItemProps {
  terminal: TerminalInstance;
  sourceIndex: number;
  children: React.ReactNode;
  /** If this panel is part of a tab group, the group ID */
  groupId?: string;
  /** If this panel is part of a tab group, all panel IDs in the group */
  groupPanelIds?: string[];
}

export function SortableDockItem({
  terminal,
  sourceIndex,
  children,
  groupId,
  groupPanelIds,
}: SortableDockItemProps) {
  const dragData: DragData = {
    terminal,
    sourceLocation: "dock",
    sourceIndex,
    groupId,
    groupPanelIds,
  };

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: terminal.id,
    data: dragData,
    animateLayoutChanges: () => false,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const destructured = attributes as unknown as Record<string, unknown>;
  const { role: _role, tabIndex: _tabIndex, ...remainingAttributes } = destructured;
  void _role;
  void _tabIndex;

  return (
    <m.div
      layout="position"
      className="flex-shrink-0"
      {...remainingAttributes}
      aria-roledescription="sortable item"
    >
      <div ref={setNodeRef} style={style} className={cn("flex-shrink-0")}>
        <m.div
          animate={{ opacity: isDragging ? 0.4 : 1 }}
          transition={{ duration: isDragging ? 0.15 : 0, ease: "easeOut" }}
        >
          <DragHandleProvider value={{ listeners }}>{children}</DragHandleProvider>
        </m.div>
      </div>
    </m.div>
  );
}
