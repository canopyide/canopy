import { useCallback, useEffect, useRef, useState } from "react";
import { hydrateAppState } from "./utils/stateHydration";
import "@xterm/xterm/css/xterm.css";
import { FolderOpen } from "lucide-react";
import {
  isElectronAvailable,
  useAgentLauncher,
  useWorktrees,
  useContextInjection,
  useTerminalPalette,
  useTerminalConfig,
  useKeybinding,
  useProjectSettings,
} from "./hooks";
import { AppLayout } from "./components/Layout";
import { TerminalGrid } from "./components/Terminal";
import { WelcomeScreen } from "./components/Welcome/WelcomeScreen";
import { WorktreeCard } from "./components/Worktree";
import { NewWorktreeDialog } from "./components/Worktree/NewWorktreeDialog";
import { TerminalPalette } from "./components/TerminalPalette";
import { RecipeEditor } from "./components/TerminalRecipe/RecipeEditor";
import { SettingsDialog } from "./components/Settings";
import { HistoryPanel } from "./components/History";
import { Toaster } from "./components/ui/toaster";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DndProvider } from "./components/DragDrop";
import {
  useTerminalStore,
  useWorktreeSelectionStore,
  useErrorStore,
  useNotificationStore,
  useDiagnosticsStore,
  type RetryAction,
} from "./store";
import { useShallow } from "zustand/react/shallow";
import { useRecipeStore } from "./store/recipeStore";
import { setupTerminalStoreListeners } from "./store/terminalStore";
import type { WorktreeState } from "./types";
import {
  systemClient,
  copyTreeClient,
  appClient,
  projectClient,
  worktreeClient,
  errorsClient,
  devServerClient,
} from "@/clients";
import { formatBytes } from "@/lib/formatBytes";

function SidebarContent() {
  const { worktrees, isLoading, error, refresh } = useWorktrees();
  const { inject, isInjecting } = useContextInjection();
  const { settings: projectSettings } = useProjectSettings();
  const { activeWorktreeId, focusedWorktreeId, selectWorktree, setActiveWorktree } =
    useWorktreeSelectionStore(
      useShallow((state) => ({
        activeWorktreeId: state.activeWorktreeId,
        focusedWorktreeId: state.focusedWorktreeId,
        selectWorktree: state.selectWorktree,
        setActiveWorktree: state.setActiveWorktree,
      }))
    );
  const addError = useErrorStore((state) => state.addError);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const focusedTerminalId = useTerminalStore((state) => state.focusedId);

  const [isRecipeEditorOpen, setIsRecipeEditorOpen] = useState(false);
  const [recipeEditorWorktreeId, setRecipeEditorWorktreeId] = useState<string | undefined>(
    undefined
  );

  const [isNewWorktreeDialogOpen, setIsNewWorktreeDialogOpen] = useState(false);

  const [homeDir, setHomeDir] = useState<string | undefined>(undefined);

  useEffect(() => {
    systemClient.getHomeDir().then(setHomeDir).catch(console.error);
  }, []);

  useEffect(() => {
    if (worktrees.length > 0 && !activeWorktreeId) {
      setActiveWorktree(worktrees[0].id);
    }
  }, [worktrees, activeWorktreeId, setActiveWorktree]);

  const handleCopyTree = useCallback(
    async (worktree: WorktreeState) => {
      try {
        const isAvailable = await copyTreeClient.isAvailable();
        if (!isAvailable) {
          throw new Error(
            "CopyTree SDK not available. Please restart the application or check installation."
          );
        }

        const result = await copyTreeClient.generateAndCopyFile(worktree.id, {
          format: "xml",
        });

        if (result.error) {
          throw new Error(result.error);
        }

        console.log(`Copied ${result.fileCount} files as file reference`);
        const sizeStr = result.stats?.totalSize ? formatBytes(result.stats.totalSize) : "";
        addNotification({
          type: "success",
          title: "Context Copied",
          message: `Copied ${result.fileCount} files${sizeStr ? ` (${sizeStr})` : ""} to clipboard`,
          duration: 3000,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to copy context to clipboard";
        const details = e instanceof Error ? e.stack : undefined;

        let errorType: "config" | "process" | "filesystem" = "process";
        if (message.includes("not available") || message.includes("not installed")) {
          errorType = "config";
        } else if (
          message.includes("permission") ||
          message.includes("EACCES") ||
          message.includes("denied")
        ) {
          errorType = "filesystem";
        }

        addError({
          type: errorType,
          message: `Copy context failed: ${message}`,
          details,
          source: "WorktreeCard",
          context: {
            worktreeId: worktree.id,
          },
          isTransient: true,
          retryAction: "copytree",
          retryArgs: {
            worktreeId: worktree.id,
          },
        });

        console.error("Failed to copy context:", message);
      }
    },
    [addError, addNotification]
  );

  const handleOpenEditor = useCallback((worktree: WorktreeState) => {
    systemClient.openPath(worktree.path);
  }, []);

  const handleToggleServer = useCallback(
    (worktree: WorktreeState) => {
      const command = projectSettings?.devServer?.command;
      devServerClient.toggle(worktree.id, worktree.path, command);
    },
    [projectSettings]
  );

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

        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <FolderOpen className="w-12 h-12 text-gray-500 mb-3" aria-hidden="true" />

          <h3 className="text-canopy-text font-medium mb-2">No Worktrees Found</h3>

          <p className="text-sm text-gray-400 mb-4 max-w-xs">
            Open a Git repository with worktrees to get started. Use{" "}
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">File → Open Directory</kbd>
          </p>

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
            homeDir={homeDir}
            devServerSettings={projectSettings?.devServer}
          />
        ))}
      </div>

      <RecipeEditor
        worktreeId={recipeEditorWorktreeId}
        isOpen={isRecipeEditorOpen}
        onClose={handleCloseRecipeEditor}
      />

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

