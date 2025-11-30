/**
 * useProjectSettings Hook
 *
 * Provides project settings management via IPC.
 * Loads settings when project changes and provides save functionality.
 * Also fetches auto-detected run commands from project configuration files.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { ProjectSettings, RunCommand } from "../types";
import { useProjectStore } from "../store/projectStore";
import { projectClient } from "@/clients";

interface UseProjectSettingsReturn {
  /** Current project settings (null while loading) */
  settings: ProjectSettings | null;
  /** Auto-detected run commands from project files (filtered to exclude already-saved) */
  detectedRunners: RunCommand[];
  /** Whether settings are currently loading */
  isLoading: boolean;
  /** Error message if loading/saving failed */
  error: string | null;
  /** Save updated settings */
  saveSettings: (settings: ProjectSettings) => Promise<void>;
  /** Promote a detected command to saved commands */
  promoteToSaved: (command: RunCommand) => Promise<void>;
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
  const [detectedRunners, setDetectedRunners] = useState<RunCommand[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the latest targetId to prevent race conditions
  const latestTargetIdRef = useRef(targetId);
  latestTargetIdRef.current = targetId;

  const fetchSettings = useCallback(async () => {
    if (!targetId) {
      setSettings({ runCommands: [] });
      setDetectedRunners([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    const requestedProjectId = targetId;
    try {
      // Fetch saved settings and detected runners in parallel
      const [data, detected] = await Promise.all([
        projectClient.getSettings(requestedProjectId),
        projectClient.detectRunners(requestedProjectId),
      ]);

      // Only update state if this is still the active project (check against ref)
      if (requestedProjectId === latestTargetIdRef.current) {
        setSettings(data);

        // Filter out detected commands that are already saved (by command string)
        const savedCommandStrings = new Set(data.runCommands?.map((c) => c.command) || []);
        const newDetected = detected.filter((d) => !savedCommandStrings.has(d.command));
        setDetectedRunners(newDetected);
      }
    } catch (err) {
      console.error("Failed to load project settings:", err);
      // Only update error state if this is still the active project
      if (requestedProjectId === latestTargetIdRef.current) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setSettings({ runCommands: [] });
        setDetectedRunners([]);
      }
    } finally {
      // Only clear loading if this is still the active project
      if (requestedProjectId === latestTargetIdRef.current) {
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
        await projectClient.saveSettings(targetId, newSettings);
        setSettings(newSettings);

        // Re-filter detected commands after save
        const savedCommandStrings = new Set(newSettings.runCommands?.map((c) => c.command) || []);
        setDetectedRunners((prev) => prev.filter((d) => !savedCommandStrings.has(d.command)));

        setError(null);
      } catch (err) {
        console.error("Failed to save project settings:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        throw err;
      }
    },
    [targetId]
  );

  const promoteToSaved = useCallback(
    async (command: RunCommand) => {
      if (!settings || !targetId) return;

      // Use functional update to avoid race conditions with concurrent promotions
      const currentSettings = settings;
      const updated = [...currentSettings.runCommands, command];

      try {
        await projectClient.saveSettings(targetId, {
          ...currentSettings,
          runCommands: updated,
        });

        // Update local state after successful save
        setSettings({
          ...currentSettings,
          runCommands: updated,
        });

        // Re-filter detected commands
        const savedCommandStrings = new Set(updated.map((c) => c.command));
        setDetectedRunners((prev) => prev.filter((d) => !savedCommandStrings.has(d.command)));

        setError(null);
      } catch (err) {
        console.error("Failed to promote command:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        throw err;
      }
    },
    [settings, targetId]
  );

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    detectedRunners,
    isLoading,
    error,
    saveSettings,
    promoteToSaved,
    refresh: fetchSettings,
  };
}
