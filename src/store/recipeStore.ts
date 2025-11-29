/**
 * Recipe Store
 *
 * Zustand store for managing terminal recipes - saved configurations
 * that spawn multiple terminals with one click.
 */

import { create, type StateCreator } from "zustand";
import type { TerminalRecipe, RecipeTerminal } from "@/types";
import { useTerminalStore } from "./terminalStore";

interface RecipeState {
  recipes: TerminalRecipe[];
  isLoading: boolean;

  // CRUD operations
  loadRecipes: () => Promise<void>;
  createRecipe: (
    name: string,
    worktreeId: string | undefined,
    terminals: RecipeTerminal[]
  ) => Promise<void>;
  updateRecipe: (
    id: string,
    updates: Partial<Omit<TerminalRecipe, "id" | "createdAt">>
  ) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;

  // Query operations
  getRecipesForWorktree: (worktreeId: string | undefined) => TerminalRecipe[];
  getRecipeById: (id: string) => TerminalRecipe | undefined;

  // Recipe execution
  runRecipe: (recipeId: string, worktreePath: string, worktreeId?: string) => Promise<void>;

  // Import/Export
  exportRecipe: (id: string) => string | null;
  importRecipe: (json: string) => Promise<void>;
}

const MAX_TERMINALS_PER_RECIPE = 10;

