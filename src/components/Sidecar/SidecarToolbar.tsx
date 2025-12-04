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
} from "lucide-react";
import type { SidecarTab } from "@shared/types";
import { cn } from "@/lib/utils";

type InjectStatus = "idle" | "loading" | "success" | "error";

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
        onClick={handleInject}
        disabled={!activeTabId || injectStatus === "loading"}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ml-2",
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
        className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors ml-2"
        title="Close sidecar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
