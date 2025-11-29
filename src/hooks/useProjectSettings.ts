/**
 * useProjectSettings Hook
 *
 * Provides project settings management via IPC.
 * Loads settings when project changes and provides save functionality.
 */

import { useState, useEffect, useCallback } from "react";
import type { ProjectSettings } from "../types";
import { useProjectStore } from "../store/projectStore";

interface UseProjectSettingsReturn {
  /** Current project settings (null while loading) */
  settings: ProjectSettings | null;
  /** Whether settings are currently loading */
  isLoading: boolean;
  /** Error message if loading/saving failed */
  error: string | null;
  /** Save updated settings */
  saveSettings: (settings: ProjectSettings) => Promise<void>;
  /** Refresh settings from disk */
  refresh: () => Promise<void>;
}

/**
 * Hook for managing project-level settings.
 * Loads settings when project changes and provides save functionality.
 *
 * @param projectId - Optional project ID. If not provided, uses current project.
 *
 * @example
 * ```tsx
 * const { settings, saveSettings, isLoading, error } = useProjectSettings();
 *
 * if (isLoading) return <Spinner />;
 * if (!settings) return <div>No project selected</div>;
 *
 * return (
 *   <div>
 *     {settings.runCommands.map(cmd => (
 *       <button key={cmd.id} onClick={() => runCommand(cmd.command)}>
 *         {cmd.name}
 *       </button>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useProjectSettings(projectId?: string): UseProjectSettingsReturn {
  // Get current project ID from store if none provided
  const currentProject = useProjectStore((state) => state.currentProject);
  const targetId = projectId || currentProject?.id;

  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!targetId) {
      setSettings({ runCommands: [] });
      return;
    }

    setIsLoading(true);
    setError(null);

    const currentProjectId = targetId;
    try {
      const data = await window.electron.project.getSettings(currentProjectId);
      // Only update state if this is still the active project
      if (currentProjectId === targetId) {
        setSettings(data);
      }
    } catch (err) {
      console.error("Failed to load project settings:", err);
      // Only update error state if this is still the active project
      if (currentProjectId === targetId) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setSettings({ runCommands: [] });
      }
    } finally {
      // Only clear loading if this is still the active project
      if (currentProjectId === targetId) {
        setIsLoading(false);
      }
    }
  }, [targetId]);

  const saveSettings = useCallback(
    async (newSettings: ProjectSettings) => {
      if (!targetId) {
        console.warn("Cannot save settings: no project ID");
        return;
      }

      try {
        await window.electron.project.saveSettings(targetId, newSettings);
        setSettings(newSettings);
        setError(null);
      } catch (err) {
        console.error("Failed to save project settings:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        throw err;
      }
    },
    [targetId]
  );

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    isLoading,
    error,
    saveSettings,
    refresh: fetchSettings,
  };
}
