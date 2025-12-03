import { appClient, projectClient, terminalConfigClient } from "@/clients";
import { useLayoutConfigStore, useScrollbackStore } from "@/store";
import type { TerminalType } from "@/types";

export interface HydrationOptions {
  addTerminal: (options: {
    type?: TerminalType;
    title?: string;
    cwd: string;
    worktreeId?: string;
    location?: "grid" | "dock";
    command?: string;
  }) => Promise<string>;
  setActiveWorktree: (id: string | null) => void;
  loadRecipes: () => Promise<void>;
  openDiagnosticsDock: (tab?: "problems" | "logs" | "events") => void;
}

export async function hydrateAppState(options: HydrationOptions): Promise<void> {
  const { addTerminal, setActiveWorktree, loadRecipes, openDiagnosticsDock } = options;

  try {
    const appState = await appClient.getState();

    if (!appState) {
      console.warn("App state returned undefined during hydration, using defaults");
      return;
    }

    // Hydrate terminal config (scrollback) BEFORE restoring terminals
    try {
      const terminalConfig = await terminalConfigClient.get();
      if (terminalConfig?.scrollbackLines !== undefined) {
        const { scrollbackLines } = terminalConfig;
        // Validate persisted value
        if (
          Number.isFinite(scrollbackLines) &&
          Number.isInteger(scrollbackLines) &&
          (scrollbackLines === -1 || (scrollbackLines >= 100 && scrollbackLines <= 100000))
        ) {
          useScrollbackStore.getState().setScrollbackLines(scrollbackLines);
        } else {
          console.warn("Invalid persisted scrollback value, using default:", scrollbackLines);
        }
      }
    } catch (error) {
      console.warn("Failed to hydrate terminal config:", error);
    }

    if (appState.terminals && appState.terminals.length > 0) {
      let projectRoot: string | undefined;
      try {
        const currentProject = await projectClient.getCurrent();
        projectRoot = currentProject?.path;
      } catch (error) {
        console.warn("Failed to get current project for terminal restoration:", error);
      }

      for (const terminal of appState.terminals) {
        try {
          if (terminal.id === "default") continue;

          const cwd = terminal.cwd || projectRoot || "";

          await addTerminal({
            type: terminal.type,
            title: terminal.title,
            cwd,
            worktreeId: terminal.worktreeId,
            location: "grid",
            command: terminal.command,
          });
        } catch (error) {
          console.warn(`Failed to restore terminal ${terminal.id}:`, error);
        }
      }
    }

    if (appState.activeWorktreeId) {
      setActiveWorktree(appState.activeWorktreeId);
    }

    await loadRecipes();

    if (appState.developerMode?.enabled && appState.developerMode.autoOpenDiagnostics) {
      const tab = appState.developerMode.focusEventsTab ? "events" : undefined;
      openDiagnosticsDock(tab);
    }

    if (appState.terminalGridConfig) {
      useLayoutConfigStore.getState().setLayoutConfig(appState.terminalGridConfig);
    }
  } catch (error) {
    console.error("Failed to hydrate app state:", error);
    throw error;
  }
}
