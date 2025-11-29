/**
 * Terminal Recipe Types
 *
 * Types for defining and managing terminal recipes - saved configurations
 * that spawn multiple terminals with one click.
 */

/** Type of terminal in a recipe */
export type RecipeTerminalType = "claude" | "gemini" | "shell" | "custom";

/** A single terminal definition within a recipe */
export interface RecipeTerminal {
  /** Type of terminal to spawn */
  type: RecipeTerminalType;
  /** Custom title for this terminal (optional) */
  title?: string;
  /** Command to execute for custom terminal types (optional) */
  command?: string;
  /** Environment variables to set (optional) */
  env?: Record<string, string>;
}

/** A saved terminal recipe */
export interface TerminalRecipe {
  /** Unique identifier for the recipe */
  id: string;
  /** Human-readable name for the recipe */
  name: string;
  /** Associated worktree ID (undefined for global recipes) */
  worktreeId?: string;
  /** List of terminals to spawn when recipe is executed */
  terminals: RecipeTerminal[];
  /** Timestamp when recipe was created (milliseconds since epoch) */
  createdAt: number;
}
