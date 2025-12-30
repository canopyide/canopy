import { create, type StateCreator } from "zustand";
import type { TerminalRecipe, RecipeTerminal } from "@/types";
import { useTerminalStore, type TerminalInstance } from "./terminalStore";
import { appClient, agentSettingsClient } from "@/clients";
import { getAgentConfig } from "@/config/agents";
import { generateAgentFlags } from "@shared/types";

function terminalToRecipeTerminal(terminal: TerminalInstance): RecipeTerminal {
  return {
    type: terminal.agentId ?? terminal.type ?? "terminal",
    title: terminal.title || undefined,
    command: terminal.command || undefined,
    env: {},
  };
}

interface RecipeState {
  recipes: TerminalRecipe[];
  isLoading: boolean;

  loadRecipes: () => Promise<void>;
  createRecipe: (
    name: string,
    worktreeId: string | undefined,
    terminals: RecipeTerminal[],
    showInEmptyState?: boolean
  ) => Promise<void>;
  updateRecipe: (
    id: string,
    updates: Partial<Omit<TerminalRecipe, "id" | "createdAt">>
  ) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;

  getRecipesForWorktree: (worktreeId: string | undefined) => TerminalRecipe[];
  getRecipeById: (id: string) => TerminalRecipe | undefined;

  runRecipe: (recipeId: string, worktreePath: string, worktreeId?: string) => Promise<void>;

  exportRecipe: (id: string) => string | null;
  importRecipe: (json: string) => Promise<void>;

  generateRecipeFromActiveTerminals: (worktreeId: string) => RecipeTerminal[];
}

const MAX_TERMINALS_PER_RECIPE = 10;

