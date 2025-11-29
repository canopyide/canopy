import { useCallback, useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import {
  isElectronAvailable,
  useAgentLauncher,
  useWorktrees,
  useContextInjection,
  useTerminalPalette,
  useKeybinding,
} from "./hooks";
import { AppLayout } from "./components/Layout";
import { TerminalGrid } from "./components/Terminal";
import { WorktreeCard } from "./components/Worktree";
import { NewWorktreeDialog } from "./components/Worktree/NewWorktreeDialog";
import { ProblemsPanel } from "./components/Errors";
import { TerminalPalette } from "./components/TerminalPalette";
import { RecipeEditor } from "./components/TerminalRecipe/RecipeEditor";
import { SettingsDialog } from "./components/Settings";
import {
  useTerminalStore,
  useWorktreeSelectionStore,
  useLogsStore,
  useErrorStore,
  useEventStore,
  type RetryAction,
} from "./store";
import { useRecipeStore } from "./store/recipeStore";
import type { WorktreeState } from "./types";

function SidebarContent() {
  const { worktrees, isLoading, error, refresh } = useWorktrees();
  const { inject, isInjecting } = useContextInjection();
  const { activeWorktreeId, focusedWorktreeId, selectWorktree, setActiveWorktree } =
    useWorktreeSelectionStore();
  const focusedTerminalId = useTerminalStore((state) => state.focusedId);

  // Recipe editor state
  const [isRecipeEditorOpen, setIsRecipeEditorOpen] = useState(false);
  const [recipeEditorWorktreeId, setRecipeEditorWorktreeId] = useState<string | undefined>(
    undefined
  );

  // New worktree dialog state
  const [isNewWorktreeDialogOpen, setIsNewWorktreeDialogOpen] = useState(false);

  // Set first worktree as active by default
  useEffect(() => {
    if (worktrees.length > 0 && !activeWorktreeId) {
      setActiveWorktree(worktrees[0].id);
    }
  }, [worktrees, activeWorktreeId, setActiveWorktree]);

  const handleCopyTree = useCallback((worktree: WorktreeState) => {
    // Use copytree directly to clipboard (future enhancement)
    console.log("Copy tree for worktree:", worktree.path);
  }, []);

  const handleOpenEditor = useCallback((worktree: WorktreeState) => {
    window.electron?.system?.openPath(worktree.path);
  }, []);

  const handleToggleServer = useCallback((worktree: WorktreeState) => {
    window.electron?.devServer?.toggle(worktree.id, worktree.path);
  }, []);

  const handleInjectContext = useCallback(
    (worktreeId: string) => {
      if (focusedTerminalId) {
        inject(worktreeId, focusedTerminalId);
      } else {
        console.warn("No terminal focused for context injection");
      }
    },
    [inject, focusedTerminalId]
  );

  const handleCreateRecipe = useCallback((worktreeId: string) => {
    setRecipeEditorWorktreeId(worktreeId);
    setIsRecipeEditorOpen(true);
  }, []);

  const handleCloseRecipeEditor = useCallback(() => {
    setIsRecipeEditorOpen(false);
    setRecipeEditorWorktreeId(undefined);
  }, []);

  if (isLoading) {
    return (
      <div className="p-4">
        <h2 className="text-canopy-text font-semibold text-sm mb-4">Worktrees</h2>
        <div className="text-canopy-text/60 text-sm">Loading worktrees...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <h2 className="text-canopy-text font-semibold text-sm mb-4">Worktrees</h2>
        <div className="text-red-400 text-sm mb-2">{error}</div>
        <button
          onClick={refresh}
          className="text-xs px-2 py-1 border border-gray-600 rounded hover:bg-gray-800 text-gray-300"
        >
          Retry
        </button>
      </div>
    );
  }

  if (worktrees.length === 0) {
    return (
      <div className="p-4">
        <h2 className="text-canopy-text font-semibold text-sm mb-4">Worktrees</h2>
        <div className="text-canopy-text/60 text-sm">No worktrees found.</div>
      </div>
    );
  }

  // Get root path from first worktree (assuming all worktrees are from the same repo)
  const rootPath =
    worktrees.length > 0 && worktrees[0].path ? worktrees[0].path.split("/.git/")[0] : "";

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-canopy-text font-semibold text-sm">Worktrees</h2>
        <button
          onClick={() => setIsNewWorktreeDialogOpen(true)}
          className="text-xs px-2 py-1 bg-canopy-accent/10 hover:bg-canopy-accent/20 text-canopy-accent rounded transition-colors"
          title="Create new worktree"
        >
          + New
        </button>
      </div>
      <div className="space-y-2">
        {worktrees.map((worktree) => (
          <WorktreeCard
            key={worktree.id}
            worktree={worktree}
            isActive={worktree.id === activeWorktreeId}
            isFocused={worktree.id === focusedWorktreeId}
            onSelect={() => selectWorktree(worktree.id)}
            onCopyTree={() => handleCopyTree(worktree)}
            onOpenEditor={() => handleOpenEditor(worktree)}
            onToggleServer={() => handleToggleServer(worktree)}
            onInjectContext={focusedTerminalId ? () => handleInjectContext(worktree.id) : undefined}
            isInjecting={isInjecting}
            onCreateRecipe={() => handleCreateRecipe(worktree.id)}
          />
        ))}
      </div>

      {/* Recipe Editor Modal */}
      <RecipeEditor
        worktreeId={recipeEditorWorktreeId}
        isOpen={isRecipeEditorOpen}
        onClose={handleCloseRecipeEditor}
      />

      {/* New Worktree Dialog */}
      {rootPath && (
        <NewWorktreeDialog
          isOpen={isNewWorktreeDialogOpen}
          onClose={() => setIsNewWorktreeDialogOpen(false)}
          rootPath={rootPath}
          onWorktreeCreated={refresh}
        />
      )}
    </div>
  );
}

