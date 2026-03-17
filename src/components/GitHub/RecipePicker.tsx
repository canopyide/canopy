import { useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { SearchablePalette } from "@/components/ui/SearchablePalette";
import { useSearchablePalette } from "@/hooks/useSearchablePalette";
import { useRecipeStore } from "@/store/recipeStore";
import type { TerminalRecipe } from "@/types";

type RecipePickerItem =
  | { _kind: "none"; id: string; name: string }
  | (TerminalRecipe & { _kind: "recipe" });

interface RecipePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (recipeId: string | null) => void;
}

const TYPE_BADGES: Record<string, string> = {
  terminal: "Terminal",
  claude: "Claude",
  gemini: "Gemini",
  codex: "Codex",
  opencode: "OpenCode",
  "dev-preview": "Dev Server",
};

function RecipePickerListItem({
  item,
  isSelected,
  onClick,
}: {
  item: RecipePickerItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  if (item._kind === "none") {
    return (
      <button
        type="button"
        tabIndex={-1}
        onPointerDown={(e) => e.preventDefault()}
        id={`recipe-picker-option-${item.id}`}
        onClick={onClick}
        className={cn(
          "w-full text-left px-3 py-2 rounded-[var(--radius-lg)] border flex items-center gap-2",
          "border-canopy-border/40 hover:border-canopy-border/60",
          "bg-canopy-bg hover:bg-surface transition-colors",
          isSelected && "border-canopy-accent/60 bg-canopy-accent/10"
        )}
        aria-selected={isSelected}
        role="option"
      >
        <span className="text-sm text-canopy-text/70">None — create without recipe</span>
      </button>
    );
  }

  const recipe = item as TerminalRecipe & { _kind: "recipe" };
  const terminalTypes = recipe.terminals.map((t) => TYPE_BADGES[t.type] ?? t.type);
  const uniqueTypes = [...new Set(terminalTypes)];

  return (
    <button
      type="button"
      tabIndex={-1}
      onPointerDown={(e) => e.preventDefault()}
      id={`recipe-picker-option-${recipe.id}`}
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2 rounded-[var(--radius-lg)] border flex flex-col gap-0.5",
        "border-canopy-border/40 hover:border-canopy-border/60",
        "bg-canopy-bg hover:bg-surface transition-colors",
        isSelected && "border-canopy-accent/60 bg-canopy-accent/10"
      )}
      aria-selected={isSelected}
      role="option"
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-canopy-text">{recipe.name}</span>
        <div className="flex items-center gap-1">
          {uniqueTypes.map((type) => (
            <span
              key={type}
              className="px-1.5 py-0.5 rounded-[var(--radius-md)] bg-canopy-accent/10 text-canopy-text/60 text-[11px]"
            >
              {type}
            </span>
          ))}
        </div>
      </div>
      <div className="text-[11px] text-canopy-text/50">
        {recipe.terminals.length} terminal{recipe.terminals.length !== 1 ? "s" : ""}
      </div>
    </button>
  );
}

export function RecipePicker({ isOpen, onClose, onSelect }: RecipePickerProps) {
  const recipes = useRecipeStore((s) => s.recipes);

  const items: RecipePickerItem[] = useMemo(
    () => [
      { _kind: "none" as const, id: "__none__", name: "None — create without recipe" },
      ...recipes.map((r): RecipePickerItem => ({ ...r, _kind: "recipe" })),
    ],
    [recipes]
  );

  const filterItems = useCallback(
    (allItems: RecipePickerItem[], query: string): RecipePickerItem[] => {
      if (!query.trim()) return allItems;
      const search = query.trim().toLowerCase();
      const filtered = allItems.filter((item) => item.name.toLowerCase().includes(search));
      // Always keep "None" at the top if it matches
      const noneItem = allItems[0];
      if (noneItem._kind === "none" && !filtered.includes(noneItem)) {
        return [noneItem, ...filtered];
      }
      return filtered;
    },
    []
  );

  const palette = useSearchablePalette<RecipePickerItem>({
    items,
    filterFn: filterItems,
    maxResults: 20,
  });

  const handleConfirm = useCallback(() => {
    const selected = palette.results[palette.selectedIndex];
    if (selected) {
      onSelect(selected._kind === "none" ? null : selected.id);
    }
  }, [palette.results, palette.selectedIndex, onSelect]);

  const handleItemClick = useCallback(
    (item: RecipePickerItem) => {
      onSelect(item._kind === "none" ? null : item.id);
    },
    [onSelect]
  );

  return (
    <SearchablePalette<RecipePickerItem>
      isOpen={isOpen}
      query={palette.query}
      results={palette.results}
      selectedIndex={palette.selectedIndex}
      onQueryChange={palette.setQuery}
      onSelectPrevious={palette.selectPrevious}
      onSelectNext={palette.selectNext}
      onConfirm={handleConfirm}
      onClose={onClose}
      getItemId={(item) => item.id}
      renderItem={(item, _index, isSelected) => (
        <RecipePickerListItem
          key={item.id}
          item={item}
          isSelected={isSelected}
          onClick={() => handleItemClick(item)}
        />
      )}
      label="Choose a recipe"
      ariaLabel="Recipe picker for bulk worktree creation"
      searchPlaceholder="Search recipes..."
      searchAriaLabel="Search recipes"
      listId="recipe-picker-list"
      itemIdPrefix="recipe-picker-option"
      emptyMessage="No recipes available"
      noMatchMessage={`No recipes match "${palette.query}"`}
      totalResults={palette.totalResults}
      footer={
        <div className="flex items-center gap-3 text-xs text-canopy-text/40">
          <span>
            <kbd className="px-1 py-0.5 rounded bg-canopy-bg border border-canopy-border/40 text-[11px]">
              ↵
            </kbd>{" "}
            Select
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-canopy-bg border border-canopy-border/40 text-[11px]">
              Esc
            </kbd>{" "}
            Cancel
          </span>
        </div>
      }
    />
  );
}
