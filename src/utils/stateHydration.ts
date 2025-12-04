import { appClient, projectClient, terminalConfigClient, terminalClient } from "@/clients";
import { useLayoutConfigStore, useScrollbackStore, usePerformanceModeStore } from "@/store";
import type { TerminalType, TerminalSettings, TerminalState, AgentState } from "@/types";

export interface HydrationOptions {
  addTerminal: (options: {
    type?: TerminalType;
    title?: string;
    cwd: string;
    worktreeId?: string;
    location?: "grid" | "dock";
    command?: string;
    settings?: TerminalSettings;
    agentState?: AgentState;
    lastStateChange?: number;
    existingId?: string; // Pass to reconnect to existing backend process
  }) => Promise<string>;
  setActiveWorktree: (id: string | null) => void;
  loadRecipes: () => Promise<void>;
  openDiagnosticsDock: (tab?: "problems" | "logs" | "events") => void;
}

export async function hydrateAppState(options: HydrationOptions): Promise<void> {
  const { addTerminal, setActiveWorktree, loadRecipes, openDiagnosticsDock } = options;

  try {
    // Hydrate terminal config (scrollback, performance mode) BEFORE restoring terminals
    try {
      const terminalConfig = await terminalConfigClient.get();
      if (terminalConfig?.scrollbackLines !== undefined) {
        let { scrollbackLines } = terminalConfig;
        // Migrate legacy values to new defaults (Issue #504 optimization)
        // - Unlimited (-1) → 1,000 (no longer supported)
        // - Values > 1,000 → 1,000 (clamp to new default for memory savings)
        if (scrollbackLines === -1 || scrollbackLines > 1000) {
          console.log(
            `Migrating scrollback from ${scrollbackLines} to 1000 (Issue #504 optimization)`
          );
          scrollbackLines = 1000;
          // Persist the migration
          terminalConfigClient.setScrollback(1000).catch((err) => {
            console.warn("Failed to persist scrollback migration:", err);
          });
        }
        // Validate persisted value
        if (
          Number.isFinite(scrollbackLines) &&
          Number.isInteger(scrollbackLines) &&
          scrollbackLines >= 100 &&
          scrollbackLines <= 1000
        ) {
          useScrollbackStore.getState().setScrollbackLines(scrollbackLines);
        } else {
          console.warn("Invalid persisted scrollback value, using default:", scrollbackLines);
        }
      }
      // Hydrate performance mode
      if (terminalConfig?.performanceMode !== undefined) {
        usePerformanceModeStore.getState().setPerformanceMode(terminalConfig.performanceMode);
        // Apply the data attribute to body immediately
        if (terminalConfig.performanceMode) {
          document.body.setAttribute("data-performance-mode", "true");
        } else {
          document.body.removeAttribute("data-performance-mode");
        }
      }
    } catch (error) {
      console.warn("Failed to hydrate terminal config:", error);
    }

    const appState = await appClient.getState();

    if (!appState) {
      console.warn("App state returned undefined during hydration, using defaults");
      return;
    }

    if (appState.terminals && appState.terminals.length > 0) {
      let projectRoot: string | undefined;
      let currentProjectId: string | undefined;
      try {
        const currentProject = await projectClient.getCurrent();
        projectRoot = currentProject?.path;
        currentProjectId = currentProject?.id;
      } catch (error) {
        console.warn("Failed to get current project for terminal restoration:", error);
      }

      // Query backend for existing terminals in this project
      let backendTerminalIds = new Set<string>();
      if (currentProjectId) {
        try {
          const backendTerminals = await terminalClient.getForProject(currentProjectId);
          backendTerminalIds = new Set(backendTerminals.map((t) => t.id));
          console.log(`[Hydration] Found ${backendTerminalIds.size} existing terminals in backend`);
        } catch (error) {
          console.warn("Failed to query backend terminals:", error);
        }
      }

      for (const terminal of appState.terminals) {
        try {
          if (terminal.id === "default") continue;

          const cwd = terminal.cwd || projectRoot || "";

          // Check if backend already has this terminal (from Phase 1 process preservation)
          if (backendTerminalIds.has(terminal.id)) {
            console.log(`[Hydration] Reconnecting to existing terminal: ${terminal.id}`);

            // Verify terminal still exists and get current state
            let reconnectResult;
            try {
              reconnectResult = await terminalClient.reconnect(terminal.id);
            } catch (reconnectError) {
              console.warn(`[Hydration] Reconnect failed for ${terminal.id}:`, reconnectError);
              await spawnNewTerminal(terminal, cwd, addTerminal);
              continue;
            }

            if (reconnectResult.exists) {
              // Add to UI without spawning new process, preserving agent state
              const agentState = reconnectResult.agentState as AgentState | undefined;
              await addTerminal({
                type: terminal.type,
                title: terminal.title,
                cwd,
                worktreeId: terminal.worktreeId,
                location: terminal.location === "dock" ? "dock" : "grid",
                settings: terminal.settings,
                existingId: terminal.id, // Flag to skip spawning
                agentState,
                lastStateChange: agentState ? Date.now() : undefined,
              });

              // Request history replay for seamless restoration
              try {
                const { replayed } = await terminalClient.replayHistory(terminal.id, 100);
                console.log(`[Hydration] Replayed ${replayed} lines for terminal ${terminal.id}`);
              } catch (replayError) {
                console.warn(`[Hydration] History replay failed for ${terminal.id}:`, replayError);
              }
            } else {
              // Backend lost this terminal - spawn new
              console.warn(
                `[Hydration] Terminal ${terminal.id} not found in backend, spawning new`
              );
              await spawnNewTerminal(terminal, cwd, addTerminal);
            }
          } else {
            // No existing process - spawn new
            await spawnNewTerminal(terminal, cwd, addTerminal);
          }
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

// Helper function for spawning new terminals
async function spawnNewTerminal(
  terminal: TerminalState,
  cwd: string,
  addTerminal: HydrationOptions["addTerminal"]
): Promise<void> {
  const autoRestart = terminal.settings?.autoRestart ?? false;
  const commandToRun = autoRestart ? terminal.command : undefined;

  await addTerminal({
    type: terminal.type,
    title: terminal.title,
    cwd,
    worktreeId: terminal.worktreeId,
    location: terminal.location === "dock" ? "dock" : "grid",
    command: commandToRun,
    settings: terminal.settings,
  });
}
