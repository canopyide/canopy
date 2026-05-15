import type { Announcements, UniqueIdentifier } from "@dnd-kit/core";

export type SortableLabelResolver = (id: UniqueIdentifier) => string | null | undefined;

/**
 * Build a stable `Announcements` object for a sortable list whose items are
 * looked up by `id`. Designed for nested `DndContext` instances inside a
 * surface that doesn't share the global DndProvider's data model.
 *
 * The returned object is pure — wrap the call in `useMemo` so dnd-kit's
 * accessibility live region isn't torn down on every render.
 */
export function makeSortableAnnouncements(
  getLabel: SortableLabelResolver,
  itemNoun: string
): Announcements {
  const resolve = (id: UniqueIdentifier): string => {
    const label = getLabel(id);
    return label != null && label !== "" ? label : `${itemNoun} ${String(id)}`;
  };

  return {
    onDragStart({ active }) {
      return `Picked up ${resolve(active.id)}`;
    },
    onDragOver({ active, over }) {
      const label = resolve(active.id);
      if (over) {
        return `${label} is over ${resolve(over.id)}`;
      }
      return `${label} is no longer over a droppable area`;
    },
    onDragEnd({ active, over }) {
      const label = resolve(active.id);
      if (over) {
        return `Dropped ${label}`;
      }
      return `${label} returned to its original position`;
    },
    onDragCancel({ active }) {
      const label = resolve(active.id);
      return `Drag cancelled. ${label} returned to its original position`;
    },
  };
}
