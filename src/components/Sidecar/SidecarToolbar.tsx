import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  X,
  Clipboard,
  Loader2,
  Check,
  AlertCircle,
  Plus,
} from "lucide-react";
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
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SidecarTab } from "@shared/types";
import { cn } from "@/lib/utils";
import { useSidecarStore } from "@/store/sidecarStore";

type InjectStatus = "idle" | "loading" | "success" | "error";

function SortableTab({
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
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(tab.id)}
      role="tab"
      aria-selected={isActive}
      aria-label={tab.title}
      className={cn(
        "group flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer select-none transition-all border",
        isActive
          ? "bg-canopy-accent text-white border-canopy-accent"
          : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-200",
        isDragging && "opacity-50"
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
          "p-0.5 rounded-full hover:bg-white/20 transition-colors",
          isActive
            ? "text-white/80 hover:text-white"
            : "text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100"
        )}
      >
        <X className="w-3 h-3" />
      </button>
    </button>
  );
}

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
  const [injectStatus, setInjectStatus] = useState<InjectStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
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

  const handleInject = async () => {
    setInjectStatus("loading");
    setErrorMsg("");

    try {
      const text = await navigator.clipboard.readText();

      if (!text.trim()) {
        setInjectStatus("error");
        setErrorMsg("Clipboard is empty");
        setTimeout(() => setInjectStatus("idle"), 3000);
        return;
      }

      const result = await window.electron.sidecar.inject({ text });

      if (result.success) {
        setInjectStatus("success");
        setTimeout(() => setInjectStatus("idle"), 2000);
      } else {
        setInjectStatus("error");
        setErrorMsg(result.error || "Injection failed");
        setTimeout(() => setInjectStatus("idle"), 3000);
      }
    } catch (_error) {
      setInjectStatus("error");
      setErrorMsg("Failed to read clipboard");
      setTimeout(() => setInjectStatus("idle"), 3000);
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
            onClick={handleInject}
            disabled={!activeTabId || injectStatus === "loading"}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors",
              injectStatus === "error"
                ? "bg-red-900/50 text-red-400"
                : injectStatus === "success"
                  ? "bg-green-900/50 text-green-400"
                  : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-50"
            )}
            title={injectStatus === "error" ? errorMsg : "Inject clipboard content"}
          >
            {injectStatus === "loading" && <Loader2 className="w-3 h-3 animate-spin" />}
            {injectStatus === "success" && <Check className="w-3 h-3" />}
            {injectStatus === "error" && <AlertCircle className="w-3 h-3" />}
            {injectStatus === "idle" && <Clipboard className="w-3 h-3" />}
            <span>
              {injectStatus === "loading" && "Injecting..."}
              {injectStatus === "success" && "Injected!"}
              {injectStatus === "error" && "Failed"}
              {injectStatus === "idle" && "Inject"}
            </span>
          </button>

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
          <SortableContext items={tabs.map((t) => t.id)} strategy={rectSortingStrategy}>
            <div className="flex flex-wrap gap-2" role="tablist">
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
                className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 transition-colors"
                title="New Tab"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
