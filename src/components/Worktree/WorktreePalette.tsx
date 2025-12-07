import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useOverlayState } from "@/hooks";
import type { WorktreeState } from "@/types";

interface WorktreeListItemProps {
  worktree: WorktreeState;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
}

function WorktreeListItem({ worktree, isActive, isSelected, onClick }: WorktreeListItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2 rounded-lg border flex flex-col gap-0.5",
        "border-canopy-border/40 hover:border-canopy-border/60",
        "bg-canopy-bg hover:bg-surface transition-colors",
        isSelected && "border-canopy-accent/60 bg-canopy-accent/10"
      )}
      aria-selected={isSelected}
      role="option"
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-canopy-text">{worktree.name}</span>
        <div className="flex items-center gap-2 text-xs text-canopy-text/60">
          {worktree.branch && <span className="font-mono text-canopy-text/70">{worktree.branch}</span>}
          {isActive && (
            <span className="px-1.5 py-0.5 rounded-md bg-canopy-accent/15 text-canopy-accent text-[10px] font-semibold">
              Active
            </span>
          )}
        </div>
      </div>
      <div className="text-[11px] text-canopy-text/50 truncate">{worktree.path}</div>
    </button>
  );
}

export interface WorktreePaletteProps {
  isOpen: boolean;
  query: string;
  results: WorktreeState[];
  activeWorktreeId: string | null;
  selectedIndex: number;
  onQueryChange: (query: string) => void;
  onSelectPrevious: () => void;
  onSelectNext: () => void;
  onSelect: (worktree: WorktreeState) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function WorktreePalette({
  isOpen,
  query,
  results,
  activeWorktreeId,
  selectedIndex,
  onQueryChange,
  onSelectPrevious,
  onSelectNext,
  onSelect,
  onConfirm,
  onClose,
}: WorktreePaletteProps) {
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
      aria-label="Worktree palette"
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
            <span>Worktree switcher</span>
            <span className="font-mono">⌘K, W</span>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search worktrees..."
            className={cn(
              "w-full px-3 py-2 text-sm",
              "bg-canopy-sidebar border border-canopy-border rounded-[var(--radius-md)]",
              "text-canopy-text placeholder:text-canopy-text/40",
              "focus:outline-none focus:border-canopy-accent focus:ring-1 focus:ring-canopy-accent"
            )}
            role="combobox"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-label="Search worktrees"
            aria-controls="worktree-palette-list"
            aria-activedescendant={
              results.length > 0 && selectedIndex >= 0
                ? `worktree-option-${results[selectedIndex].id}`
                : undefined
            }
          />
        </div>

        <div
          ref={listRef}
          id="worktree-palette-list"
          role="listbox"
          aria-label="Worktrees"
          className="max-h-[50vh] overflow-y-auto p-2 space-y-1"
        >
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-canopy-text/50 text-sm">
              {query.trim() ? (
                <>No worktrees match "{query}"</>
              ) : (
                <>No worktrees available</>
              )}
            </div>
          ) : (
            results.map((worktree, index) => (
              <WorktreeListItem
                key={worktree.id}
                worktree={worktree}
                isActive={worktree.id === activeWorktreeId}
                isSelected={index === selectedIndex}
                onClick={() => onSelect(worktree)}
              />
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
            <span className="ml-1.5">to select</span>
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

export default WorktreePalette;
