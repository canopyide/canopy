import { useRecipeRunner } from "./useRecipeRunner";
import { RecipeRunnerGrid } from "./RecipeRunnerGrid";
import { RecipeRunnerList } from "./RecipeRunnerList";
import { RecipeRunnerEmpty } from "./RecipeRunnerEmpty";
import { InlineStatusBanner } from "@/components/Terminal/InlineStatusBanner";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface RecipeRunnerProps {
  activeWorktreeId: string | null | undefined;
  defaultCwd: string | undefined;
}

function buildBannerTitle(spawned: number, total: number, failedNames: string[]): string {
  const failedCount = failedNames.length;
  if (spawned === 0) {
    return `Couldn't start any terminals. ${failedCount} failed.`;
  }
  const terminalWord = spawned === 1 ? "terminal" : "terminals";
  return `Started ${spawned} of ${total} ${terminalWord}. ${failedCount} failed: ${failedNames.join(", ")}.`;
}

export function RecipeRunner({ activeWorktreeId, defaultCwd }: RecipeRunnerProps) {
  const runner = useRecipeRunner({ activeWorktreeId, defaultCwd });

  if (runner.recipes.length === 0) {
    return <RecipeRunnerEmpty onCreate={runner.handleCreate} />;
  }

  const flatRecipes = runner.getFlatRecipes();
  const banner = runner.spawnBanner;

  return (
    <div className="w-full max-w-lg">
      {banner && (
        <InlineStatusBanner
          icon={AlertTriangle}
          severity="warning"
          title={buildBannerTitle(
            banner.spawned,
            banner.total,
            banner.failed.map((f) => f.name)
          )}
          description={
            banner.unresolvedVars.length > 0
              ? `Missing context for ${banner.unresolvedVars.map((v) => `{{${v}}}`).join(", ")}.`
              : undefined
          }
          actions={
            banner.failed.length > 0
              ? [
                  {
                    id: "retry-failed",
                    label: "Retry failed",
                    icon: RotateCcw,
                    variant: "primary",
                    onClick: runner.retryFailed,
                  },
                ]
              : []
          }
          onClose={runner.dismissSpawnBanner}
        />
      )}
      {runner.showSearch ? (
        <RecipeRunnerList
          sections={runner.sections}
          searchQuery={runner.searchQuery}
          searchResults={runner.searchResults}
          focusedIndex={runner.focusedIndex}
          focusedItemId={runner.focusedItemId}
          showSearch={runner.showSearch}
          disabled={!defaultCwd}
          onSearchChange={runner.setSearchQuery}
          onKeyDown={runner.handleKeyDown}
          onRun={runner.handleRun}
          onEdit={runner.handleEdit}
          onDuplicate={runner.handleDuplicate}
          onPin={runner.handlePin}
          onUnpin={runner.handleUnpin}
          onDelete={runner.handleDelete}
          onCreate={runner.handleCreate}
        />
      ) : (
        <RecipeRunnerGrid
          recipes={flatRecipes}
          focusedIndex={runner.focusedIndex}
          disabled={!defaultCwd}
          onRun={runner.handleRun}
          onEdit={runner.handleEdit}
          onDuplicate={runner.handleDuplicate}
          onPin={runner.handlePin}
          onUnpin={runner.handleUnpin}
          onDelete={runner.handleDelete}
          onCreate={runner.handleCreate}
          onKeyDown={runner.handleKeyDown}
        />
      )}
    </div>
  );
}
