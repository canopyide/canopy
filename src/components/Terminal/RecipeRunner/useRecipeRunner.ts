import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useRecipeStore } from "@/store/recipeStore";
import { getCurrentViewStore } from "@/store/createWorktreeStore";
import { useProjectSettingsStore } from "@/store/projectSettingsStore";
import { actionService } from "@/services/ActionService";
import { detectUnresolvedVariables, type RecipeContext } from "@/utils/recipeVariables";
import { getAgentDisplayTitle } from "@/config/agents";
import {
  buildRecipeSections,
  rankSearchResults,
  nextDuplicateName,
  type RecipeSections,
  type RankedRecipe,
} from "./recipeRunnerUtils";
import type { TerminalRecipe, RunCommand, RecipeTerminal } from "@/types";

export interface UseRecipeRunnerOptions {
  activeWorktreeId: string | null | undefined;
  defaultCwd: string | undefined;
}

export interface SpawnBannerState {
  recipeId: string;
  recipeName: string;
  total: number;
  spawned: number;
  failed: Array<{ index: number; name: string }>;
  unresolvedVars: string[];
}

export interface UseRecipeRunnerResult {
  recipes: TerminalRecipe[];
  sections: RecipeSections;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: RankedRecipe[];
  focusedIndex: number;
  setFocusedIndex: (i: number) => void;
  showSearch: boolean;
  totalItems: number;
  focusedItemId: string | undefined;
  suggestions: RunCommand[];
  handleRun: (recipeId: string) => void;
  handleEdit: (recipeId: string) => void;
  handleDuplicate: (recipeId: string) => void;
  handlePin: (recipeId: string) => void;
  handleUnpin: (recipeId: string) => void;
  handleDelete: (recipeId: string) => void;
  handleCreate: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  getFlatRecipes: () => TerminalRecipe[];
  spawnBanner: SpawnBannerState | null;
  dismissSpawnBanner: () => void;
  retryFailed: () => void;
}

