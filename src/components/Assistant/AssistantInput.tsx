import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChevronRight, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppAgentStore } from "@/store/appAgentStore";

export interface AssistantInputHandle {
  focus: () => void;
  clear: () => void;
}

interface AssistantInputProps {
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

function formatModelName(modelId: string | undefined): string {
  if (!modelId) return "Assistant";

  // Remove common prefixes like "accounts/fireworks/models/"
  let name = modelId.replace(/^accounts\/[^/]+\/models\//, "").replace(/^models\//, "");

  // Replace version patterns: 2p5 -> 2.5, 3p1 -> 3.1, etc.
  name = name.replace(/(\d)p(\d)/g, "$1.$2");

  // Split on hyphens and underscores
  const parts = name.split(/[-_]/);

  // Process each part
  const formattedParts = parts.map((part) => {
    // Keep version numbers as-is (e.g., "3.1", "405b")
    if (/^\d/.test(part)) return part;

    // Capitalize first letter of each word
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  });

  // Join with spaces and clean up
  return formattedParts.join(" ").replace(/\s+/g, " ").trim();
}

export const AssistantInput = forwardRef<AssistantInputHandle, AssistantInputProps>(
  (
    {
      onSubmit,
      onCancel,
      isStreaming = false,
      disabled = false,
      placeholder = "Execute a command or ask a question...",
      className,
    },
    ref
  ) => {
    const [value, setValue] = useState("");
    const [isComposing, setIsComposing] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const config = useAppAgentStore((s) => s.config);

    const adjustHeight = useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 200;
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }, []);

    useEffect(() => {
      adjustHeight();
    }, [value, adjustHeight]);

    const handleSubmit = useCallback(() => {
      const trimmed = value.trim();
      if (!trimmed || disabled) return;

      onSubmit(trimmed);
      setValue("");
    }, [value, disabled, onSubmit]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && !isComposing && !e.nativeEvent.isComposing) {
          e.preventDefault();
          handleSubmit();
        }
      },
      [handleSubmit, isComposing]
    );

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
    }, []);

    const handleCompositionStart = useCallback(() => {
      setIsComposing(true);
    }, []);

    const handleCompositionEnd = useCallback(() => {
      setIsComposing(false);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => textareaRef.current?.focus(),
        clear: () => setValue(""),
      }),
      []
    );

    const handleContainerClick = useCallback(() => {
      textareaRef.current?.focus();
    }, []);

    const modelDisplayName = formatModelName(config?.model);

    return (
      <div
        className={cn(
          "p-4 border-t border-white/10 bg-[color-mix(in_oklab,var(--color-canopy-sidebar)_80%,var(--color-canopy-bg))]",
          className
        )}
        onClick={handleContainerClick}
      >
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-3 rounded-md border transition-all duration-200 cursor-text",
            "border-white/10 bg-canopy-bg",
            "hover:border-white/20 hover:bg-white/[0.05]",
            "focus-within:border-white/20 focus-within:bg-white/[0.05]",
            disabled && !isStreaming && "opacity-60"
          )}
          aria-disabled={disabled && !isStreaming}
        >
          <ChevronRight
            size={16}
            className={cn("text-canopy-text/40 shrink-0", isStreaming && "animate-pulse")}
          />

          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              "flex-1 max-h-[200px] min-h-[20px] resize-none bg-transparent font-mono text-sm leading-[1.6] text-canopy-text",
              "placeholder:text-canopy-text/30 focus:outline-none focus:ring-0 p-0 scrollbar-none"
            )}
            aria-label="Command input"
            aria-keyshortcuts="Enter Shift+Enter"
          />

          {isStreaming && onCancel ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              className={cn(
                "shrink-0 p-1 rounded transition-colors",
                "text-red-400 hover:bg-red-500/10"
              )}
              aria-label="Cancel response"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-canopy-text/30 font-mono border border-canopy-border rounded px-1.5 py-0.5">
                return
              </span>
            </div>
          )}
        </div>

        {/* Footer Status */}
        <div className="flex justify-between mt-3 px-1 items-center">
          <div className="flex gap-4 text-[10px] uppercase tracking-widest font-semibold">
            <span
              className={cn(
                "flex items-center gap-1.5",
                isStreaming ? "text-blue-400/80" : "text-canopy-accent/80"
              )}
            >
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isStreaming
                    ? "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]"
                    : "bg-canopy-accent shadow-[0_0_8px_rgba(var(--color-canopy-accent-rgb,16,185,129),0.6)]"
                )}
              />
              {isStreaming ? "Working" : "Ready"}
            </span>
            <span className="text-canopy-text/30">{modelDisplayName}</span>
          </div>
        </div>
      </div>
    );
  }
);

AssistantInput.displayName = "AssistantInput";
