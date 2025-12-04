import { useState, useCallback, useEffect, type ReactNode } from "react";
import { Toolbar } from "./Toolbar";
import { Sidebar } from "./Sidebar";
import { TerminalDock } from "./TerminalDock";
import { DiagnosticsDock } from "../Diagnostics";
import { ErrorBoundary } from "../ErrorBoundary";
import { SidecarDock } from "../Sidecar";
import {
  useFocusStore,
  useDiagnosticsStore,
  useErrorStore,
  useSidecarStore,
  type PanelState,
} from "@/store";
import type { RetryAction } from "@/store";
import { appClient } from "@/clients";
import type { CliAvailability, AgentSettings } from "@shared/types";

interface AppLayoutProps {
  children?: ReactNode;
  sidebarContent?: ReactNode;
  historyContent?: ReactNode;
  onLaunchAgent?: (type: "claude" | "gemini" | "codex" | "shell") => void;
  onSettings?: () => void;
  onRetry?: (id: string, action: RetryAction, args?: Record<string, unknown>) => void;
  agentAvailability?: CliAvailability;
  agentSettings?: AgentSettings | null;
}

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 350;

export function AppLayout({
  children,
  sidebarContent,
  historyContent,
  onLaunchAgent,
  onSettings,
  onRetry,
  agentAvailability,
  agentSettings,
}: AppLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  const isFocusMode = useFocusStore((state) => state.isFocusMode);
  const toggleFocusMode = useFocusStore((state) => state.toggleFocusMode);
  const setFocusMode = useFocusStore((state) => state.setFocusMode);
  const savedPanelState = useFocusStore((state) => state.savedPanelState);

  const diagnosticsOpen = useDiagnosticsStore((state) => state.isOpen);
  const setDiagnosticsOpen = useDiagnosticsStore((state) => state.setOpen);
  const openDiagnosticsDock = useDiagnosticsStore((state) => state.openDock);

  const sidecarOpen = useSidecarStore((state) => state.isOpen);
  const sidecarLayoutMode = useSidecarStore((state) => state.layoutMode);
  const updateSidecarLayoutMode = useSidecarStore((state) => state.updateLayoutMode);

  const errorCount = useErrorStore((state) => state.errors.filter((e) => !e.dismissed).length);

  const handleToggleProblems = useCallback(() => {
    const dock = useDiagnosticsStore.getState();
    if (!dock.isOpen || dock.activeTab !== "problems") {
      openDiagnosticsDock("problems");
    } else {
      setDiagnosticsOpen(false);
    }
  }, [openDiagnosticsDock, setDiagnosticsOpen]);

  useEffect(() => {
    const restoreState = async () => {
      try {
        const appState = await appClient.getState();
        if (appState.sidebarWidth != null) {
          const clampedWidth = Math.min(
            Math.max(appState.sidebarWidth, MIN_SIDEBAR_WIDTH),
            MAX_SIDEBAR_WIDTH
          );
          setSidebarWidth(clampedWidth);
        }
        if (appState.focusMode) {
          // Restore the saved panel state from before focus mode was activated
          // Handle migration from legacy format (logsOpen/eventInspectorOpen) to new format (diagnosticsOpen)
          const legacyState = appState.focusPanelState as
            | PanelState
            | { sidebarWidth: number; logsOpen?: boolean; eventInspectorOpen?: boolean }
            | undefined;

          const savedState: PanelState = legacyState
            ? {
                sidebarWidth: legacyState.sidebarWidth,
                diagnosticsOpen:
                  "diagnosticsOpen" in legacyState
                    ? legacyState.diagnosticsOpen
                    : (legacyState.logsOpen ?? false) || (legacyState.eventInspectorOpen ?? false),
              }
            : {
                sidebarWidth: appState.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH,
                diagnosticsOpen: false,
              };
          setFocusMode(true, savedState);
        }
      } catch (error) {
        console.error("Failed to restore app state:", error);
      }
    };
    restoreState();
  }, [setFocusMode]);

  useEffect(() => {
    // Don't persist when in focus mode (sidebar is collapsed)
    if (isFocusMode) return;

    const persistSidebarWidth = async () => {
      try {
        await appClient.setState({ sidebarWidth });
      } catch (error) {
        console.error("Failed to persist sidebar width:", error);
      }
    };

    // Only persist after initial mount (to avoid overwriting on restore)
    const timer = setTimeout(persistSidebarWidth, 300);
    return () => clearTimeout(timer);
  }, [sidebarWidth, isFocusMode]);

  useEffect(() => {
    const persistFocusMode = async () => {
      try {
        await appClient.setState({ focusMode: isFocusMode });
      } catch (error) {
        console.error("Failed to persist focus mode:", error);
      }
    };

    // Debounce to avoid rapid persistence during state transitions
    const timer = setTimeout(persistFocusMode, 100);
    return () => clearTimeout(timer);
  }, [isFocusMode]);

  const handleToggleFocusMode = useCallback(async () => {
    if (isFocusMode) {
      if (savedPanelState) {
        setSidebarWidth((savedPanelState as PanelState).sidebarWidth);
        setDiagnosticsOpen((savedPanelState as PanelState).diagnosticsOpen);
      }
      toggleFocusMode({ sidebarWidth, diagnosticsOpen } as PanelState);
      try {
        await appClient.setState({ focusPanelState: undefined });
      } catch (error) {
        console.error("Failed to clear focus panel state:", error);
      }
    } else {
      const currentPanelState: PanelState = { sidebarWidth, diagnosticsOpen };
      toggleFocusMode(currentPanelState);
      setDiagnosticsOpen(false);
      // Persist panel state for restoration after restart
      try {
        await appClient.setState({ focusPanelState: currentPanelState });
      } catch (error) {
        console.error("Failed to persist focus panel state:", error);
      }
    }
  }, [
    isFocusMode,
    savedPanelState,
    sidebarWidth,
    diagnosticsOpen,
    toggleFocusMode,
    setDiagnosticsOpen,
  ]);

  useEffect(() => {
    const handleFocusModeToggle = () => {
      handleToggleFocusMode();
    };

    window.addEventListener("canopy:toggle-focus-mode", handleFocusModeToggle);
    return () => {
      window.removeEventListener("canopy:toggle-focus-mode", handleFocusModeToggle);
    };
  }, [handleToggleFocusMode]);

  useEffect(() => {
    const handleResize = () => {
      updateSidecarLayoutMode(window.innerWidth, isFocusMode ? 0 : sidebarWidth);
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [sidebarWidth, isFocusMode, updateSidecarLayoutMode]);

  const handleSidebarResize = useCallback((newWidth: number) => {
    const clampedWidth = Math.min(Math.max(newWidth, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
    setSidebarWidth(clampedWidth);
  }, []);

  const handleLaunchAgent = useCallback(
    (type: "claude" | "gemini" | "codex" | "shell") => {
      onLaunchAgent?.(type);
    },
    [onLaunchAgent]
  );

  const handleSettings = useCallback(() => {
    onSettings?.();
  }, [onSettings]);

  const effectiveSidebarWidth = isFocusMode ? 0 : sidebarWidth;

  return (
    <div
      className="h-screen flex flex-col bg-canopy-bg"
      style={{
        height: "100vh",
        width: "100vw",
        backgroundColor: "#18181b", // Fallback for bg-canopy-bg (Zinc-950)
        display: "flex",
        flexDirection: "column",
        color: "#e4e4e7", // Fallback for text-canopy-text (Zinc-200)
      }}
    >
      <Toolbar
        onLaunchAgent={handleLaunchAgent}
        onSettings={handleSettings}
        errorCount={errorCount}
        onToggleProblems={handleToggleProblems}
        isFocusMode={isFocusMode}
        onToggleFocusMode={handleToggleFocusMode}
        agentAvailability={agentAvailability}
        agentSettings={agentSettings}
      />
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <div
          className="flex-1 flex overflow-hidden"
          style={{ flex: 1, display: "flex", overflow: "hidden" }}
        >
          {!isFocusMode && (
            <ErrorBoundary variant="section" componentName="Sidebar">
              <Sidebar
                width={effectiveSidebarWidth}
                onResize={handleSidebarResize}
                historyContent={historyContent}
              >
                {sidebarContent}
              </Sidebar>
            </ErrorBoundary>
          )}
          <ErrorBoundary variant="section" componentName="MainContent">
            <main
              className="flex-1 flex flex-col overflow-hidden bg-canopy-bg relative"
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                backgroundColor: "#18181b", // Zinc-950
              }}
            >
              <div className="flex-1 overflow-hidden min-h-0">{children}</div>
              {/* Terminal Dock - appears at bottom only when terminals are docked */}
              <ErrorBoundary variant="section" componentName="TerminalDock">
                <TerminalDock />
              </ErrorBoundary>
              {/* Overlay mode - sidecar floats over content */}
              {sidecarOpen && sidecarLayoutMode === "overlay" && (
                <ErrorBoundary variant="section" componentName="SidecarDock">
                  <div className="absolute right-0 top-0 bottom-0 z-50 shadow-2xl border-l border-zinc-800">
                    <SidecarDock />
                  </div>
                </ErrorBoundary>
              )}
            </main>
          </ErrorBoundary>
          {/* Push mode - sidecar is part of flex layout */}
          {sidecarOpen && sidecarLayoutMode === "push" && (
            <ErrorBoundary variant="section" componentName="SidecarDock">
              <div className="border-l border-zinc-800 flex-shrink-0">
                <SidecarDock />
              </div>
            </ErrorBoundary>
          )}
        </div>
        {/* Unified diagnostics dock replaces LogsPanel, EventInspectorPanel, and ProblemsPanel */}
        <ErrorBoundary variant="section" componentName="DiagnosticsDock">
          <DiagnosticsDock onRetry={onRetry} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
