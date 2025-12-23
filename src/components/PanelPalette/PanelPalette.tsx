import { useEffect, useRef, useCallback } from "react";
import { AppPaletteDialog } from "@/components/ui/AppPaletteDialog";
import { PanelListItem } from "./PanelListItem";
import type { PanelKindOption } from "@/hooks/usePanelPalette";
import type { PanelKind } from "@/types";

export interface PanelPaletteProps {
  isOpen: boolean;
  query: string;
  results: PanelKindOption[];
  selectedIndex: number;
  onQueryChange: (query: string) => void;
  onSelectPrevious: () => void;
  onSelectNext: () => void;
  onSelect: (kind: PanelKind) => void;
  onClose: () => void;
}

export function PanelPalette({
  isOpen,
  query,
  results,
  selectedIndex,
  onQueryChange,
  onSelectPrevious,
  onSelectNext,
  onSelect,
  onClose,
}: PanelPaletteProps) {
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
            onSelect(results[selectedIndex].kind);
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

  return (
    <AppPaletteDialog isOpen={isOpen} onClose={onClose} ariaLabel="Panel palette">
      <AppPaletteDialog.Header label="New Panel" keyHint="⌘⇧P">
        <AppPaletteDialog.Input
          inputRef={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search panel types..."
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label="Search panel types"
          aria-controls="panel-list"
          aria-activedescendant={
            results.length > 0 && selectedIndex >= 0
              ? `panel-option-${results[selectedIndex].kind}`
              : undefined
          }
        />
      </AppPaletteDialog.Header>

      <AppPaletteDialog.Body>
        <div ref={listRef} id="panel-list" role="listbox" aria-label="Panel types">
          {results.length === 0 ? (
            <AppPaletteDialog.Empty
              query={query}
              emptyMessage="No panel types available"
              noMatchMessage={`No panel types match "${query}"`}
            />
          ) : (
            results.map((panel, index) => (
              <PanelListItem
                key={panel.kind}
                id={`panel-option-${panel.kind}`}
                kind={panel.kind}
                name={panel.name}
                iconId={panel.iconId}
                color={panel.color}
                description={panel.description}
                isSelected={index === selectedIndex}
                onClick={() => onSelect(panel.kind)}
              />
            ))
          )}
        </div>
      </AppPaletteDialog.Body>

      <AppPaletteDialog.Footer />
    </AppPaletteDialog>
  );
}

export default PanelPalette;