export function useRecipeRunner({
  activeWorktreeId,
  defaultCwd,
}: UseRecipeRunnerOptions): UseRecipeRunnerResult {
  const allRecipes = useRecipeStore((s) => s.recipes);
  const runRecipeWithResults = useRecipeStore((s) => s.runRecipeWithResults);
  const updateRecipe = useRecipeStore((s) => s.updateRecipe);
  const deleteRecipe = useRecipeStore((s) => s.deleteRecipe);
  const createRecipe = useRecipeStore((s) => s.createRecipe);
  const getRecipeById = useRecipeStore((s) => s.getRecipeById);

  const allDetectedRunners = useProjectSettingsStore((s) => s.allDetectedRunners);

  const [searchQuery, setSearchQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [spawnBanner, setSpawnBanner] = useState<SpawnBannerState | null>(null);
  const runCounterRef = useRef(0);

  // Stable filtered recipe array for Fuse cache
  const recipes = useMemo(() => {
    return allRecipes.filter(
      (r) => r.worktreeId === activeWorktreeId || r.worktreeId === undefined
    );
  }, [allRecipes, activeWorktreeId]);

  const showSearch = recipes.length > 6;

  const sections = useMemo(() => buildRecipeSections(recipes), [recipes]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return rankSearchResults(recipes, searchQuery.trim(), Date.now());
  }, [recipes, searchQuery]);

  // Build flat list for keyboard navigation
  const getFlatRecipes = useCallback((): TerminalRecipe[] => {
    if (searchQuery.trim()) {
      return searchResults.map((r) => r.recipe);
    }
    return [...sections.pinned, ...sections.recent, ...sections.all];
  }, [searchQuery, searchResults, sections]);

  // +1 for "Create new recipe" button
  const totalItems = getFlatRecipes().length + 1;

  // Reset focused index on worktree/query change
  useEffect(() => {
    setFocusedIndex(0);
  }, [activeWorktreeId, searchQuery]);

  const focusedItemId = useMemo(() => {
    const flat = getFlatRecipes();
    if (focusedIndex < flat.length) {
      return `recipe-option-${flat[focusedIndex]!.id}`;
    }
    if (focusedIndex === flat.length) {
      return "recipe-option-create";
    }
    return undefined;
  }, [focusedIndex, getFlatRecipes]);

  // Suggestions from package.json
  const suggestions = useMemo(() => {
    const keywords = ["dev", "start", "serve", "test", "build"];
    return allDetectedRunners.filter((r) =>
      keywords.some(
        (kw) => r.command.toLowerCase().includes(kw) || r.name.toLowerCase().includes(kw)
      )
    );
  }, [allDetectedRunners]);

  const buildDisplayName = useCallback((terminal: RecipeTerminal): string => {
    if (terminal.title) return terminal.title;
    if (terminal.type !== "terminal" && terminal.type !== "dev-preview") {
      return getAgentDisplayTitle(terminal.type);
    }
    return terminal.type === "dev-preview" ? "Dev Server" : "Terminal";
  }, []);

  const resolveContext = useCallback((): RecipeContext => {
    const worktreeData = activeWorktreeId
      ? getCurrentViewStore().getState().worktrees.get(activeWorktreeId)
      : null;
    return {
      issueNumber: worktreeData?.issueNumber,
      prNumber: worktreeData?.prNumber,
      worktreePath: defaultCwd,
      branchName: worktreeData?.branch,
    };
  }, [defaultCwd, activeWorktreeId]);

  const handleRun = useCallback(
    (recipeId: string) => {
      if (!defaultCwd) return;
      const recipe = getRecipeById(recipeId);
      if (!recipe) return;

      const context = resolveContext();

      const unresolvedVars = new Set<string>();
      for (const terminal of recipe.terminals) {
        const texts = [terminal.command, terminal.initialPrompt, terminal.devCommand].filter(
          (t): t is string => typeof t === "string" && t.length > 0
        );
        for (const text of texts) {
          for (const v of detectUnresolvedVariables(text, context)) {
            unresolvedVars.add(v);
          }
        }
      }

      setSpawnBanner(null);
      const runId = ++runCounterRef.current;

      runRecipeWithResults(recipeId, defaultCwd, activeWorktreeId ?? undefined, context, {
        spawnedBy: "recipe",
      })
        .then((results) => {
          if (runId !== runCounterRef.current) return;
          if (results.failed.length === 0 && unresolvedVars.size === 0) return;

          const failed = results.failed.map((f) => {
            const terminal = recipe.terminals[f.index];
            const name = terminal ? buildDisplayName(terminal) : `Terminal ${f.index + 1}`;
            return { index: f.index, name };
          });

          setSpawnBanner({
            recipeId,
            recipeName: recipe.name,
            total: recipe.terminals.length,
            spawned: results.spawned.length,
            failed,
            unresolvedVars: [...unresolvedVars].sort(),
          });
        })
        .catch(() => {
          // runRecipeWithResults already logs errors internally;
          // a thrown error here means the recipe itself wasn't found
        });
    },
    [
      defaultCwd,
      activeWorktreeId,
      getRecipeById,
      resolveContext,
      runRecipeWithResults,
      buildDisplayName,
    ]
  );

  const dismissSpawnBanner = useCallback(() => {
    setSpawnBanner(null);
  }, []);

  const retryFailed = useCallback(() => {
    setSpawnBanner((current) => {
      if (!current || current.failed.length === 0) return null;
      const recipe = getRecipeById(current.recipeId);
      if (!recipe) return null;

      const context = resolveContext();
      const indices = current.failed.map((f) => f.index);

      runRecipeWithResults(current.recipeId, defaultCwd!, activeWorktreeId ?? undefined, context, {
        spawnedBy: "recipe",
        terminalIndices: indices,
      })
        .then((results) => {
          const stillFailed = results.failed.map((f) => {
            const terminal = recipe.terminals[f.index];
            const name = terminal ? buildDisplayName(terminal) : `Terminal ${f.index + 1}`;
            return { index: f.index, name };
          });

          setSpawnBanner((prev) => {
            if (!prev) return null;
            const prevUnresolved = prev.unresolvedVars;
            if (stillFailed.length === 0 && prevUnresolved.length === 0) return null;
            return {
              ...prev,
              spawned: results.spawned.length,
              failed: stillFailed,
              unresolvedVars: prevUnresolved,
            };
          });
        })
        .catch(() => {});

      return current;
    });
  }, [
    getRecipeById,
    resolveContext,
    runRecipeWithResults,
    defaultCwd,
    activeWorktreeId,
    buildDisplayName,
  ]);

  const handleEdit = useCallback(
    (recipeId: string) => {
      window.dispatchEvent(
        new CustomEvent("daintree:open-recipe-editor", {
          detail: { recipeId, worktreeId: activeWorktreeId },
        })
      );
    },
    [activeWorktreeId]
  );

  const handleDuplicate = useCallback(
    (recipeId: string) => {
      const recipe = getRecipeById(recipeId);
      if (!recipe) return;
      // Pick a name whose stableInRepoId doesn't collide with any existing recipe —
      // otherwise duplicating an in-repo recipe twice silently overwrites the first.
      const existingIds = new Set(allRecipes.map((r) => r.id));
      const copyName = nextDuplicateName(recipe.name, existingIds);
      void createRecipe(
        recipe.projectId,
        copyName,
        recipe.worktreeId,
        recipe.terminals,
        false,
        recipe.autoAssign
      );
    },
    [getRecipeById, createRecipe, allRecipes]
  );

  const handlePin = useCallback(
    (recipeId: string) => {
      void updateRecipe(recipeId, { showInEmptyState: true });
    },
    [updateRecipe]
  );

  const handleUnpin = useCallback(
    (recipeId: string) => {
      void updateRecipe(recipeId, { showInEmptyState: false });
    },
    [updateRecipe]
  );

  const handleDelete = useCallback(
    (recipeId: string) => {
      void deleteRecipe(recipeId);
    },
    [deleteRecipe]
  );

  const handleCreate = useCallback(() => {
    void actionService.dispatch(
      "recipe.editor.open",
      { worktreeId: activeWorktreeId },
      { source: "user" }
    );
  }, [activeWorktreeId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % totalItems);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + totalItems) % totalItems);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const flat = getFlatRecipes();
        if (focusedIndex < flat.length) {
          handleRun(flat[focusedIndex]!.id);
        } else {
          handleCreate();
        }
      } else if (e.key === "Escape") {
        if (searchQuery) {
          e.preventDefault();
          setSearchQuery("");
        }
      } else if (
        e.key === "e" &&
        // Ctrl+E in a text input means "move cursor to end of line" on
        // Linux/Windows (readline binding) — don't steal it. Cmd+E on macOS
        // doesn't conflict with input editing, so allow it from any target.
        (e.metaKey || (e.ctrlKey && !(e.target instanceof HTMLInputElement)))
      ) {
        e.preventDefault();
        const flat = getFlatRecipes();
        if (focusedIndex < flat.length) {
          handleEdit(flat[focusedIndex]!.id);
        }
      }
    },
    [totalItems, focusedIndex, getFlatRecipes, handleRun, handleCreate, handleEdit, searchQuery]
  );

  return {
    recipes,
    sections,
    searchQuery,
    setSearchQuery,
    searchResults,
    focusedIndex,
    setFocusedIndex,
    showSearch,
    totalItems,
    focusedItemId,
    suggestions,
    handleRun,
    handleEdit,
    handleDuplicate,
    handlePin,
    handleUnpin,
    handleDelete,
    handleCreate,
    handleKeyDown,
    getFlatRecipes,
    spawnBanner,
    dismissSpawnBanner,
    retryFailed,
  };
}
