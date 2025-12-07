import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useOverlayState } from "@/hooks";
import type { LaunchOption } from "./launchOptions";

interface NewTerminalPaletteProps {
  isOpen: boolean;
  query: string;
  results: LaunchOption[];
  selectedIndex: number;
  onQueryChange: (q: string) => void;
  onSelectPrevious: () => void;
  onSelectNext: () => void;
  onSelect: (option: LaunchOption) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function NewTerminalPalette({
  isOpen,
  query,
  results,
  selectedIndex,
  onQueryChange,
  onSelectPrevious,
  onSelectNext,
  onSelect,
  onConfirm,
  onClose,
}: NewTerminalPaletteProps) {
  useOverlayState(isOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const selectedItem = listRef.current.children[selectedIndex] as HTMLElement;
      selectedItem?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          onSelectPrevious();
          break;
        case "ArrowDown":
          e.preventDefault();
          onSelectNext();
          break;
        case "Enter":
          e.preventDefault();
          onConfirm();
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "Tab":
          e.preventDefault();
          if (e.shiftKey) {
            onSelectPrevious();
          } else {
            onSelectNext();
          }
          break;
      }
    },
    [onSelectPrevious, onSelectNext, onConfirm, onClose]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="New terminal palette"
    >
      <div
        className={cn(
          "w-full max-w-xl mx-4 bg-canopy-bg border border-canopy-border rounded-[var(--radius-xl)] shadow-2xl overflow-hidden",
          "animate-in fade-in slide-in-from-top-4 duration-150"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 pt-2 pb-1 border-b border-canopy-border">
          <div className="flex justify-between items-center mb-1.5 text-[11px] text-canopy-text/40">
            <span>New Terminal</span>
            <span className="font-mono">⌘N</span>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Select terminal type..."
            className={cn(
              "w-full px-3 py-2 text-sm",
              "bg-canopy-sidebar border border-canopy-border rounded-[var(--radius-md)]",
              "text-canopy-text placeholder:text-canopy-text/40",
              "focus:outline-none focus:border-canopy-accent focus:ring-1 focus:ring-canopy-accent"
            )}
            role="combobox"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-label="Select terminal type"
            aria-controls="new-terminal-list"
            aria-activedescendant={
              results.length > 0 && selectedIndex >= 0 && selectedIndex < results.length
                ? `new-terminal-option-${results[selectedIndex].id}`
                : undefined
            }
          />
        </div>

        <div
          ref={listRef}
          id="new-terminal-list"
          role="listbox"
          aria-label="Terminal types"
          className="max-h-[50vh] overflow-y-auto p-2 space-y-1"
        >
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-canopy-text/50 text-sm">
              No terminal types match "{query}"
            </div>
          ) : (
            results.map((option, index) => (
              <button
                key={option.id}
                id={`new-terminal-option-${option.id}`}
                role="option"
                aria-selected={index === selectedIndex}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-left transition-colors duration-100",
                  index === selectedIndex
                    ? "bg-canopy-accent/20 border border-canopy-accent"
                    : "hover:bg-canopy-sidebar border border-transparent"
                )}
                onClick={() => onSelect(option)}
              >
                <span className="shrink-0 text-canopy-text/70">{option.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-canopy-text">{option.label}</div>
                  <div className="text-xs text-canopy-text/50 truncate">{option.description}</div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="px-3 py-2 border-t border-canopy-border bg-canopy-sidebar/50 text-xs text-canopy-text/40 flex items-center gap-4">
          <span>
            <kbd className="px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-canopy-border text-canopy-text/60">
              ↑
            </kbd>
            <kbd className="px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-canopy-border text-canopy-text/60 ml-1">
              ↓
            </kbd>
            <span className="ml-1.5">to navigate</span>
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-canopy-border text-canopy-text/60">
              Enter
            </kbd>
            <span className="ml-1.5">to launch</span>
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-canopy-border text-canopy-text/60">
              Esc
            </kbd>
            <span className="ml-1.5">to close</span>
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default NewTerminalPalette;
