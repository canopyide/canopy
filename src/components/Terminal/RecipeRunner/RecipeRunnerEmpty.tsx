import { BookOpen, Plus } from "lucide-react";

interface RecipeRunnerEmptyProps {
  onCreate: () => void;
}

export function RecipeRunnerEmpty({ onCreate }: RecipeRunnerEmptyProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <BookOpen className="h-10 w-10 text-text-muted/50" aria-hidden />
      <div className="text-center">
        <p className="text-sm font-medium text-canopy-text">No recipes yet</p>
        <p className="text-xs text-text-muted mt-1">
          Recipes let you launch multi-terminal workflows with a single click
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-canopy-accent hover:text-canopy-accent/80 bg-canopy-accent/10 hover:bg-canopy-accent/15 rounded-[var(--radius-md)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy-accent"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Create your first recipe
      </button>
    </div>
  );
}
