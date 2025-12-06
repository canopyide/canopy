import { useCallback, useEffect, useRef, useState } from "react";
import { hydrateAppState } from "./utils/stateHydration";
import { semanticAnalysisService } from "./services/SemanticAnalysisService";
import "@xterm/xterm/css/xterm.css";
import { FolderOpen } from "lucide-react";
import {
  isElectronAvailable,
  useAgentLauncher,
  useWorktrees,
  useTerminalPalette,
  useTerminalConfig,
  useKeybinding,
  useProjectSettings,
  useLinkDiscovery,
  useGridNavigation,
  type AgentType,
} from "./hooks";
import { AppLayout } from "./components/Layout";
import { TerminalGrid } from "./components/Terminal";
import { WorktreeCard } from "./components/Worktree";
import { NewWorktreeDialog } from "./components/Worktree/NewWorktreeDialog";
import { TerminalPalette } from "./components/TerminalPalette";
import { RecipeEditor } from "./components/TerminalRecipe/RecipeEditor";
import { SettingsDialog } from "./components/Settings";
import { ShortcutReferenceDialog } from "./components/KeyboardShortcuts";
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
  projectClient,
  errorsClient,
  devServerClient,
  worktreeClient,
  githubClient,
} from "@/clients";
import { formatBytes } from "@/lib/formatBytes";

