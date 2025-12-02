/**
 * State Hydration Utilities
 *
 * Provides reusable functions for hydrating application state
 * after initialization or project switching.
 */

import { appClient, projectClient } from "@/clients";
import type { TerminalType } from "@/types";

export interface HydrationOptions {
  /** Function to add a terminal (from terminal store) */
  addTerminal: (options: {
    type?: TerminalType;
    title?: string;
    cwd: string;
    worktreeId?: string;
    location?: "grid" | "dock";
    command?: string;
  }) => Promise<string>;
  /** Function to set active worktree (from worktree store) */
  setActiveWorktree: (id: string | null) => void;
  /** Function to load recipes (from recipe store) */
  loadRecipes: () => Promise<void>;
  /** Function to open diagnostics dock (from diagnostics store) */
  openDiagnosticsDock: (tab?: "problems" | "logs" | "events") => void;
}

/**
 * Hydrate application state from persisted electron-store data.
 * This restores terminals, active worktree, recipes, and diagnostics state.
 *
 * Can be called on initial mount or after a project switch to rehydrate state.
 *
 * @returns Promise that resolves when hydration is complete
 */
export async function hydrateAppState(options: HydrationOptions): Promise<void> {
  const { addTerminal, setActiveWorktree, loadRecipes, openDiagnosticsDock } = options;

  try {
    const appState = await appClient.getState();

    // Guard against undefined state
    if (!appState) {
      console.warn("App state returned undefined during hydration, using defaults");
      return;
    }

    // Restore terminals - main process handles CWD validation and falls back
    // to project root if the persisted cwd is invalid/deleted
    if (appState.terminals && appState.terminals.length > 0) {
      // Get current project to use as fallback for invalid cwd paths
      // Handle errors gracefully - if no project available, persisted cwd will be used
      let projectRoot: string | undefined;
      try {
        const currentProject = await projectClient.getCurrent();
        projectRoot = currentProject?.path;
      } catch (error) {
        console.warn("Failed to get current project for terminal restoration:", error);
        // Continue with undefined projectRoot - main process will handle fallback
      }

      for (const terminal of appState.terminals) {
        try {
          // Skip the default terminal if it exists (it's created automatically)
          if (terminal.id === "default") continue;

          // Use persisted cwd, falling back to project root if empty
          // Main process will validate and handle invalid paths
          const cwd = terminal.cwd || projectRoot || "";

          await addTerminal({
            type: terminal.type,
            title: terminal.title,
            cwd,
            worktreeId: terminal.worktreeId,
            // Force all terminals to the grid on startup so they are immediately visible
            location: "grid",
            command: terminal.command, // Restore agent command for re-launching CLI
          });
        } catch (error) {
          console.warn(`Failed to restore terminal ${terminal.id}:`, error);
          // Continue restoring other terminals
        }
      }
    }

    // Restore active worktree
    if (appState.activeWorktreeId) {
      setActiveWorktree(appState.activeWorktreeId);
    }

    // Load recipes
    await loadRecipes();

    // Handle developer mode auto-open diagnostics
    if (appState.developerMode?.enabled && appState.developerMode.autoOpenDiagnostics) {
      // Open diagnostics dock, optionally switching to events tab
      const tab = appState.developerMode.focusEventsTab ? "events" : undefined;
      openDiagnosticsDock(tab);
    }
  } catch (error) {
    console.error("Failed to hydrate app state:", error);
    throw error;
  }
}
