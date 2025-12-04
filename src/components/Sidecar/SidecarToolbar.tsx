import { ArrowLeft, ArrowRight, RotateCw, X } from "lucide-react";
import type { SidecarTab } from "@shared/types";
import { cn } from "@/lib/utils";

interface SidecarToolbarProps {
  tabs: SidecarTab[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onClose: () => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onReload?: () => void;
}

export function SidecarToolbar({
  tabs,
  activeTabId,
  onTabClick,
  onClose,
  onGoBack,
  onGoForward,
  onReload,
}: SidecarToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-zinc-900 border-b border-zinc-800">
      <div className="flex items-center gap-0.5 mr-2">
        <button
          onClick={onGoBack}
          className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Go back"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onGoForward}
          className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Go forward"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onReload}
          className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Reload"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1 flex-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabClick(tab.id)}
            className={cn(
              "px-3 py-1 text-xs rounded transition-colors truncate max-w-[120px]",
              activeTabId === tab.id
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            )}
            title={tab.title}
          >
            {tab.title}
          </button>
        ))}
      </div>

      <button
        onClick={onClose}
        className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors ml-2"
        title="Close sidecar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
