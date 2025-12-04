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
import type { SidecarTab } from "@shared/types";
import { cn } from "@/lib/utils";

type InjectStatus = "idle" | "loading" | "success" | "error";

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

      {/* Bottom Row: Tab Strip */}
      <div className="flex items-center px-2 pb-1.5 gap-1 overflow-x-auto no-scrollbar" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabClick(tab.id)}
            role="tab"
            aria-selected={activeTabId === tab.id}
            aria-label={tab.title}
            className={cn(
              "group flex items-center gap-2 px-3 py-1.5 rounded-t-md min-w-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2",
              activeTabId === tab.id
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
            )}
          >
            <span className="truncate text-xs max-w-[100px]">{tab.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id, e);
              }}
              aria-label={`Close ${tab.title}`}
              className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 p-0.5 rounded hover:bg-zinc-600 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 transition-opacity"
              title="Close tab"
            >
              <X className="w-3 h-3" />
            </button>
          </button>
        ))}

        <button
          onClick={onNewTab}
          aria-label="New tab"
          className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          title="New tab"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
