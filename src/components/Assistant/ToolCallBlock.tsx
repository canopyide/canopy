import { useState, useCallback } from "react";
import { Loader2, CheckCircle, XCircle, ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCall } from "./types";

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

interface ToolCallBlockProps {
  toolCall: ToolCall;
  className?: string;
}

export function ToolCallBlock({ toolCall, className }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleExpanded();
      }
    },
    [toggleExpanded]
  );

  const getStatusConfig = () => {
    switch (toolCall.status) {
      case "pending":
        return {
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          badge: "Running",
          badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
        };
      case "success":
        return {
          icon: <CheckCircle className="w-3 h-3" />,
          badge: "Complete",
          badgeClass: "bg-green-500/15 text-green-400 border-green-500/30",
        };
      case "error":
        return {
          icon: <XCircle className="w-3 h-3" />,
          badge: "Failed",
          badgeClass: "bg-red-500/15 text-red-400 border-red-500/30",
        };
      default:
        return {
          icon: <Wrench className="w-3 h-3" />,
          badge: "Unknown",
          badgeClass: "bg-canopy-text/10 text-canopy-text/50 border-canopy-border",
        };
    }
  };

  const status = getStatusConfig();

  return (
    <div className={cn("mt-3 border border-canopy-border rounded-lg overflow-hidden", className)}>
      <button
        type="button"
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2.5",
          "bg-canopy-sidebar/40 text-sm",
          "hover:bg-canopy-sidebar/60 transition-colors",
          "focus:outline-none focus:ring-1 focus:ring-canopy-accent/50"
        )}
        aria-expanded={expanded}
      >
        <Wrench className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <span className="text-canopy-text/90 font-mono text-xs flex-1 text-left">
          {toolCall.name}
        </span>
        <span
          className={cn(
            "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border",
            status.badgeClass
          )}
        >
          {status.icon}
          {status.badge}
        </span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-canopy-text/40 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-canopy-text/40 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 py-3 text-xs font-mono text-canopy-text/70 bg-canopy-bg/30 border-t border-canopy-border">
          <div className="mb-1.5 text-canopy-text/50 text-[10px] uppercase tracking-wider font-semibold">
            Arguments
          </div>
          <pre className="whitespace-pre-wrap break-all overflow-x-auto bg-canopy-sidebar/30 rounded p-2 text-[11px] leading-relaxed">
            {safeStringify(toolCall.args)}
          </pre>

          {toolCall.result !== undefined && (
            <>
              <div className="mt-3 mb-1.5 text-canopy-text/50 text-[10px] uppercase tracking-wider font-semibold">
                Result
              </div>
              <pre className="whitespace-pre-wrap break-all overflow-x-auto bg-canopy-sidebar/30 rounded p-2 text-[11px] leading-relaxed">
                {typeof toolCall.result === "string"
                  ? toolCall.result
                  : safeStringify(toolCall.result)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
