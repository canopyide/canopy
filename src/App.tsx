import { useCallback, useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { FolderOpen } from "lucide-react";
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
import { HistoryPanel } from "./components/History";
import {
  useTerminalStore,
  useWorktreeSelectionStore,
  useLogsStore,
  useErrorStore,
  useEventStore,
  type RetryAction,
} from "./store";
import { useRecipeStore } from "./store/recipeStore";
import { cleanupTerminalStoreListeners } from "./store/terminalStore";
import type { WorktreeState } from "./types";

interface SidebarContentProps {
  onOpenSettings: (tab?: "ai" | "general" | "troubleshooting") => void;
}

function SidebarContent({ onOpenSettings }: SidebarContentProps) {
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
        <div className="text-[var(--color-status-error)] text-sm mb-2">{error}</div>
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

        {/* Empty State */}
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <FolderOpen className="w-12 h-12 text-gray-500 mb-3" aria-hidden="true" />

          <h3 className="text-canopy-text font-medium mb-2">No Worktrees Found</h3>

          <p className="text-sm text-gray-400 mb-4 max-w-xs">
            Open a Git repository with worktrees to get started. Use{" "}
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">File → Open Directory</kbd>
          </p>

          {/* Quick Start */}
          <div className="text-xs text-gray-500 text-left w-full max-w-xs">
            <div className="font-medium mb-1">Quick Start:</div>
            <ol className="space-y-1 list-decimal list-inside">
              <li>Open a repository</li>
              <li>Launch Claude or Gemini</li>
              <li>Inject context to AI agent</li>
            </ol>
          </div>
        </div>
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
            onOpenSettings={onOpenSettings}
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
  const { focusNext, focusPrevious, toggleMaximize, focusedId, addTerminal } = useTerminalStore();
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
  const [settingsTab, setSettingsTab] = useState<"general" | "ai" | "troubleshooting">("general");

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Track if state has been restored (prevent StrictMode double-execution)
  const hasRestoredState = useRef(false);

  // Track Cmd/Ctrl+K chord state for focus mode shortcut (Cmd+K Z)
  const isCtrlKPressed = useRef(false);
  const chordTimeout = useRef<NodeJS.Timeout | null>(null);

  // Queue processing is handled in terminalStore.ts via the agent state subscription
  // No need for duplicate subscription here - the store already listens to state changes

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

  const handleRefresh = useCallback(async () => {
    // Guard against non-Electron environments
    if (!isElectronAvailable()) {
      return;
    }

    // Prevent multiple simultaneous refreshes
    if (isRefreshing) {
      return;
    }

    try {
      setIsRefreshing(true);
      await window.electron.worktree.refresh();
    } catch (error) {
      // Log error - the IPC layer and useWorktrees hook will handle displaying errors
      console.error("Failed to refresh worktrees:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  const handleSettings = useCallback(() => {
    setSettingsTab("general"); // Always open to General tab when clicking toolbar button
    setIsSettingsOpen(true);
  }, []);

  const handleOpenSettings = useCallback((tab?: "ai" | "general" | "troubleshooting") => {
    if (tab) {
      setSettingsTab(tab);
    }
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
      try {
        // Handle injectContext retry locally
        if (action === "injectContext") {
          const worktreeId = args?.worktreeId as string | undefined;
          const terminalId = args?.terminalId as string | undefined;
          const selectedPaths = args?.selectedPaths as string[] | undefined;

          if (!worktreeId || !terminalId) {
            console.error("Missing worktreeId or terminalId for injectContext retry");
            return;
          }

          // Retry the injection
          await inject(worktreeId, terminalId, selectedPaths);

          // Explicitly remove error on success (hook instance may differ)
          removeError(errorId);
        } else if (window.electron?.errors?.retry) {
          // For other actions, delegate to the main process
          await window.electron.errors.retry(errorId, action, args);
          removeError(errorId);
        }
      } catch (error) {
        console.error("Error retry failed:", error);
      }
    },
    [inject, removeError]
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

  // Cleanup terminal store listeners on unmount
  useEffect(() => {
    return () => {
      cleanupTerminalStoreListeners();
    };
  }, []);

  // Focus Mode Chord (Cmd+K Z) - Manual listener because it's a chord
  useEffect(() => {
    if (!electronAvailable) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Cmd/Ctrl+K chord for focus mode (Cmd+K Z)
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        // Start chord sequence - set flag and timeout
        isCtrlKPressed.current = true;
        if (chordTimeout.current) {
          clearTimeout(chordTimeout.current);
        }
        // Reset chord after 1 second if no follow-up key
        chordTimeout.current = setTimeout(() => {
          isCtrlKPressed.current = false;
        }, 1000);
        return;
      }

      // Check for Z key after Cmd+K (focus mode toggle)
      if (isCtrlKPressed.current && (e.key === "z" || e.key === "Z") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        isCtrlKPressed.current = false;
        if (chordTimeout.current) {
          clearTimeout(chordTimeout.current);
          chordTimeout.current = null;
        }
        // Dispatch custom event for focus mode toggle
        window.dispatchEvent(new CustomEvent("canopy:toggle-focus-mode"));
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (chordTimeout.current) {
        clearTimeout(chordTimeout.current);
      }
    };
  }, [electronAvailable]);

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
        sidebarContent={<SidebarContent onOpenSettings={handleOpenSettings} />}
        historyContent={<HistoryPanel />}
        onLaunchAgent={handleLaunchAgent}
        onRefresh={handleRefresh}
        onSettings={handleSettings}
        isRefreshing={isRefreshing}
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
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        defaultTab={settingsTab}
      />
    </>
  );
}

export default App;
