import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { m } from "framer-motion";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";

export interface WorktreeSortDragData {
  type: "worktree-sort";
  worktreeId: string;
  dragStartOrder: string[];
}

const WORKTREE_SORT_PREFIX = "worktree-sort-";

export function getWorktreeSortDragId(worktreeId: string): string {
  return `${WORKTREE_SORT_PREFIX}${worktreeId}`;
}

export function parseWorktreeSortDragId(dragId: string | number): string | null {
  if (typeof dragId !== "string") return null;
  if (dragId.startsWith(WORKTREE_SORT_PREFIX)) {
    return dragId.slice(WORKTREE_SORT_PREFIX.length);
  }
  return null;
}

export function isWorktreeSortDragData(
  data: Record<string, unknown> | undefined
): data is Record<string, unknown> & WorktreeSortDragData {
  return data?.type === "worktree-sort";
}

interface SortableWorktreeCardProps {
  worktreeId: string;
  dragStartOrder: string[];
  disabled?: boolean;
  children: (props: {
    isDraggingSort: boolean;
    dragHandleListeners: SyntheticListenerMap | undefined;
    dragHandleActivatorRef: (node: HTMLElement | null) => void;
  }) => React.ReactNode;
}

function sortableWorktreeCardPropsAreEqual(
  prev: SortableWorktreeCardProps,
  next: SortableWorktreeCardProps
): boolean {
  if (
    prev.worktreeId !== next.worktreeId ||
    prev.disabled !== next.disabled ||
    prev.children !== next.children
  ) {
    return false;
  }
  if (prev.dragStartOrder === next.dragStartOrder) return true;
  if (prev.dragStartOrder.length !== next.dragStartOrder.length) return false;
  for (let i = 0; i < prev.dragStartOrder.length; i++) {
    if (prev.dragStartOrder[i] !== next.dragStartOrder[i]) return false;
  }
  return true;
}

export const SortableWorktreeCard = React.memo(function SortableWorktreeCard({
  worktreeId,
  dragStartOrder,
  disabled,
  children,
}: SortableWorktreeCardProps) {
  const dragData: WorktreeSortDragData = {
    type: "worktree-sort",
    worktreeId,
    dragStartOrder,
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: getWorktreeSortDragId(worktreeId),
    data: dragData,
    disabled,
    animateLayoutChanges: () => false,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    isolation: isDragging ? "auto" : "isolate",
    ...(!isDragging && {
      contentVisibility: "auto",
      containIntrinsicSize: "auto 180px",
    }),
  };

  const {
    role: _role,
    "aria-roledescription": _ariaRoleDesc,
    tabIndex: _tabIndex,
    ...filteredAttributes
  } = attributes;

  return (
    <m.div layout="position" {...filteredAttributes}>
      <div
        ref={setNodeRef}
        style={style}
        role="row"
        aria-roledescription="sortable worktree"
        data-worktree-row={worktreeId}
        tabIndex={-1}
      >
        <div role="gridcell">
          <m.div
            animate={{ opacity: isDragging ? 0.4 : 1 }}
            transition={{ duration: isDragging ? 0.15 : 0, ease: "easeOut" }}
          >
            {children({
              isDraggingSort: isDragging,
              dragHandleListeners: listeners,
              dragHandleActivatorRef: setActivatorNodeRef,
            })}
          </m.div>
        </div>
      </div>
    </m.div>
  );
}, sortableWorktreeCardPropsAreEqual);