const createRecipeStore: StateCreator<RecipeState> = (set, get) => ({
  recipes: [],
  isLoading: false,

  loadRecipes: async () => {
    set({ isLoading: true });
    try {
      const appState = await window.electron.app.getState();
      set({ recipes: appState.recipes || [], isLoading: false });
    } catch (error) {
      console.error("Failed to load recipes:", error);
      set({ isLoading: false });
    }
  },

  createRecipe: async (name, worktreeId, terminals) => {
    // Validate terminal count
    if (terminals.length === 0) {
      throw new Error("Recipe must contain at least one terminal");
    }
    if (terminals.length > MAX_TERMINALS_PER_RECIPE) {
      throw new Error(`Recipe cannot exceed ${MAX_TERMINALS_PER_RECIPE} terminals`);
    }

    const newRecipe: TerminalRecipe = {
      id: `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      worktreeId,
      terminals,
      createdAt: Date.now(),
    };

    const newRecipes = [...get().recipes, newRecipe];
    set({ recipes: newRecipes });

    // Persist to electron-store
    try {
      await window.electron.app.setState({
        recipes: newRecipes.map((r) => ({
          id: r.id,
          name: r.name,
          worktreeId: r.worktreeId,
          terminals: r.terminals,
          createdAt: r.createdAt,
        })),
      });
    } catch (error) {
      console.error("Failed to persist recipe:", error);
      throw error;
    }
  },

  updateRecipe: async (id, updates) => {
    const recipes = get().recipes;
    const index = recipes.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`Recipe ${id} not found`);
    }

    // Validate terminal count if terminals are being updated
    if (updates.terminals) {
      if (updates.terminals.length === 0) {
        throw new Error("Recipe must contain at least one terminal");
      }
      if (updates.terminals.length > MAX_TERMINALS_PER_RECIPE) {
        throw new Error(`Recipe cannot exceed ${MAX_TERMINALS_PER_RECIPE} terminals`);
      }
    }

    const updatedRecipe = { ...recipes[index], ...updates };
    const newRecipes = [...recipes];
    newRecipes[index] = updatedRecipe;

    set({ recipes: newRecipes });

    // Persist to electron-store
    try {
      await window.electron.app.setState({
        recipes: newRecipes.map((r) => ({
          id: r.id,
          name: r.name,
          worktreeId: r.worktreeId,
          terminals: r.terminals,
          createdAt: r.createdAt,
        })),
      });
    } catch (error) {
      console.error("Failed to persist recipe update:", error);
      throw error;
    }
  },

  deleteRecipe: async (id) => {
    const newRecipes = get().recipes.filter((r) => r.id !== id);
    set({ recipes: newRecipes });

    // Persist to electron-store
    try {
      await window.electron.app.setState({
        recipes: newRecipes.map((r) => ({
          id: r.id,
          name: r.name,
          worktreeId: r.worktreeId,
          terminals: r.terminals,
          createdAt: r.createdAt,
        })),
      });
    } catch (error) {
      console.error("Failed to persist recipe deletion:", error);
      throw error;
    }
  },

  getRecipesForWorktree: (worktreeId) => {
    const recipes = get().recipes;
    // Return recipes for this worktree + global recipes (no worktreeId)
    return recipes.filter((r) => r.worktreeId === worktreeId || r.worktreeId === undefined);
  },

  getRecipeById: (id) => {
    return get().recipes.find((r) => r.id === id);
  },

  runRecipe: async (recipeId, worktreePath, worktreeId) => {
    const recipe = get().getRecipeById(recipeId);
    if (!recipe) {
      throw new Error(`Recipe ${recipeId} not found`);
    }

    const terminalStore = useTerminalStore.getState();

    // Spawn terminals sequentially to avoid overwhelming PTY
    for (const terminal of recipe.terminals) {
      try {
        await terminalStore.addTerminal({
          type: terminal.type,
          title: terminal.title,
          cwd: worktreePath,
          command: terminal.command,
          worktreeId: worktreeId, // Use runtime worktree context, not stored recipe worktreeId
          // Note: env is intentionally omitted from AddTerminalOptions interface
          // Terminal environment variables would need to be added to the interface first
        });
      } catch (error) {
        console.error(`Failed to spawn terminal for recipe ${recipeId}:`, error);
        // Continue with remaining terminals
      }
    }
  },

  exportRecipe: (id) => {
    const recipe = get().getRecipeById(id);
    if (!recipe) {
      return null;
    }
    return JSON.stringify(recipe, null, 2);
  },

  importRecipe: async (json) => {
    let recipe: TerminalRecipe;
    try {
      recipe = JSON.parse(json);
    } catch (_error) {
      throw new Error("Invalid JSON format");
    }

    // Validate required fields
    if (!recipe.name || !recipe.terminals || !Array.isArray(recipe.terminals)) {
      throw new Error("Invalid recipe format: missing required fields");
    }

    // Validate terminal count
    if (recipe.terminals.length === 0) {
      throw new Error("Recipe must contain at least one terminal");
    }
    if (recipe.terminals.length > MAX_TERMINALS_PER_RECIPE) {
      throw new Error(`Recipe cannot exceed ${MAX_TERMINALS_PER_RECIPE} terminals`);
    }

    // Validate and sanitize terminals
    const ALLOWED_TYPES = ["shell", "claude", "gemini", "custom"];
    const sanitizedTerminals = recipe.terminals
      .filter((terminal) => {
        // Validate type
        if (!ALLOWED_TYPES.includes(terminal.type)) return false;
        // Validate command (if present): must be string, no newlines/control chars
        if (terminal.command !== undefined) {
          if (typeof terminal.command !== "string") return false;
          // eslint-disable-next-line no-control-regex
          if (/[\r\n\x00-\x1F]/.test(terminal.command)) return false;
        }
        // Validate env (if present): must be object with string values
        if (terminal.env !== undefined) {
          if (
            typeof terminal.env !== "object" ||
            terminal.env === null ||
            Array.isArray(terminal.env)
          )
            return false;
          for (const value of Object.values(terminal.env)) {
            if (typeof value !== "string") return false;
          }
        }
        return true;
      })
      .map((terminal) => ({
        type: terminal.type,
        title: typeof terminal.title === "string" ? terminal.title : undefined,
        command: typeof terminal.command === "string" ? terminal.command.trim() : undefined,
        env: terminal.env,
      }));

    if (sanitizedTerminals.length === 0) {
      throw new Error("No valid terminals found in recipe");
    }

    // Generate new ID to avoid conflicts and strip prototype pollution keys
    const importedRecipe: TerminalRecipe = {
      id: `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: String(recipe.name),
      worktreeId: typeof recipe.worktreeId === "string" ? recipe.worktreeId : undefined,
      terminals: sanitizedTerminals,
      createdAt: Date.now(),
    };

    const newRecipes = [...get().recipes, importedRecipe];
    set({ recipes: newRecipes });

    // Persist to electron-store
    try {
      await window.electron.app.setState({
        recipes: newRecipes.map((r) => ({
          id: r.id,
          name: r.name,
          worktreeId: r.worktreeId,
          terminals: r.terminals,
          createdAt: r.createdAt,
        })),
      });
    } catch (_error) {
      console.error("Failed to persist imported recipe:", _error);
      throw _error;
    }
  },
});

export const useRecipeStore = create<RecipeState>()(createRecipeStore);
