/**
 * Troubleshooting Tab Component
 *
 * Provides developer mode settings, log management, and debugging features.
 * Includes master toggle for developer mode with child feature controls.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Trash2, Bug } from "lucide-react";
import { cn } from "@/lib/utils";
import { appClient, logsClient } from "@/clients";
import { getStateDebugEnabled, enableStateDebug, disableStateDebug } from "@/components/Terminal";
import type { AppState } from "@shared/types";

interface TroubleshootingTabProps {
  openLogs: () => void;
  clearLogs: () => void;
}

export function TroubleshootingTab({ openLogs, clearLogs }: TroubleshootingTabProps) {
  const [developerMode, setDeveloperMode] = useState(false);
  const [showStateDebug, setShowStateDebug] = useState(() => getStateDebugEnabled());
  const [autoOpenDiagnostics, setAutoOpenDiagnostics] = useState(false);
  const [focusEventsTab, setFocusEventsTab] = useState(false);

  // Load developer mode settings on mount
  useEffect(() => {
    appClient.getState().then((appState) => {
      if (appState?.developerMode) {
        // Use persisted developer mode settings
        setDeveloperMode(appState.developerMode.enabled);
        setShowStateDebug(appState.developerMode.showStateDebug);
        setAutoOpenDiagnostics(appState.developerMode.autoOpenDiagnostics);
        setFocusEventsTab(appState.developerMode.focusEventsTab);
        // Sync localStorage with persisted state
        if (appState.developerMode.showStateDebug) {
          enableStateDebug();
        } else {
          disableStateDebug();
        }
      } else {
        // No persisted settings - sync from localStorage
        setShowStateDebug(getStateDebugEnabled());
      }
    });
  }, []);

  // Save developer mode settings to app state
  const saveDeveloperModeSettings = useCallback(
    async (settings: NonNullable<AppState["developerMode"]>) => {
      try {
        await appClient.setState({ developerMode: settings });
      } catch (error) {
        console.error("Failed to save developer mode settings:", error);
      }
    },
    []
  );

  // Handle master developer mode toggle
  const handleToggleDeveloperMode = useCallback(() => {
    const newEnabled = !developerMode;
    setDeveloperMode(newEnabled);

    // If disabling, turn off all child features
    if (!newEnabled) {
      setShowStateDebug(false);
      disableStateDebug();
      // Dispatch event to notify other components that debug mode is off
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("canopy:debug-toggle", { detail: { enabled: false } })
        );
      }
      setAutoOpenDiagnostics(false);
      setFocusEventsTab(false);
      saveDeveloperModeSettings({
        enabled: false,
        showStateDebug: false,
        autoOpenDiagnostics: false,
        focusEventsTab: false,
      });
    } else {
      saveDeveloperModeSettings({
        enabled: true,
        showStateDebug,
        autoOpenDiagnostics,
        focusEventsTab,
      });
    }
  }, [
    developerMode,
    showStateDebug,
    autoOpenDiagnostics,
    focusEventsTab,
    saveDeveloperModeSettings,
  ]);

  // Handle state debug toggle
  const handleToggleStateDebug = useCallback(() => {
    const newState = !showStateDebug;
    setShowStateDebug(newState);
    if (newState) {
      enableStateDebug();
    } else {
      disableStateDebug();
    }
    // Dispatch event to notify other components (e.g., DebugInfo)
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("canopy:debug-toggle", { detail: { enabled: newState } })
      );
    }
    saveDeveloperModeSettings({
      enabled: developerMode,
      showStateDebug: newState,
      autoOpenDiagnostics,
      focusEventsTab,
    });
  }, [
    showStateDebug,
    developerMode,
    autoOpenDiagnostics,
    focusEventsTab,
    saveDeveloperModeSettings,
  ]);

  // Handle auto-open diagnostics toggle
  const handleToggleAutoOpenDiagnostics = useCallback(() => {
    const newState = !autoOpenDiagnostics;
    setAutoOpenDiagnostics(newState);
    // If disabling auto-open, also disable focus events tab
    if (!newState) {
      setFocusEventsTab(false);
      saveDeveloperModeSettings({
        enabled: developerMode,
        showStateDebug,
        autoOpenDiagnostics: false,
        focusEventsTab: false,
      });
    } else {
      saveDeveloperModeSettings({
        enabled: developerMode,
        showStateDebug,
        autoOpenDiagnostics: true,
        focusEventsTab,
      });
    }
  }, [
    autoOpenDiagnostics,
    developerMode,
    showStateDebug,
    focusEventsTab,
    saveDeveloperModeSettings,
  ]);

  // Handle focus events tab toggle
  const handleToggleFocusEventsTab = useCallback(() => {
    const newState = !focusEventsTab;
    setFocusEventsTab(newState);
    saveDeveloperModeSettings({
      enabled: developerMode,
      showStateDebug,
      autoOpenDiagnostics,
      focusEventsTab: newState,
    });
  }, [
    focusEventsTab,
    developerMode,
    showStateDebug,
    autoOpenDiagnostics,
    saveDeveloperModeSettings,
  ]);

  const handleClearLogs = async () => {
    try {
      clearLogs();
      await logsClient.clear();
    } catch (error) {
      console.error("Failed to clear logs:", error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Application Logs Section */}
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-canopy-text mb-1">Application Logs</h4>
          <p className="text-xs text-gray-400 mb-3">
            View internal application logs for debugging purposes.
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openLogs()}
              className="text-canopy-text border-canopy-border hover:bg-canopy-border hover:text-canopy-text"
            >
              <FileText className="w-4 h-4 mr-2" />
              Open Log File
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearLogs}
              className="text-[var(--color-status-error)] border-canopy-border hover:bg-red-900/20 hover:text-red-300 hover:border-red-900/30"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Logs
            </Button>
          </div>
        </div>
      </div>

      {/* Developer Mode Section */}
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-canopy-text mb-1 flex items-center gap-2">
            <Bug className="w-4 h-4" />
            Developer Mode
          </h4>
          <p className="text-xs text-gray-400 mb-3">
            Enable enhanced debugging features for development and troubleshooting.
          </p>

          {/* Master Developer Mode Toggle */}
          <label className="flex items-center gap-3 cursor-pointer mb-4 p-3 border border-canopy-border rounded-md">
            <button
              onClick={handleToggleDeveloperMode}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors shrink-0",
                developerMode ? "bg-canopy-accent" : "bg-gray-600"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                  developerMode && "translate-x-5"
                )}
              />
            </button>
            <div>
              <span className="text-sm text-canopy-text font-medium">Enable Developer Mode</span>
              <p className="text-xs text-gray-400">Activates all debugging features below</p>
            </div>
          </label>

          {/* Individual Debug Features */}
          <div
            className={cn(
              "ml-4 space-y-3 border-l-2 border-canopy-border pl-4 transition-opacity",
              !developerMode && "opacity-50"
            )}
          >
            {/* State Debug Overlays */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={showStateDebug}
                onChange={handleToggleStateDebug}
                disabled={!developerMode}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-canopy-accent focus:ring-canopy-accent focus:ring-offset-0 disabled:opacity-50"
              />
              <div>
                <span className="text-sm text-canopy-text">State Debug Overlays</span>
                <p className="text-xs text-gray-400">
                  Show trigger source and confidence in terminal headers
                </p>
              </div>
            </label>

            {/* Auto-open Diagnostics */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoOpenDiagnostics}
                onChange={handleToggleAutoOpenDiagnostics}
                disabled={!developerMode}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-canopy-accent focus:ring-canopy-accent focus:ring-offset-0 disabled:opacity-50"
              />
              <div>
                <span className="text-sm text-canopy-text">Auto-Open Diagnostics Dock</span>
                <p className="text-xs text-gray-400">
                  Automatically open diagnostics panel on app startup
                </p>
              </div>
            </label>

            {/* Focus Events Tab */}
            <label
              className={cn(
                "flex items-center gap-3 cursor-pointer ml-4",
                !autoOpenDiagnostics && "opacity-50"
              )}
            >
              <input
                type="checkbox"
                checked={focusEventsTab}
                onChange={handleToggleFocusEventsTab}
                disabled={!developerMode || !autoOpenDiagnostics}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-canopy-accent focus:ring-canopy-accent focus:ring-offset-0 disabled:opacity-50"
              />
              <div>
                <span className="text-sm text-canopy-text">Focus Events Tab</span>
                <p className="text-xs text-gray-400">
                  Default to Events tab when diagnostics opens
                </p>
              </div>
            </label>
          </div>

          {/* Environment Variable Hints */}
          <div className="mt-4 p-3 bg-canopy-border/30 rounded-md">
            <h5 className="text-xs font-medium text-canopy-text mb-2">
              Advanced: Main Process Logging
            </h5>
            <p className="text-xs text-gray-400 mb-2">
              For verbose main process logs, restart the app with environment variables:
            </p>
            <code className="block text-xs bg-canopy-bg p-2 rounded border border-canopy-border font-mono text-canopy-text">
              CANOPY_DEBUG=1 CANOPY_VERBOSE=1 npm run dev
            </code>
            <div className="mt-2 space-y-1">
              <p className="text-xs text-gray-400">
                <span className="font-medium text-canopy-text">CANOPY_DEBUG</span> — General logger
                verbosity
              </p>
              <p className="text-xs text-gray-400">
                <span className="font-medium text-canopy-text">CANOPY_VERBOSE</span> — Service-level
                debug output
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Section */}
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-canopy-text mb-1">Keyboard Shortcuts</h4>
          <p className="text-xs text-gray-400 mb-3">
            Use Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows/Linux) to open DevTools.
          </p>
        </div>
      </div>
    </div>
  );
}
