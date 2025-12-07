import { useState, useEffect, useCallback, useRef } from "react";
import type { ProjectSettings, RunCommand } from "../types";
import { useProjectStore } from "../store/projectStore";
import { projectClient } from "@/clients";

interface UseProjectSettingsReturn {
  settings: ProjectSettings | null;
  detectedRunners: RunCommand[];
  isLoading: boolean;
  error: string | null;
  saveSettings: (settings: ProjectSettings) => Promise<void>;
  promoteToSaved: (command: RunCommand) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useProjectSettings(projectId?: string): UseProjectSettingsReturn {
  const currentProject = useProjectStore((state) => state.currentProject);
  const targetId = projectId || currentProject?.id;

  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [detectedRunners, setDetectedRunners] = useState<RunCommand[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const [data, detected] = await Promise.all([
        projectClient.getSettings(requestedProjectId),
        projectClient.detectRunners(requestedProjectId),
      ]);

      if (requestedProjectId === latestTargetIdRef.current) {
        setSettings(data);

        const savedCommandStrings = new Set(data.runCommands?.map((c) => c.command) || []);
        const newDetected = detected.filter((d) => !savedCommandStrings.has(d.command));
        setDetectedRunners(newDetected);
      }
    } catch (err) {
      console.error("Failed to load project settings:", err);
      if (requestedProjectId === latestTargetIdRef.current) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setSettings({ runCommands: [] });
        setDetectedRunners([]);
      }
    } finally {
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
      if (settings.runCommands.some((c) => c.command === command.command)) return;

      const updated = [...settings.runCommands, command];

      try {
        await projectClient.saveSettings(targetId, {
          ...settings,
          runCommands: updated,
        });

        setSettings({
          ...settings,
          runCommands: updated,
        });

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
