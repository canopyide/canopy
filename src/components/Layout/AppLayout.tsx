import { useState, useCallback, useEffect, type ReactNode } from "react";
import { Toolbar } from "./Toolbar";
import { Sidebar } from "./Sidebar";
import { LogsPanel } from "../Logs";
import { EventInspectorPanel } from "../EventInspector";
import { useFocusStore, useLogsStore, useEventStore } from "@/store";

interface AppLayoutProps {
  children?: ReactNode;
  sidebarContent?: ReactNode;
  historyContent?: ReactNode;
  onLaunchAgent?: (type: "claude" | "gemini" | "shell") => void;
  onRefresh?: () => void;
  onSettings?: () => void;
  /** Number of active errors to show in toolbar */
  errorCount?: number;
  /** Called when user clicks the problems button */
  onToggleProblems?: () => void;
  /** Whether worktree refresh is in progress */
  isRefreshing?: boolean;
}

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 350;

export function AppLayout({
  children,
  sidebarContent,
  historyContent,
  onLaunchAgent,
  onRefresh,
  onSettings,
  errorCount,
  onToggleProblems,
  isRefreshing,
}: AppLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  // Focus mode state
  const isFocusMode = useFocusStore((state) => state.isFocusMode);
  const toggleFocusMode = useFocusStore((state) => state.toggleFocusMode);
  const setFocusMode = useFocusStore((state) => state.setFocusMode);
  const savedPanelState = useFocusStore((state) => state.savedPanelState);

  // Panel states from stores
  const logsOpen = useLogsStore((state) => state.isOpen);
  const setLogsOpen = useLogsStore((state) => state.setOpen);
  const eventInspectorOpen = useEventStore((state) => state.isOpen);
  const setEventInspectorOpen = useEventStore((state) => state.setOpen);

  // Restore sidebar width and focus mode from persisted state
  useEffect(() => {
    const restoreState = async () => {
      try {
        const appState = await window.electron.app.getState();
        if (appState.sidebarWidth != null) {
          // Clamp to valid range
          const clampedWidth = Math.min(
            Math.max(appState.sidebarWidth, MIN_SIDEBAR_WIDTH),
            MAX_SIDEBAR_WIDTH
          );
          setSidebarWidth(clampedWidth);
        }
        // Restore focus mode state
        if (appState.focusMode) {
          // Restore the saved panel state from before focus mode was activated
          const savedState = appState.focusPanelState ?? {
            sidebarWidth: appState.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH,
            logsOpen: false,
            eventInspectorOpen: false,
          };
          setFocusMode(true, savedState);
        }
      } catch (error) {
        console.error("Failed to restore app state:", error);
      }
    };
    restoreState();
  }, [setFocusMode]);

  // Persist sidebar width changes (debounced via the resize handler)
  useEffect(() => {
    // Don't persist when in focus mode (sidebar is collapsed)
    if (isFocusMode) return;

    const persistSidebarWidth = async () => {
      try {
        await window.electron.app.setState({ sidebarWidth });
      } catch (error) {
        console.error("Failed to persist sidebar width:", error);
      }
    };

    // Only persist after initial mount (to avoid overwriting on restore)
    const timer = setTimeout(persistSidebarWidth, 300);
    return () => clearTimeout(timer);
  }, [sidebarWidth, isFocusMode]);

  // Persist focus mode state changes
  useEffect(() => {
    const persistFocusMode = async () => {
      try {
        await window.electron.app.setState({ focusMode: isFocusMode });
      } catch (error) {
        console.error("Failed to persist focus mode:", error);
      }
    };

    // Debounce to avoid rapid persistence during state transitions
    const timer = setTimeout(persistFocusMode, 100);
    return () => clearTimeout(timer);
  }, [isFocusMode]);

  // Handle focus mode toggle
  const handleToggleFocusMode = useCallback(async () => {
    if (isFocusMode) {
      // Exiting focus mode - restore panel states
      if (savedPanelState) {
        setSidebarWidth(savedPanelState.sidebarWidth);
        setLogsOpen(savedPanelState.logsOpen);
        setEventInspectorOpen(savedPanelState.eventInspectorOpen);
      }
      toggleFocusMode({ sidebarWidth, logsOpen, eventInspectorOpen });
      // Clear persisted panel state when exiting focus mode
      try {
        await window.electron.app.setState({ focusPanelState: undefined });
      } catch (error) {
        console.error("Failed to clear focus panel state:", error);
      }
    } else {
      // Entering focus mode - save current state and collapse panels
      const currentPanelState = { sidebarWidth, logsOpen, eventInspectorOpen };
      toggleFocusMode(currentPanelState);
      setLogsOpen(false);
      setEventInspectorOpen(false);
      // Persist panel state for restoration after restart
      try {
        await window.electron.app.setState({ focusPanelState: currentPanelState });
      } catch (error) {
        console.error("Failed to persist focus panel state:", error);
      }
    }
  }, [
    isFocusMode,
    savedPanelState,
    sidebarWidth,
    logsOpen,
    eventInspectorOpen,
    toggleFocusMode,
    setLogsOpen,
    setEventInspectorOpen,
  ]);

  // Listen for keyboard shortcut events (Cmd+K Z)
  useEffect(() => {
    const handleFocusModeToggle = () => {
      handleToggleFocusMode();
    };

    window.addEventListener("canopy:toggle-focus-mode", handleFocusModeToggle);
    return () => {
      window.removeEventListener("canopy:toggle-focus-mode", handleFocusModeToggle);
    };
  }, [handleToggleFocusMode]);

  const handleSidebarResize = useCallback((newWidth: number) => {
    const clampedWidth = Math.min(Math.max(newWidth, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
    setSidebarWidth(clampedWidth);
  }, []);

  const handleLaunchAgent = useCallback(
    (type: "claude" | "gemini" | "shell") => {
      onLaunchAgent?.(type);
    },
    [onLaunchAgent]
  );

  const handleRefresh = useCallback(() => {
    onRefresh?.();
  }, [onRefresh]);

  const handleSettings = useCallback(() => {
    onSettings?.();
  }, [onSettings]);

  // Effective sidebar width - 0 when in focus mode
  const effectiveSidebarWidth = isFocusMode ? 0 : sidebarWidth;

  return (
    <div className="h-screen flex flex-col bg-canopy-bg">
      <Toolbar
        onLaunchAgent={handleLaunchAgent}
        onRefresh={handleRefresh}
        onSettings={handleSettings}
        errorCount={errorCount}
        onToggleProblems={onToggleProblems}
        isFocusMode={isFocusMode}
        onToggleFocusMode={handleToggleFocusMode}
        isRefreshing={isRefreshing}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {!isFocusMode && (
            <Sidebar
              width={effectiveSidebarWidth}
              onResize={handleSidebarResize}
              historyContent={historyContent}
            >
              {sidebarContent}
            </Sidebar>
          )}
          <main className="flex-1 overflow-hidden bg-canopy-bg">{children}</main>
        </div>
        <LogsPanel />
        <EventInspectorPanel />
      </div>
    </div>
  );
}
