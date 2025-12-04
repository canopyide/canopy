import { memo } from "react";
import { ArrowLeft, ArrowRight, RotateCw, X, Plus } from "lucide-react";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SidecarTab } from "@shared/types";
import { cn } from "@/lib/utils";
import { useSidecarStore } from "@/store/sidecarStore";

const SortableTab = memo(function SortableTab({
  tab,
  isActive,
  onClick,
  onClose,
}: {
  tab: SidecarTab;
  isActive: boolean;
  onClick: (id: string) => void;
  onClose: (id: string, e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
    transition: {
      duration: 150,
      easing: "cubic-bezier(0.25, 1, 0.5, 1)",
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={isActive}
      aria-label={tab.title}
      tabIndex={isActive ? 0 : -1}
      onClick={() => onClick(tab.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(tab.id);
        }
      }}
      className={cn(
        "group relative flex items-center gap-2 px-3 py-1.5 text-xs font-medium cursor-pointer select-none transition-all",
        "rounded-full border shadow-sm",
        "min-w-[80px] max-w-[200px]",
        isActive
          ? "bg-zinc-100 text-zinc-900 border-zinc-200 ring-1 ring-zinc-200/50"
          : "bg-zinc-800/50 text-zinc-400 border-zinc-700/50 hover:bg-zinc-800 hover:text-zinc-200 hover:border-zinc-600",
        isDragging && "opacity-80 scale-105 shadow-xl cursor-grabbing"
      )}
    >
      <span className="truncate max-w-[120px]">{tab.title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.id, e);
        }}
        aria-label={`Close ${tab.title}`}
        className={cn(
          "p-0.5 rounded-full transition-colors ml-1",
          isActive
            ? "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-300"
            : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        )}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
});

interface SidecarToolbarProps {
  tabs: SidecarTab[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string, e: React.MouseEvent) => void;
  onNewTab: () => void;
  onClose: () => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onReload?: () => void;
}

export function SidecarToolbar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onNewTab,
  onClose,
  onGoBack,
  onGoForward,
  onReload,
}: SidecarToolbarProps) {
  const reorderTabs = useSidecarStore((s) => s.reorderTabs);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = tabs.findIndex((t) => t.id === active.id);
      const newIndex = tabs.findIndex((t) => t.id === over.id);
      reorderTabs(oldIndex, newIndex);
    }
  };

  return (
    <div className="flex flex-col bg-zinc-900 border-b border-zinc-800">
      {/* Top Row: Navigation Controls */}
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="flex items-center gap-0.5">
          <button
            onClick={onGoBack}
            disabled={!activeTabId}
            aria-label="Go back"
            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Go back"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onGoForward}
            disabled={!activeTabId}
            aria-label="Go forward"
            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Go forward"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onReload}
            disabled={!activeTabId}
            aria-label="Reload"
            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Reload"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors ml-1"
            title="Close sidecar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Row: Tab Pills */}
      <div className="px-2 pb-2">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
            <div
              className="flex flex-wrap gap-2 items-center"
              role="tablist"
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
                  if (currentIndex === -1) return;
                  const nextIndex =
                    e.key === "ArrowLeft"
                      ? currentIndex > 0
                        ? currentIndex - 1
                        : tabs.length - 1
                      : currentIndex < tabs.length - 1
                        ? currentIndex + 1
                        : 0;
                  onTabClick(tabs[nextIndex].id);
                }
              }}
            >
              {tabs.map((tab) => (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  isActive={activeTabId === tab.id}
                  onClick={onTabClick}
                  onClose={onTabClose}
                />
              ))}

              <button
                onClick={onNewTab}
                className="flex items-center justify-center w-8 h-[26px] rounded-full bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50 hover:border-zinc-600 transition-all"
                title="New Tab"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
