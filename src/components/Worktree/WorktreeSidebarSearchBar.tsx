import { useCallback, useEffect, useState, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorktreeFilterStore } from "@/store/worktreeFilterStore";
import { WorktreeFilterPopover } from "./WorktreeFilterPopover";
import type { ChipCounts } from "@/lib/worktreeFilters";

interface WorktreeSidebarSearchBarProps {
  inputRef?: React.Ref<HTMLInputElement>;
  chipCounts?: ChipCounts;
}

function assignForwardedRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref && typeof ref === "object") {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

export function WorktreeSidebarSearchBar({ inputRef, chipCounts }: WorktreeSidebarSearchBarProps) {
  const query = useWorktreeFilterStore((state) => state.query);
  const setQuery = useWorktreeFilterStore((state) => state.setQuery);
  const clearAll = useWorktreeFilterStore((state) => state.clearAll);
  const quickStateFilter = useWorktreeFilterStore((state) => state.quickStateFilter);
  const hasFacetFilters = useWorktreeFilterStore((state) => state.hasFacetFilters());

  const [localQuery, setLocalQuery] = useState("");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const internalRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setLocalQuery(query);
  }, [query]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleQueryChange = useCallback(
    (value: string) => {
      setLocalQuery(value);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        setQuery(value);
      }, 200);
    },
    [setQuery]
  );

  const handleClearSearch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setLocalQuery("");
    setQuery("");
  }, [setQuery]);

  const handleClearAll = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setLocalQuery("");
    clearAll();
  }, [clearAll]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // ARIA APG combobox sequence: close popup → clear text → blur.
      if (isPopoverOpen) {
        e.stopPropagation();
        setIsPopoverOpen(false);
        return;
      }
      if (localQuery) {
        e.stopPropagation();
        handleClearSearch();
        return;
      }
      internalRef.current?.blur();
    },
    [isPopoverOpen, localQuery, handleClearSearch]
  );

  const setRefs = useCallback(
    (el: HTMLInputElement | null) => {
      internalRef.current = el;
      assignForwardedRef(inputRef, el);
    },
    [inputRef]
  );

  const showClear = !!localQuery;
  const activeAxisCount =
    (localQuery ? 1 : 0) + (quickStateFilter !== "all" ? 1 : 0) + (hasFacetFilters ? 1 : 0);
  const showClearAll = activeAxisCount >= 2;

  return (
    <div className="px-3 py-2 border-b border-divider shrink-0">
      <div
        role="search"
        className={cn(
          "flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-md)]",
          "bg-daintree-bg border border-daintree-border",
          "focus-within:border-daintree-accent focus-within:ring-1 focus-within:ring-daintree-accent/20"
        )}
      >
        <Search
          className="w-3.5 h-3.5 shrink-0 text-daintree-text/40 pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={setRefs}
          type="text"
          value={localQuery}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search worktrees..."
          aria-label="Search worktrees"
          className="flex-1 min-w-0 text-xs bg-transparent text-daintree-text placeholder-daintree-text/40 focus:outline-hidden"
        />
        <div className="flex shrink-0 items-center gap-0.5">
          {showClear && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="flex items-center justify-center w-5 h-5 rounded text-daintree-text/40 hover:text-daintree-text"
              aria-label="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <WorktreeFilterPopover
            hideSearchInput
            chipCounts={chipCounts}
            open={isPopoverOpen}
            onOpenChange={setIsPopoverOpen}
          />
        </div>
      </div>
      {showClearAll && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleClearAll}
            className="text-[11px] text-daintree-text/50 hover:text-daintree-text transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
