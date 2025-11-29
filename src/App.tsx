import { useCallback, useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import {
  isElectronAvailable,
  useAgentLauncher,
  useWorktrees,
  useContextInjection,
  useTerminalPalette,
} from "./hooks";
import { AppLayout } from "./components/Layout";
import { TerminalGrid } from "./components/Terminal";
import { WorktreeCard } from "./components/Worktree";
import { ProblemsPanel } from "./components/Errors";
import { TerminalPalette } from "./components/TerminalPalette";
import { RecipeEditor } from "./components/TerminalRecipe/RecipeEditor";
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

  return (
    <div className="p-4">
      <h2 className="text-canopy-text font-semibold text-sm mb-4">Worktrees</h2>
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

  // Track if state has been restored (prevent StrictMode double-execution)
  const hasRestoredState = useRef(false);

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
    // TODO: Implement settings modal
    console.log("Open settings");
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

  // Keyboard shortcuts for grid navigation
  useEffect(() => {
    if (!isElectronAvailable()) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+T: Open terminal palette (handle before input guard so it works when palette input is focused)
      if ((e.metaKey || e.ctrlKey) && e.key === "t" && !e.shiftKey) {
        e.preventDefault();
        terminalPalette.toggle();
        return;
      }

      // Don't intercept shortcuts if user is typing in an input/textarea or terminal
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // Skip if typing in input field
      if (isInput) return;

      // Skip if focus is inside a terminal (xterm renders as a div with class 'xterm')
      // This allows terminal shortcuts and shell hotkeys to work normally
      const isInTerminal = target.closest(".xterm") !== null;
      if (isInTerminal) return;

      // Ctrl+Tab: Focus next terminal
      if (e.ctrlKey && e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        focusNext();
      }
      // Ctrl+Shift+Tab: Focus previous terminal
      else if (e.ctrlKey && e.shiftKey && e.key === "Tab") {
        e.preventDefault();
        focusPrevious();
      }
      // Ctrl+Shift+F: Toggle maximize
      else if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        if (focusedId) {
          toggleMaximize(focusedId);
        }
      }
      // Ctrl+Shift+C: Launch Claude (use 'C' not 'c' to detect shift properly)
      else if (e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "c")) {
        e.preventDefault();
        handleLaunchAgent("claude");
      }
      // Ctrl+Shift+G: Launch Gemini
      else if (e.ctrlKey && e.shiftKey && (e.key === "G" || e.key === "g")) {
        e.preventDefault();
        handleLaunchAgent("gemini");
      }
      // Ctrl+Shift+I: Inject context (active worktree -> focused terminal)
      else if (e.ctrlKey && e.shiftKey && e.key === "I") {
        e.preventDefault();
        handleInjectContextShortcut();
      }
      // Ctrl+Shift+L: Toggle logs panel
      else if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        toggleLogsPanel();
      }
      // Ctrl+Shift+E: Toggle event inspector
      else if (e.ctrlKey && e.shiftKey && (e.key === "E" || e.key === "e")) {
        e.preventDefault();
        toggleEventInspector();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    focusNext,
    focusPrevious,
    toggleMaximize,
    focusedId,
    handleLaunchAgent,
    handleInjectContextShortcut,
    toggleLogsPanel,
    toggleEventInspector,
    terminalPalette,
  ]);

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
    </>
  );
}

export default App;