function App() {
  const { focusNext, focusPrevious, toggleMaximize, focusedId, addTerminal, updateAgentState } =
    useTerminalStore();
  const { launchAgent } = useAgentLauncher();
  const { activeWorktreeId, setActiveWorktree } = useWorktreeSelectionStore();
  const { inject, isInjecting } = useContextInjection();
  const toggleLogsPanel = useLogsStore((state) => state.togglePanel);
  const toggleEventInspector = useEventStore((state) => state.togglePanel);
  const loadRecipes = useRecipeStore((state) => state.loadRecipes);

  // Terminal palette for quick switching (Cmd/Ctrl+T)
  const terminalPalette = useTerminalPalette();

  // Error panel state
  const isProblemsPanelOpen = useErrorStore((state) => state.isPanelOpen);
  const setProblemsPanelOpen = useErrorStore((state) => state.setPanelOpen);
  const removeError = useErrorStore((state) => state.removeError);

  // Settings dialog state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Track if state has been restored (prevent StrictMode double-execution)
  const hasRestoredState = useRef(false);

  // Listen for agent state changes from main process
  useEffect(() => {
    if (!isElectronAvailable()) return;

    const cleanup = window.electron.terminal.onAgentStateChanged((data) => {
      // Validate state is a valid AgentState before updating
      const validStates = ["idle", "working", "waiting", "completed", "failed"];
      if (!validStates.includes(data.state)) {
        console.warn(`Invalid agent state received: ${data.state}`);
        return;
      }
      updateAgentState(data.agentId, data.state as import("@/types").AgentState);
    });

    return cleanup;
  }, [updateAgentState]);

  // Restore persisted app state on mount
  useEffect(() => {
    // Guard against non-Electron environments and StrictMode double-execution
    if (!isElectronAvailable() || hasRestoredState.current) {
      return;
    }

    hasRestoredState.current = true;

    const restoreState = async () => {
      try {
        const appState = await window.electron.app.getState();

        // Restore terminals (if they exist and their cwd is still valid)
        if (appState.terminals && appState.terminals.length > 0) {
          for (const terminal of appState.terminals) {
            try {
              // Skip the default terminal if it exists (it's created automatically)
              if (terminal.id === "default") continue;

              await addTerminal({
                type: terminal.type,
                title: terminal.title,
                cwd: terminal.cwd,
                worktreeId: terminal.worktreeId,
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
      } catch (error) {
        console.error("Failed to restore app state:", error);
      }
    };

    restoreState();
  }, [addTerminal, setActiveWorktree, loadRecipes]);

  // Handle agent launcher from toolbar
  const handleLaunchAgent = useCallback(
    async (type: "claude" | "gemini" | "shell") => {
      await launchAgent(type);
    },
    [launchAgent]
  );

  const handleRefresh = useCallback(() => {
    // TODO: Implement worktree refresh via IPC
    console.log("Refresh worktrees");
  }, []);

  const handleSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  // Handle context injection via keyboard shortcut
  const handleInjectContextShortcut = useCallback(() => {
    if (activeWorktreeId && focusedId && !isInjecting) {
      inject(activeWorktreeId, focusedId);
    }
  }, [activeWorktreeId, focusedId, isInjecting, inject]);

  // Handle error retry from problems panel
  const handleErrorRetry = useCallback(
    async (errorId: string, action: RetryAction, args?: Record<string, unknown>) => {
      if (window.electron?.errors?.retry) {
        try {
          await window.electron.errors.retry(errorId, action, args);
          removeError(errorId);
        } catch (error) {
          console.error("Error retry failed:", error);
        }
      }
    },
    [removeError]
  );

  // === Centralized Keybindings (via useKeybinding hook) ===
  const electronAvailable = isElectronAvailable();

  // Terminal palette (Cmd+T)
  useKeybinding("terminal.palette", () => terminalPalette.toggle(), { enabled: electronAvailable });

  // Terminal navigation
  useKeybinding("terminal.focusNext", () => focusNext(), { enabled: electronAvailable });
  useKeybinding("terminal.focusPrevious", () => focusPrevious(), { enabled: electronAvailable });
  useKeybinding(
    "terminal.maximize",
    () => {
      if (focusedId) toggleMaximize(focusedId);
    },
    { enabled: electronAvailable && !!focusedId }
  );

  // Agent launchers
  useKeybinding("agent.claude", () => handleLaunchAgent("claude"), { enabled: electronAvailable });
  useKeybinding("agent.gemini", () => handleLaunchAgent("gemini"), { enabled: electronAvailable });

  // Context injection
  useKeybinding("context.inject", () => handleInjectContextShortcut(), {
    enabled: electronAvailable,
  });

  // Panel toggles
  useKeybinding("panel.logs", () => toggleLogsPanel(), { enabled: electronAvailable });
  useKeybinding("panel.events", () => toggleEventInspector(), { enabled: electronAvailable });

  if (!isElectronAvailable()) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-canopy-bg">
        <div className="text-canopy-text/60 text-sm">
          Electron API not available - please run in Electron
        </div>
      </div>
    );
  }

  return (
    <>
      <AppLayout
        sidebarContent={<SidebarContent />}
        onLaunchAgent={handleLaunchAgent}
        onRefresh={handleRefresh}
        onSettings={handleSettings}
      >
        <TerminalGrid className="h-full w-full bg-canopy-bg" />
        <ProblemsPanel
          isOpen={isProblemsPanelOpen}
          onClose={() => setProblemsPanelOpen(false)}
          onRetry={handleErrorRetry}
        />
      </AppLayout>

      {/* Terminal palette overlay */}
      <TerminalPalette
        isOpen={terminalPalette.isOpen}
        query={terminalPalette.query}
        results={terminalPalette.results}
        selectedIndex={terminalPalette.selectedIndex}
        onQueryChange={terminalPalette.setQuery}
        onSelectPrevious={terminalPalette.selectPrevious}
        onSelectNext={terminalPalette.selectNext}
        onSelect={terminalPalette.selectTerminal}
        onClose={terminalPalette.close}
      />

      {/* Settings dialog */}
      <SettingsDialog isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
}

export default App;