const createRecipeStore: StateCreator<RecipeState> = (set, get) => ({
  recipes: [],
  isLoading: false,

  loadRecipes: async () => {
    set({ isLoading: true });
    try {
      const appState = await appClient.getState();
      set({ recipes: appState.recipes || [], isLoading: false });
    } catch (error) {
      console.error("Failed to load recipes:", error);
      set({ isLoading: false });
    }
  },

  createRecipe: async (name, worktreeId, terminals, showInEmptyState = false) => {
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
      showInEmptyState,
    };

    const newRecipes = [...get().recipes, newRecipe];
    set({ recipes: newRecipes });

    try {
      await appClient.setState({
        recipes: newRecipes.map((r) => ({
          id: r.id,
          name: r.name,
          worktreeId: r.worktreeId,
          terminals: r.terminals,
          createdAt: r.createdAt,
          showInEmptyState: r.showInEmptyState,
          lastUsedAt: r.lastUsedAt,
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

    try {
      await appClient.setState({
        recipes: newRecipes.map((r) => ({
          id: r.id,
          name: r.name,
          worktreeId: r.worktreeId,
          terminals: r.terminals,
          createdAt: r.createdAt,
          showInEmptyState: r.showInEmptyState,
          lastUsedAt: r.lastUsedAt,
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

    try {
      await appClient.setState({
        recipes: newRecipes.map((r) => ({
          id: r.id,
          name: r.name,
          worktreeId: r.worktreeId,
          terminals: r.terminals,
          createdAt: r.createdAt,
          showInEmptyState: r.showInEmptyState,
          lastUsedAt: r.lastUsedAt,
        })),
      });
    } catch (error) {
      console.error("Failed to persist recipe deletion:", error);
      throw error;
    }
  },

  getRecipesForWorktree: (worktreeId) => {
    const recipes = get().recipes;
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

    get()
      .updateRecipe(recipeId, { lastUsedAt: Date.now() })
      .catch((error) => {
        console.warn("Failed to update lastUsedAt for recipe:", error);
      });

    const terminalStore = useTerminalStore.getState();

    // Pre-fetch agent settings once for all agent terminals
    let agentSettings: Awaited<ReturnType<typeof agentSettingsClient.get>> | null = null;
    const hasAgent = recipe.terminals.some((t) => t.type !== "terminal");
    if (hasAgent) {
      try {
        agentSettings = await agentSettingsClient.get();
      } catch (error) {
        console.warn("Failed to fetch agent settings for recipe:", error);
      }
    }

    for (const terminal of recipe.terminals) {
      try {
        const isAgent = terminal.type !== "terminal";
        let command = terminal.command;

        // For agent terminals, always build command with settings/flags
        // Initial prompts will be sent via terminal.write after boot
        if (isAgent) {
          const agentConfig = getAgentConfig(terminal.type);
          if (agentConfig && !command) {
            const baseCommand = agentConfig.command;
            const entry = agentSettings?.agents?.[terminal.type] ?? {};
            const flags = generateAgentFlags(entry, terminal.type);
            command = flags.length > 0 ? `${baseCommand} ${flags.join(" ")}` : baseCommand;
          }
        }

        const terminalId = await terminalStore.addTerminal({
          kind: isAgent ? "agent" : "terminal",
          agentId: isAgent ? terminal.type : undefined,
          title: terminal.title,
          cwd: worktreePath,
          command,
          worktreeId: worktreeId,
        });

        // Queue initial prompt to be sent after agent boots
        if (isAgent && terminal.initialPrompt) {
          terminalStore.queueCommand(
            terminalId,
            terminal.initialPrompt,
            "Recipe initial prompt",
            "automation"
          );
        }
      } catch (error) {
        console.error(`Failed to spawn terminal for recipe ${recipeId}:`, error);
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

    if (!recipe.name || !recipe.terminals || !Array.isArray(recipe.terminals)) {
      throw new Error("Invalid recipe format: missing required fields");
    }

    if (recipe.terminals.length === 0) {
      throw new Error("Recipe must contain at least one terminal");
    }
    if (recipe.terminals.length > MAX_TERMINALS_PER_RECIPE) {
      throw new Error(`Recipe cannot exceed ${MAX_TERMINALS_PER_RECIPE} terminals`);
    }

    const ALLOWED_TYPES = ["terminal", "claude", "gemini", "codex"];
    const sanitizedTerminals = recipe.terminals
      .filter((terminal) => {
        if (!ALLOWED_TYPES.includes(terminal.type)) return false;
        if (terminal.command !== undefined) {
          if (typeof terminal.command !== "string") return false;
          // eslint-disable-next-line no-control-regex
          if (/[\r\n\x00-\x1F]/.test(terminal.command)) return false;
        }
        if (terminal.initialPrompt !== undefined) {
          if (typeof terminal.initialPrompt !== "string") return false;
          // Allow newlines (\r\n) but reject other control chars
          // eslint-disable-next-line no-control-regex
          if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(terminal.initialPrompt)) return false;
        }
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
        initialPrompt:
          typeof terminal.initialPrompt === "string"
            ? terminal.initialPrompt.replace(/\r\n/g, "\n").trimEnd()
            : undefined,
      }));

    if (sanitizedTerminals.length === 0) {
      throw new Error("No valid terminals found in recipe");
    }

    const importedRecipe: TerminalRecipe = {
      id: `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: String(recipe.name),
      worktreeId: typeof recipe.worktreeId === "string" ? recipe.worktreeId : undefined,
      terminals: sanitizedTerminals,
      createdAt: Date.now(),
      showInEmptyState:
        typeof recipe.showInEmptyState === "boolean" ? recipe.showInEmptyState : false,
    };

    const newRecipes = [...get().recipes, importedRecipe];
    set({ recipes: newRecipes });

    try {
      await appClient.setState({
        recipes: newRecipes.map((r) => ({
          id: r.id,
          name: r.name,
          worktreeId: r.worktreeId,
          terminals: r.terminals,
          createdAt: r.createdAt,
          showInEmptyState: r.showInEmptyState,
          lastUsedAt: r.lastUsedAt,
        })),
      });
    } catch (_error) {
      console.error("Failed to persist imported recipe:", _error);
      throw _error;
    }
  },

  generateRecipeFromActiveTerminals: (worktreeId) => {
    const terminalStore = useTerminalStore.getState();

    const activeTerminals = terminalStore.terminals.filter(
      (t) => t.location !== "trash" && t.worktreeId === worktreeId
    );

    const terminalsToCapture = activeTerminals.slice(0, MAX_TERMINALS_PER_RECIPE);

    return terminalsToCapture.map(terminalToRecipeTerminal);
  },
});

export const useRecipeStore = create<RecipeState>()(createRecipeStore);
