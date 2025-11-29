/**
 * Recipe Editor Component
 *
 * Modal UI for creating and editing terminal recipes.
 * Allows users to:
 * - Set recipe name and worktree association
 * - Add/remove/reorder terminals
 * - Configure terminal type, title, command, and environment variables
 * - Save recipe to electron-store
 */

import { useState, useEffect } from "react";
import type { TerminalRecipe, RecipeTerminal, RecipeTerminalType } from "@/types";
import { Button } from "@/components/ui/button";
import { useRecipeStore } from "@/store/recipeStore";

interface RecipeEditorProps {
  /** Recipe to edit (undefined for creating new recipe) */
  recipe?: TerminalRecipe;
  /** Worktree ID to associate with new recipe (undefined for global) */
  worktreeId?: string;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when recipe is saved */
  onSave?: (recipe: TerminalRecipe) => void;
}

const TERMINAL_TYPES: RecipeTerminalType[] = ["shell", "claude", "gemini", "custom"];

const TYPE_LABELS: Record<RecipeTerminalType, string> = {
  shell: "Shell",
  claude: "Claude",
  gemini: "Gemini",
  custom: "Custom",
};

export function RecipeEditor({ recipe, worktreeId, isOpen, onClose, onSave }: RecipeEditorProps) {
  const createRecipe = useRecipeStore((state) => state.createRecipe);
  const updateRecipe = useRecipeStore((state) => state.updateRecipe);

  const [recipeName, setRecipeName] = useState("");
  const [terminals, setTerminals] = useState<RecipeTerminal[]>([
    { type: "shell", title: "", command: "", env: {} },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load recipe data when editing
  useEffect(() => {
    if (recipe) {
      setRecipeName(recipe.name);
      setTerminals(recipe.terminals.map((t) => ({ ...t })));
    } else {
      setRecipeName("");
      setTerminals([{ type: "shell", title: "", command: "", env: {} }]);
    }
    setError(null);
  }, [recipe, isOpen]);

  const handleAddTerminal = () => {
    if (terminals.length >= 10) {
      setError("Maximum of 10 terminals per recipe");
      return;
    }
    setTerminals([...terminals, { type: "shell", title: "", command: "", env: {} }]);
  };

  const handleRemoveTerminal = (index: number) => {
    if (terminals.length === 1) {
      setError("Recipe must contain at least one terminal");
      return;
    }
    setTerminals(terminals.filter((_, i) => i !== index));
  };

  const handleTerminalChange = (
    index: number,
    field: keyof RecipeTerminal,
    value: string | Record<string, string>
  ) => {
    const newTerminals = [...terminals];
    newTerminals[index] = { ...newTerminals[index], [field]: value };
    setTerminals(newTerminals);
  };

  const handleSave = async () => {
    setError(null);

    // Validate recipe name
    if (!recipeName.trim()) {
      setError("Recipe name is required");
      return;
    }

    // Validate terminals
    if (terminals.length === 0) {
      setError("Recipe must contain at least one terminal");
      return;
    }

    setIsSaving(true);

    try {
      if (recipe) {
        // Update existing recipe
        await updateRecipe(recipe.id, {
          name: recipeName,
          terminals,
        });
      } else {
        // Create new recipe
        await createRecipe(recipeName, worktreeId, terminals);
      }

      if (onSave) {
        const savedRecipe: TerminalRecipe = recipe
          ? { ...recipe, name: recipeName, terminals }
          : {
              id: `recipe-${Date.now()}`,
              name: recipeName,
              worktreeId,
              terminals,
              createdAt: Date.now(),
            };
        onSave(savedRecipe);
      }

      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save recipe");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={() => {
        if (!isSaving) {
          onClose();
        }
      }}
    >
      <div
        className="bg-canopy-sidebar border border-canopy-border rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-editor-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-canopy-border">
          <h2 id="recipe-editor-title" className="text-lg font-semibold text-canopy-text">
            {recipe ? "Edit Recipe" : "Create Recipe"}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(80vh-180px)]">
          {/* Recipe Name */}
          <div className="mb-4">
            <label
              htmlFor="recipe-name"
              className="block text-sm font-medium text-canopy-text mb-1"
            >
              Recipe Name
            </label>
            <input
              id="recipe-name"
              type="text"
              value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
              placeholder="e.g., Full Stack Dev"
              className="w-full px-3 py-2 bg-canopy-background border border-canopy-border rounded-md text-canopy-text focus:outline-none focus:ring-2 focus:ring-canopy-accent"
            />
          </div>

          {/* Terminals List */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-canopy-text">
                Terminals ({terminals.length}/10)
              </label>
              <Button size="sm" onClick={handleAddTerminal} disabled={terminals.length >= 10}>
                + Add Terminal
              </Button>
            </div>

            <div className="space-y-3">
              {terminals.map((terminal, index) => (
                <div
                  key={index}
                  className="bg-canopy-background border border-canopy-border rounded-md p-3"
                >
                  <div className="flex items-start gap-3">
                    {/* Terminal Type */}
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-canopy-text mb-1">
                        Type
                      </label>
                      <select
                        value={terminal.type}
                        onChange={(e) =>
                          handleTerminalChange(index, "type", e.target.value as RecipeTerminalType)
                        }
                        className="w-full px-2 py-1.5 bg-canopy-sidebar border border-canopy-border rounded text-sm text-canopy-text"
                      >
                        {TERMINAL_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {TYPE_LABELS[type]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Terminal Title */}
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-canopy-text mb-1">
                        Title (optional)
                      </label>
                      <input
                        type="text"
                        value={terminal.title || ""}
                        onChange={(e) => handleTerminalChange(index, "title", e.target.value)}
                        placeholder="Default"
                        className="w-full px-2 py-1.5 bg-canopy-sidebar border border-canopy-border rounded text-sm text-canopy-text"
                      />
                    </div>

                    {/* Remove Button */}
                    <div className="pt-5">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRemoveTerminal(index)}
                        disabled={terminals.length === 1}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>

                  {/* Command (for custom type) */}
                  {terminal.type === "custom" && (
                    <div className="mt-2">
                      <label className="block text-xs font-medium text-canopy-text mb-1">
                        Command (optional)
                      </label>
                      <input
                        type="text"
                        value={terminal.command || ""}
                        onChange={(e) => handleTerminalChange(index, "command", e.target.value)}
                        placeholder="e.g., npm run dev"
                        className="w-full px-2 py-1.5 bg-canopy-sidebar border border-canopy-border rounded text-sm text-canopy-text"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-md text-[var(--color-status-error)] text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-canopy-border flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} autoFocus>
            {isSaving ? "Saving..." : recipe ? "Update Recipe" : "Create Recipe"}
          </Button>
        </div>
      </div>
    </div>
  );
}
