import { projectClient } from "@/clients";
import type { FleetSavedScope, ProjectSettings } from "@shared/types/project";

const MAX_RETRIES = 3;

export const fleetScopesController = {
  loadScopes: async (projectId: string): Promise<FleetSavedScope[]> => {
    const settings: Partial<ProjectSettings> | null = await projectClient.getSettings(projectId);
    return settings?.fleetSavedScopes ?? [];
  },

  saveScopes: async (projectId: string, scopes: FleetSavedScope[]): Promise<void> => {
    // Optimistic read-modify-write with retry to handle concurrent writes
    // from other windows. Re-reads settings if a retry is needed.
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const settings: Partial<ProjectSettings> | null =
        (await projectClient.getSettings(projectId)) ?? {};
      const merged = { ...settings, fleetSavedScopes: scopes } as ProjectSettings;
      try {
        await projectClient.saveSettings(projectId, merged);
        return;
      } catch (_e) {
        if (attempt === MAX_RETRIES - 1) throw _e;
      }
    }
  },
};