type AppView = "grid" | "welcome";

function App() {
  const { focusNext, focusPrevious, toggleMaximize, focusedId, addTerminal, reorderTerminals } =
    useTerminalStore(
      useShallow((state) => ({
        focusNext: state.focusNext,
        focusPrevious: state.focusPrevious,
        toggleMaximize: state.toggleMaximize,
        focusedId: state.focusedId,
        addTerminal: state.addTerminal,
        reorderTerminals: state.reorderTerminals,
      }))
    );
  const terminals = useTerminalStore(useShallow((state) => state.terminals));
  const { launchAgent, availability, agentSettings, refreshSettings } = useAgentLauncher();
  const { activeWorktreeId, setActiveWorktree } = useWorktreeSelectionStore(
    useShallow((state) => ({
      activeWorktreeId: state.activeWorktreeId,
      setActiveWorktree: state.setActiveWorktree,
    }))
  );
  const { inject, isInjecting } = useContextInjection();
  const loadRecipes = useRecipeStore((state) => state.loadRecipes);
  useTerminalConfig();

  const terminalPalette = useTerminalPalette();

  const openDiagnosticsDock = useDiagnosticsStore((state) => state.openDock);
  const toggleDiagnosticsDock = useDiagnosticsStore((state) => state.toggleDock);
  const removeError = useErrorStore((state) => state.removeError);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "troubleshooting">("general");

  const [isRefreshing, setIsRefreshing] = useState(false);

  const [currentView, setCurrentView] = useState<AppView>("welcome");
  const [isStateLoaded, setIsStateLoaded] = useState(false);

  const hasRestoredState = useRef(false);
  const isCtrlKPressed = useRef(false);
  const chordTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isElectronAvailable() || hasRestoredState.current) {
      return;
    }

    hasRestoredState.current = true;

    const restoreState = async () => {
      try {
        const appState = await appClient.getState();

        if (!appState) {
          console.warn("App state returned undefined, using defaults");
          setCurrentView("welcome");
          setIsStateLoaded(true);
          return;
        }

        const hasSeenWelcome = appState.hasSeenWelcome ?? false;
        setCurrentView(hasSeenWelcome ? "grid" : "welcome");

        await hydrateAppState({
          addTerminal,
          setActiveWorktree,
          loadRecipes,
          openDiagnosticsDock,
        });
      } catch (error) {
        console.error("Failed to restore app state:", error);
      } finally {
        setIsStateLoaded(true);
      }
    };

    restoreState();
  }, [addTerminal, setActiveWorktree, loadRecipes, openDiagnosticsDock]);

  useEffect(() => {
    if (!isElectronAvailable()) {
      return;
    }

    const handleProjectSwitch = async () => {
      console.log("[App] Received project-switched event, re-hydrating state...");
      try {
        await hydrateAppState({
          addTerminal,
          setActiveWorktree,
          loadRecipes,
          openDiagnosticsDock,
        });
        console.log("[App] State re-hydration complete");
      } catch (error) {
        console.error("[App] Failed to re-hydrate state after project switch:", error);
      }
    };

    window.addEventListener("project-switched", handleProjectSwitch);

    const cleanup = projectClient.onSwitch(() => {
      console.log("[App] Received PROJECT_ON_SWITCH from main process, re-hydrating...");
      window.dispatchEvent(new CustomEvent("project-switched"));
    });

    return () => {
      window.removeEventListener("project-switched", handleProjectSwitch);
      cleanup();
    };
  }, [addTerminal, setActiveWorktree, loadRecipes, openDiagnosticsDock]);

  const handleLaunchAgent = useCallback(
    async (type: "claude" | "gemini" | "codex" | "shell") => {
      await launchAgent(type);
    },
    [launchAgent]
  );

  const handleRefresh = useCallback(async () => {
    if (!isElectronAvailable()) {
      return;
    }

    if (isRefreshing) {
      return;
    }

    try {
      setIsRefreshing(true);
      await worktreeClient.refresh();
    } catch (error) {
      console.error("Failed to refresh worktrees:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  const handleSettings = useCallback(() => {
    setSettingsTab("general");
    setIsSettingsOpen(true);
  }, []);

  const handleShowWelcome = useCallback(() => {
    setCurrentView("welcome");
  }, []);

  const handleDismissWelcome = useCallback(() => {
    setCurrentView("grid");
  }, []);

  const handleInjectContextShortcut = useCallback(() => {
    if (activeWorktreeId && focusedId && !isInjecting) {
      inject(activeWorktreeId, focusedId);
    }
  }, [activeWorktreeId, focusedId, isInjecting, inject]);

  const handleErrorRetry = useCallback(
    async (errorId: string, action: RetryAction, args?: Record<string, unknown>) => {
      try {
        if (action === "injectContext") {
          const worktreeId = args?.worktreeId as string | undefined;
          const terminalId = args?.terminalId as string | undefined;
          const selectedPaths = args?.selectedPaths as string[] | undefined;

          if (!worktreeId || !terminalId) {
            console.error("Missing worktreeId or terminalId for injectContext retry");
            return;
          }

          await inject(worktreeId, terminalId, selectedPaths);

          removeError(errorId);
        } else {
          await errorsClient.retry(errorId, action, args);
          removeError(errorId);
        }
      } catch (error) {
        console.error("Error retry failed:", error);
      }
    },
    [inject, removeError]
  );

  const electronAvailable = isElectronAvailable();

  useKeybinding("terminal.palette", () => terminalPalette.toggle(), { enabled: electronAvailable });

  useKeybinding("terminal.focusNext", () => focusNext(), { enabled: electronAvailable });
  useKeybinding("terminal.focusPrevious", () => focusPrevious(), { enabled: electronAvailable });
  useKeybinding(
    "terminal.maximize",
    () => {
      if (focusedId) toggleMaximize(focusedId);
    },
    { enabled: electronAvailable && !!focusedId }
  );

  useKeybinding("agent.claude", () => handleLaunchAgent("claude"), { enabled: electronAvailable });
  useKeybinding("agent.gemini", () => handleLaunchAgent("gemini"), { enabled: electronAvailable });

  useKeybinding("context.inject", () => handleInjectContextShortcut(), {
    enabled: electronAvailable,
  });

  useKeybinding(
    "terminal.moveLeft",
    () => {
      if (!focusedId) return;
      const gridTerminals = terminals.filter(
        (t) => t.location === "grid" || t.location === undefined
      );
      const currentIndex = gridTerminals.findIndex((t) => t.id === focusedId);
      if (currentIndex > 0) {
        reorderTerminals(currentIndex, currentIndex - 1, "grid");
      }
    },
    { enabled: electronAvailable && !!focusedId }
  );
  useKeybinding(
    "terminal.moveRight",
    () => {
      if (!focusedId) return;
      const gridTerminals = terminals.filter(
        (t) => t.location === "grid" || t.location === undefined
      );
      const currentIndex = gridTerminals.findIndex((t) => t.id === focusedId);
      if (currentIndex >= 0 && currentIndex < gridTerminals.length - 1) {
        reorderTerminals(currentIndex, currentIndex + 1, "grid");
      }
    },
    { enabled: electronAvailable && !!focusedId }
  );

  useKeybinding("panel.logs", () => openDiagnosticsDock("logs"), { enabled: electronAvailable });
  useKeybinding("panel.events", () => openDiagnosticsDock("events"), {
    enabled: electronAvailable,
  });
  useKeybinding("panel.problems", () => openDiagnosticsDock("problems"), {
    enabled: electronAvailable,
  });
  useKeybinding("panel.diagnostics", () => toggleDiagnosticsDock(), { enabled: electronAvailable });

  useEffect(() => {
    if (!electronAvailable) return;
    const cleanup = setupTerminalStoreListeners();
    return cleanup;
  }, [electronAvailable]);

  useEffect(() => {
    if (!electronAvailable) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        isCtrlKPressed.current = true;
        if (chordTimeout.current) {
          clearTimeout(chordTimeout.current);
        }
        chordTimeout.current = setTimeout(() => {
          isCtrlKPressed.current = false;
        }, 1000);
        return;
      }

      if (isCtrlKPressed.current && (e.key === "z" || e.key === "Z") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        isCtrlKPressed.current = false;
        if (chordTimeout.current) {
          clearTimeout(chordTimeout.current);
          chordTimeout.current = null;
        }
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

  if (!isStateLoaded) {
    return <div className="h-screen w-screen bg-canopy-bg" />;
  }

  return (
    <ErrorBoundary variant="fullscreen" componentName="App">
      <DndProvider>
        <AppLayout
          sidebarContent={<SidebarContent />}
          historyContent={<HistoryPanel />}
          onLaunchAgent={handleLaunchAgent}
          onRefresh={handleRefresh}
          onSettings={handleSettings}
          onRetry={handleErrorRetry}
          isRefreshing={isRefreshing}
          onShowWelcome={handleShowWelcome}
          agentAvailability={availability}
          agentSettings={agentSettings}
        >
          {currentView === "welcome" ? (
            <WelcomeScreen onDismiss={handleDismissWelcome} />
          ) : (
            <TerminalGrid className="h-full w-full" />
          )}
        </AppLayout>
      </DndProvider>

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

      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        defaultTab={settingsTab}
        onSettingsChange={refreshSettings}
      />

      <Toaster />
    </ErrorBoundary>
  );
}

export default App;