function SidebarContent() {
  const { worktrees, isLoading, error, refresh } = useWorktrees();
  const { settings: projectSettings } = useProjectSettings();
  const { launchAgent, availability, agentSettings } = useAgentLauncher();
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

  const handleCreateRecipe = useCallback((worktreeId: string) => {
    setRecipeEditorWorktreeId(worktreeId);
    setIsRecipeEditorOpen(true);
  }, []);

  const handleCloseRecipeEditor = useCallback(() => {
    setIsRecipeEditorOpen(false);
    setRecipeEditorWorktreeId(undefined);
  }, []);

  const handleOpenIssue = useCallback((worktree: WorktreeState) => {
    if (worktree.issueNumber) {
      githubClient.openIssue(worktree.path, worktree.issueNumber);
    }
  }, []);

  const handleOpenPR = useCallback((worktree: WorktreeState) => {
    if (worktree.prUrl) {
      githubClient.openPR(worktree.prUrl);
    }
  }, []);

  const handleLaunchAgentForWorktree = useCallback(
    (worktreeId: string, type: AgentType) => {
      launchAgent(type, { worktreeId, location: "grid" });
    },
    [launchAgent]
  );

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
          className="text-xs px-2 py-1 border border-canopy-border rounded hover:bg-canopy-border text-canopy-text"
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
          <FolderOpen className="w-12 h-12 text-canopy-text/60 mb-3" aria-hidden="true" />

          <h3 className="text-canopy-text font-medium mb-2">No Worktrees Found</h3>

          <p className="text-sm text-canopy-text/60 mb-4 max-w-xs">
            Open a Git repository with worktrees to get started. Use{" "}
            <kbd className="px-1.5 py-0.5 bg-canopy-border rounded text-xs">
              File → Open Directory
            </kbd>
          </p>

          <div className="text-xs text-canopy-text/60 text-left w-full max-w-xs">
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
    <div className="flex flex-col h-full">
      {/* Header Section */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#18181b] shrink-0">
        <h2 className="text-canopy-text font-semibold text-sm tracking-wide">Worktrees</h2>
        <button
          onClick={() => setIsNewWorktreeDialogOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 text-canopy-text/60 hover:text-canopy-text hover:bg-white/5 rounded transition-colors"
          title="Create new worktree"
        >
          <span className="text-[10px]">+</span> New
        </button>
      </div>

      {/* List Section - Flat list with borders */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col">
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
              onOpenIssue={worktree.issueNumber ? () => handleOpenIssue(worktree) : undefined}
              onOpenPR={worktree.prUrl ? () => handleOpenPR(worktree) : undefined}
              onCreateRecipe={() => handleCreateRecipe(worktree.id)}
              onLaunchAgent={(type) => handleLaunchAgentForWorktree(worktree.id, type)}
              agentAvailability={availability}
              agentSettings={agentSettings}
              homeDir={homeDir}
              devServerSettings={projectSettings?.devServer}
            />
          ))}
        </div>
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

function App() {
  const {
    focusNext,
    focusPrevious,
    focusDirection,
    focusByIndex,
    focusDockDirection,
    toggleMaximize,
    focusedId,
    addTerminal,
    reorderTerminals,
    moveTerminalToDock,
    moveTerminalToGrid,
    trashTerminal,
    bulkTrashAll,
    bulkRestartAll,
    bulkMoveToDock,
    bulkMoveToGrid,
  } = useTerminalStore(
    useShallow((state) => ({
      focusNext: state.focusNext,
      focusPrevious: state.focusPrevious,
      focusDirection: state.focusDirection,
      focusByIndex: state.focusByIndex,
      focusDockDirection: state.focusDockDirection,
      toggleMaximize: state.toggleMaximize,
      focusedId: state.focusedId,
      addTerminal: state.addTerminal,
      reorderTerminals: state.reorderTerminals,
      moveTerminalToDock: state.moveTerminalToDock,
      moveTerminalToGrid: state.moveTerminalToGrid,
      trashTerminal: state.trashTerminal,
      bulkTrashAll: state.bulkTrashAll,
      bulkRestartAll: state.bulkRestartAll,
      bulkMoveToDock: state.bulkMoveToDock,
      bulkMoveToGrid: state.bulkMoveToGrid,
    }))
  );
  const terminals = useTerminalStore(useShallow((state) => state.terminals));
  const { launchAgent, availability, agentSettings, refreshSettings } = useAgentLauncher();
  const setActiveWorktree = useWorktreeSelectionStore((state) => state.setActiveWorktree);
  const loadRecipes = useRecipeStore((state) => state.loadRecipes);
  useTerminalConfig();
  useLinkDiscovery();

  // Grid navigation hook for directional terminal switching
  const { findNearest, findByIndex, findDockByIndex, getCurrentLocation } = useGridNavigation();

  const terminalPalette = useTerminalPalette();

  const openDiagnosticsDock = useDiagnosticsStore((state) => state.openDock);
  const toggleDiagnosticsDock = useDiagnosticsStore((state) => state.toggleDock);
  const removeError = useErrorStore((state) => state.removeError);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "troubleshooting">("general");
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isStateLoaded, setIsStateLoaded] = useState(false);

  const hasRestoredState = useRef(false);

  useEffect(() => {
    if (!isElectronAvailable() || hasRestoredState.current) {
      return;
    }

    hasRestoredState.current = true;

    const restoreState = async () => {
      try {
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

  const handleSettings = useCallback(() => {
    setSettingsTab("general");
    setIsSettingsOpen(true);
  }, []);

  const handleErrorRetry = useCallback(
    async (errorId: string, action: RetryAction, args?: Record<string, unknown>) => {
      try {
        await errorsClient.retry(errorId, action, args);
        removeError(errorId);
      } catch (error) {
        console.error("Error retry failed:", error);
      }
    },
    [removeError]
  );

  const electronAvailable = isElectronAvailable();

  useKeybinding("terminal.palette", () => terminalPalette.toggle(), { enabled: electronAvailable });

  useKeybinding(
    "terminal.close",
    () => {
      if (focusedId) {
        useTerminalStore.getState().trashTerminal(focusedId);
      }
    },
    { enabled: electronAvailable }
  );

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
  useKeybinding("agent.codex", () => handleLaunchAgent("codex"), { enabled: electronAvailable });
  useKeybinding("agent.shell", () => handleLaunchAgent("shell"), { enabled: electronAvailable });

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

  // Terminal dock operations
  useKeybinding(
    "terminal.minimize",
    () => {
      if (focusedId) moveTerminalToDock(focusedId);
    },
    { enabled: electronAvailable && !!focusedId }
  );
  useKeybinding(
    "terminal.restore",
    () => {
      const dockTerminals = terminals.filter((t) => t.location === "dock");
      if (dockTerminals.length > 0) {
        moveTerminalToGrid(dockTerminals[0].id);
      }
    },
    { enabled: electronAvailable }
  );

  // Terminal bulk operations
  useKeybinding("terminal.closeAll", () => bulkTrashAll(), { enabled: electronAvailable });
  useKeybinding(
    "terminal.killAll",
    () => {
      terminals.forEach((t) => {
        if (t.location !== "trash") trashTerminal(t.id);
      });
    },
    { enabled: electronAvailable }
  );
  useKeybinding("terminal.restartAll", () => bulkRestartAll(), { enabled: electronAvailable });
  useKeybinding("terminal.minimizeAll", () => bulkMoveToDock(), { enabled: electronAvailable });
  useKeybinding("terminal.restoreAll", () => bulkMoveToGrid(), { enabled: electronAvailable });

  // Panel management
  useKeybinding("panel.diagnosticsLogs", () => openDiagnosticsDock("logs"), {
    enabled: electronAvailable,
  });
  useKeybinding("panel.diagnosticsEvents", () => openDiagnosticsDock("events"), {
    enabled: electronAvailable,
  });
  useKeybinding("panel.diagnosticsMessages", () => openDiagnosticsDock("problems"), {
    enabled: electronAvailable,
  });
  useKeybinding("panel.toggleDiagnostics", () => toggleDiagnosticsDock(), {
    enabled: electronAvailable,
  });
  useKeybinding(
    "panel.toggleDock",
    () => {
      window.dispatchEvent(new CustomEvent("canopy:toggle-terminal-dock"));
    },
    { enabled: electronAvailable }
  );
  useKeybinding(
    "panel.toggleSidecar",
    () => {
      window.dispatchEvent(new CustomEvent("canopy:toggle-sidecar"));
    },
    { enabled: electronAvailable }
  );

  // Navigation
  useKeybinding(
    "nav.toggleSidebar",
    () => {
      window.dispatchEvent(new CustomEvent("canopy:toggle-focus-mode"));
    },
    { enabled: electronAvailable }
  );

  // Worktree navigation
  const { worktrees } = useWorktrees();
  const { selectWorktree, activeWorktreeId } = useWorktreeSelectionStore(
    useShallow((state) => ({
      selectWorktree: state.selectWorktree,
      activeWorktreeId: state.activeWorktreeId,
    }))
  );

  useKeybinding("worktree.switch1", () => worktrees[0] && selectWorktree(worktrees[0].id), {
    enabled: electronAvailable && worktrees.length >= 1,
  });
  useKeybinding("worktree.switch2", () => worktrees[1] && selectWorktree(worktrees[1].id), {
    enabled: electronAvailable && worktrees.length >= 2,
  });
  useKeybinding("worktree.switch3", () => worktrees[2] && selectWorktree(worktrees[2].id), {
    enabled: electronAvailable && worktrees.length >= 3,
  });
  useKeybinding("worktree.switch4", () => worktrees[3] && selectWorktree(worktrees[3].id), {
    enabled: electronAvailable && worktrees.length >= 4,
  });
  useKeybinding("worktree.switch5", () => worktrees[4] && selectWorktree(worktrees[4].id), {
    enabled: electronAvailable && worktrees.length >= 5,
  });
  useKeybinding("worktree.switch6", () => worktrees[5] && selectWorktree(worktrees[5].id), {
    enabled: electronAvailable && worktrees.length >= 6,
  });
  useKeybinding("worktree.switch7", () => worktrees[6] && selectWorktree(worktrees[6].id), {
    enabled: electronAvailable && worktrees.length >= 7,
  });
  useKeybinding("worktree.switch8", () => worktrees[7] && selectWorktree(worktrees[7].id), {
    enabled: electronAvailable && worktrees.length >= 8,
  });
  useKeybinding("worktree.switch9", () => worktrees[8] && selectWorktree(worktrees[8].id), {
    enabled: electronAvailable && worktrees.length >= 9,
  });

  useKeybinding(
    "worktree.next",
    () => {
      if (worktrees.length === 0) return;
      const currentIndex = activeWorktreeId
        ? worktrees.findIndex((w) => w.id === activeWorktreeId)
        : -1;
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % worktrees.length;
      selectWorktree(worktrees[nextIndex].id);
    },
    { enabled: electronAvailable && worktrees.length > 1 }
  );

  useKeybinding(
    "worktree.previous",
    () => {
      if (worktrees.length === 0) return;
      const currentIndex = activeWorktreeId
        ? worktrees.findIndex((w) => w.id === activeWorktreeId)
        : -1;
      const prevIndex =
        currentIndex === -1 ? 0 : (currentIndex - 1 + worktrees.length) % worktrees.length;
      selectWorktree(worktrees[prevIndex].id);
    },
    { enabled: electronAvailable && worktrees.length > 1 }
  );

  // Help and settings
  useKeybinding("help.shortcuts", () => setIsShortcutsOpen(true), { enabled: electronAvailable });
  useKeybinding("help.shortcutsAlt", () => setIsShortcutsOpen(true), {
    enabled: electronAvailable,
  });
  useKeybinding("app.settings", () => handleSettings(), { enabled: electronAvailable });

  // Directional terminal navigation (Option+Arrow keys)
  // Skip when typing in terminal to avoid stealing shell word-jump behavior
  const isTypingInTerminal = useCallback(() => {
    const activeElement = document.activeElement;
    return activeElement?.classList.contains("xterm-helper-textarea");
  }, []);

  useKeybinding(
    "terminal.focusUp",
    () => {
      if (isTypingInTerminal()) return;
      const location = getCurrentLocation();
      if (location === "grid") {
        focusDirection("up", findNearest);
      }
    },
    { enabled: electronAvailable && !!focusedId }
  );
  useKeybinding(
    "terminal.focusDown",
    () => {
      if (isTypingInTerminal()) return;
      const location = getCurrentLocation();
      if (location === "grid") {
        focusDirection("down", findNearest);
      }
    },
    { enabled: electronAvailable && !!focusedId }
  );
  useKeybinding(
    "terminal.focusLeft",
    () => {
      if (isTypingInTerminal()) return;
      const location = getCurrentLocation();
      if (location === "grid") {
        focusDirection("left", findNearest);
      } else if (location === "dock") {
        focusDockDirection("left", findDockByIndex);
      }
    },
    { enabled: electronAvailable && !!focusedId }
  );
  useKeybinding(
    "terminal.focusRight",
    () => {
      if (isTypingInTerminal()) return;
      const location = getCurrentLocation();
      if (location === "grid") {
        focusDirection("right", findNearest);
      } else if (location === "dock") {
        focusDockDirection("right", findDockByIndex);
      }
    },
    { enabled: electronAvailable && !!focusedId }
  );

  // Index-based terminal navigation (Option+1-9)
  useKeybinding("terminal.focusIndex1", () => focusByIndex(1, findByIndex), {
    enabled: electronAvailable,
  });
  useKeybinding("terminal.focusIndex2", () => focusByIndex(2, findByIndex), {
    enabled: electronAvailable,
  });
  useKeybinding("terminal.focusIndex3", () => focusByIndex(3, findByIndex), {
    enabled: electronAvailable,
  });
  useKeybinding("terminal.focusIndex4", () => focusByIndex(4, findByIndex), {
    enabled: electronAvailable,
  });
  useKeybinding("terminal.focusIndex5", () => focusByIndex(5, findByIndex), {
    enabled: electronAvailable,
  });
  useKeybinding("terminal.focusIndex6", () => focusByIndex(6, findByIndex), {
    enabled: electronAvailable,
  });
  useKeybinding("terminal.focusIndex7", () => focusByIndex(7, findByIndex), {
    enabled: electronAvailable,
  });
  useKeybinding("terminal.focusIndex8", () => focusByIndex(8, findByIndex), {
    enabled: electronAvailable,
  });
  useKeybinding("terminal.focusIndex9", () => focusByIndex(9, findByIndex), {
    enabled: electronAvailable,
  });

  useEffect(() => {
    if (!electronAvailable) return;
    const cleanup = setupTerminalStoreListeners();
    return cleanup;
  }, [electronAvailable]);

  // Initialize semantic analysis Web Worker
  useEffect(() => {
    if (!electronAvailable) return;

    semanticAnalysisService.initialize().catch((error) => {
      console.warn("[App] Failed to initialize semantic analysis service:", error);
    });

    return () => {
      semanticAnalysisService.dispose();
    };
  }, [electronAvailable]);

  // Handle system wake events for renderer-side re-hydration
  useEffect(() => {
    if (!electronAvailable) return;

    const cleanup = systemClient.onWake(({ sleepDuration }) => {
      console.log(`[App] System woke after ${Math.round(sleepDuration / 1000)}s sleep`);

      // Dispatch event to notify terminal components to refresh WebGL contexts
      window.dispatchEvent(new CustomEvent("canopy:system-wake"));

      // If sleep was long (>5min), refresh worktree status
      const LONG_SLEEP_THRESHOLD_MS = 5 * 60 * 1000;
      if (sleepDuration > LONG_SLEEP_THRESHOLD_MS) {
        console.log("[App] Long sleep detected, refreshing worktree status");
        worktreeClient.refresh().catch((err) => {
          console.warn("[App] Failed to refresh worktrees after wake:", err);
        });
      }
    });

    return cleanup;
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
          onLaunchAgent={handleLaunchAgent}
          onSettings={handleSettings}
          onRetry={handleErrorRetry}
          agentAvailability={availability}
          agentSettings={agentSettings}
        >
          <TerminalGrid className="h-full w-full" onLaunchAgent={handleLaunchAgent} />
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

      <ShortcutReferenceDialog isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />

      <Toaster />
    </ErrorBoundary>
  );
}

export default App;
