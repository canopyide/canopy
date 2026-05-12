import { useCallback } from "react";
import { SearchablePalette } from "@/components/ui/SearchablePalette";
import { useEffectiveCombo } from "@/hooks/useKeybinding";
import { ActionPaletteItem } from "./ActionPaletteItem";
import type {
  ActionPaletteItem as ActionPaletteItemType,
  UseActionPaletteReturn,
} from "@/hooks/useActionPalette";

// Module-level so SearchablePalette receives a stable reference and skips
// re-renders driven only by a freshly-created callback identity.
const getActionItemId = (item: ActionPaletteItemType): string => item.id;

// Verb-noun derived from the highlighted action's title — empty selection
// falls back to a generic "run action" so the chip never goes blank.
const getActionLabel = (item: ActionPaletteItemType | null): string => item?.title ?? "Run action";

type ActionPaletteProps = Pick<
  UseActionPaletteReturn,
  | "isOpen"
  | "query"
  | "results"
  | "totalResults"
  | "selectedIndex"
  | "isStale"
  | "close"
  | "setQuery"
  | "setSelectedIndex"
  | "selectPrevious"
  | "selectNext"
  | "executeAction"
  | "confirmSelection"
>;

export function ActionPalette({
  isOpen,
  query,
  results,
  totalResults,
  selectedIndex,
  isStale,
  close,
  setQuery,
  setSelectedIndex,
  selectPrevious,
  selectNext,
  executeAction,
  confirmSelection,
}: ActionPaletteProps) {
  const handleSelect = useCallback(
    (item: ActionPaletteItemType) => {
      executeAction(item);
    },
    [executeAction]
  );

  const actionPaletteShortcut = useEffectiveCombo("action.palette.open");

  return (
    <SearchablePalette<ActionPaletteItemType>
      isOpen={isOpen}
      query={query}
      results={results}
      selectedIndex={selectedIndex}
      onQueryChange={setQuery}
      onSelectPrevious={selectPrevious}
      onSelectNext={selectNext}
      onConfirm={confirmSelection}
      onClose={close}
      onHoverIndex={setSelectedIndex}
      getItemId={getActionItemId}
      getActionLabel={getActionLabel}
      isFiltering={isStale}
      renderItem={(item, index, isSelected, onHoverIndex) => (
        <ActionPaletteItem
          key={item.id}
          item={item}
          index={index}
          isSelected={isSelected}
          onSelect={handleSelect}
          onHoverIndex={onHoverIndex}
        />
      )}
      label="Actions"
      shortcut={actionPaletteShortcut}
      ariaLabel="Action palette"
      searchPlaceholder="Find an action"
      searchAriaLabel="Search actions"
      listId="action-palette-list"
      itemIdPrefix="action-option"
      emptyMessage="No actions yet"
      totalResults={totalResults}
    />
  );
}
