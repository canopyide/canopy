import { useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { TerminalListItem } from "./TerminalListItem";
import { useOverlayState } from "@/hooks";
import type { SearchableTerminal } from "@/hooks/useTerminalPalette";

export interface TerminalPaletteProps {
  isOpen: boolean;
  query: string;
  results: SearchableTerminal[];
  selectedIndex: number;
  onQueryChange: (query: string) => void;
  onSelectPrevious: () => void;
  onSelectNext: () => void;
  onSelect: (terminal: SearchableTerminal) => void;
  onClose: () => void;
}

export function TerminalPalette({
  isOpen,
  query,
  results,
  selectedIndex,
  onQueryChange,
  onSelectPrevious,
  onSelectNext,
  onSelect,
  onClose,
}: TerminalPaletteProps) {
  useOverlayState(isOpen);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const selectedItem = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: "nearest" });
      }
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
          if (results.length > 0 && selectedIndex >= 0) {
            onSelect(results[selectedIndex]);
          }
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
    [results, selectedIndex, onSelectPrevious, onSelectNext, onSelect, onClose]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Agent palette"
    >
      <div
        className={cn(
          "w-full max-w-xl bg-canopy-bg border border-canopy-border rounded-lg shadow-2xl overflow-hidden",
          "animate-in fade-in slide-in-from-top-4 duration-150"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 pt-2 pb-1 border-b border-canopy-border">
          <div className="flex justify-between items-center mb-1.5 text-[11px] text-canopy-text/40">
            <span>Quick switch</span>
            <span className="font-mono">⌘T</span>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search agents and shells..."
            className={cn(
              "w-full px-3 py-2 text-sm",
              "bg-canopy-sidebar border border-canopy-border rounded-md",
              "text-canopy-text placeholder:text-canopy-text/40",
              "focus:outline-none focus:border-canopy-accent focus:ring-1 focus:ring-canopy-accent"
            )}
            role="combobox"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-label="Search agents and shells"
            aria-controls="terminal-list"
            aria-activedescendant={
              results.length > 0 && selectedIndex >= 0
                ? `terminal-option-${results[selectedIndex].id}`
                : undefined
            }
          />
        </div>

        <div
          ref={listRef}
          id="terminal-list"
          role="listbox"
          aria-label="Agents and shells"
          className="max-h-[50vh] overflow-y-auto p-2 space-y-1"
        >
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-canopy-text/50 text-sm">
              {query.trim() ? (
                <>No agents or shells match "{query}"</>
              ) : (
                <>No agents or shells running</>
              )}
            </div>
          ) : (
            results.map((terminal, index) => (
              <TerminalListItem
                key={terminal.id}
                id={`terminal-option-${terminal.id}`}
                title={terminal.title}
                type={terminal.type}
                worktreeName={terminal.worktreeName}
                cwd={terminal.cwd}
                isSelected={index === selectedIndex}
                onClick={() => onSelect(terminal)}
              />
            ))
          )}
        </div>

        <div className="px-3 py-2 border-t border-canopy-border bg-canopy-sidebar/50 text-xs text-canopy-text/40 flex items-center gap-4">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-canopy-border text-canopy-text/60">↑</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-canopy-border text-canopy-text/60 ml-1">↓</kbd>
            <span className="ml-1.5">to navigate</span>
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-canopy-border text-canopy-text/60">Enter</kbd>
            <span className="ml-1.5">to select</span>
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-canopy-border text-canopy-text/60">Esc</kbd>
            <span className="ml-1.5">to close</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default TerminalPalette;
