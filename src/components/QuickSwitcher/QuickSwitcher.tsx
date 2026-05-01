import { useCallback, useId } from "react";
import { SearchablePalette } from "@/components/ui/SearchablePalette";
import { PaletteFooterHints } from "@/components/ui/AppPaletteDialog";
import { QuickSwitcherItem } from "./QuickSwitcherItem";
import { useKeybindingDisplay } from "@/hooks/useKeybinding";
import type {
  QuickSwitcherItem as QuickSwitcherItemData,
  UseQuickSwitcherReturn,
} from "@/hooks/useQuickSwitcher";

function getQuickSwitcherActionLabel(item: QuickSwitcherItemData): string | undefined {
  switch (item.type) {
    case "terminal":
      return "Switch terminal";
    case "worktree":
      return "Switch worktree";
    default:
      return undefined;
  }
}

type QuickSwitcherProps = Pick<
  UseQuickSwitcherReturn,
  | "isOpen"
  | "query"
  | "results"
  | "totalResults"
  | "selectedIndex"
  | "isLoading"
  | "close"
  | "setQuery"
  | "setSelectedIndex"
  | "selectPrevious"
  | "selectNext"
  | "selectItem"
  | "confirmSelection"
>;

export function QuickSwitcher({
  isOpen,
  query,
  results,
  totalResults,
  selectedIndex,
  isLoading,
  close,
  setQuery,
  setSelectedIndex,
  selectPrevious,
  selectNext,
  selectItem,
  confirmSelection,
}: QuickSwitcherProps) {
  const handleSelect = useCallback(
    (item: QuickSwitcherItemData) => {
      selectItem(item);
    },
    [selectItem]
  );

  const footerHintId = useId();

  const getFooter = useCallback(
    (item: QuickSwitcherItemData | null): React.ReactNode => {
      const label = item ? getQuickSwitcherActionLabel(item) : undefined;
      if (!label) return undefined;
      return (
        <div id={footerHintId} className="w-full">
          <PaletteFooterHints
            primaryHint={{ keys: ["↵"], label }}
            hints={[
              { keys: ["↑", "↓"], label: "to navigate" },
              { keys: ["↵"], label },
              { keys: ["Esc"], label: "to close" },
            ]}
          />
        </div>
      );
    },
    [footerHintId]
  );

  const newTerminalShortcut = useKeybindingDisplay("terminal.new");

  return (
    <SearchablePalette<QuickSwitcherItemData>
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
      getItemId={(item) => item.id}
      renderItem={(item, index, isSelected, onHoverIndex) => (
        <QuickSwitcherItem
          key={item.id}
          item={item}
          isSelected={isSelected}
          onSelect={handleSelect}
          onHover={() => onHoverIndex(index)}
          ariaDescribedBy={footerHintId}
        />
      )}
      getFooter={getFooter}
      label="Quick switch"
      keyHint="⌘P"
      ariaLabel="Quick switcher"
      isLoading={isLoading}
      searchPlaceholder="Search terminals, agents, worktrees..."
      searchAriaLabel="Search terminals, agents, and worktrees"
      listId="quick-switcher-list"
      itemIdPrefix="qs-option"
      emptyMessage="No panels open"
      noMatchMessage={`No items match "${query}"`}
      totalResults={totalResults}
      emptyContent={
        <p className="mt-2 text-xs text-daintree-text/40">
          {newTerminalShortcut ? (
            <>
              Press{" "}
              <kbd className="px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-daintree-border text-daintree-text/60">
                {newTerminalShortcut}
              </kbd>{" "}
              to create a terminal.
            </>
          ) : (
            "Create a terminal to get started."
          )}
        </p>
      }
    />
  );
}
