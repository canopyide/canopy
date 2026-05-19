import { CHANNELS } from "../channels.js";
import { store } from "../../store.js";
import { typedHandle } from "../utils.js";
import { getRegisteredForgeProviders } from "../../services/forgeProviderRegistry.js";
import { resolveForgeProvider } from "../../services/forgeProviderResolver.js";
import { projectStore } from "../../services/ProjectStore.js";
import { gitServiceCache } from "../../services/GitServiceCache.js";
import { normalizeProviderId } from "../../../shared/utils/forgeProviderIds.js";

/**
 * Read the persisted global default provider id, normalizing legacy forms
 * (`"github"`, `"builtin.github"`) to the canonical `{pluginId}.{contributionId}`
 * shape (#8451) so downstream resolution does not need to know about aliases.
 */
function readDefaultProviderId(): string | null {
  return normalizeProviderId(store.get("forgeDefaultProviderId"));
}

export function registerForgeSettingsHandlers(): () => void {
  const cleanups: Array<() => void> = [];

  cleanups.push(
    typedHandle(CHANNELS.FORGE_GET_SETTINGS, () => {
      return { defaultProviderId: readDefaultProviderId() };
    })
  );

  cleanups.push(
    typedHandle(CHANNELS.FORGE_SET_DEFAULT_PROVIDER, (providerId: unknown) => {
      // Normalize on the write path so a caller that still sends a legacy
      // alias (`"github"` / `"builtin.github"`) persists the canonical form,
      // keeping the set→get round-trip consistent and avoiding a brief
      // "Unknown provider" flash in the renderer (#8451).
      const next = normalizeProviderId(providerId);
      store.set("forgeDefaultProviderId", next);
      return { defaultProviderId: next };
    })
  );

  cleanups.push(
    typedHandle(CHANNELS.FORGE_GET_PROVIDERS, () => {
      return getRegisteredForgeProviders();
    })
  );

  cleanups.push(
    typedHandle(CHANNELS.FORGE_RESOLVE_PROVIDER, async (projectId: unknown, remoteUrl: unknown) => {
      if (typeof projectId !== "string" || projectId.length === 0) {
        return { entry: null, resolvedVia: null };
      }
      try {
        const project = projectStore.getProjectById(projectId);
        if (!project) return { entry: null, resolvedVia: null };

        const settings = await projectStore.getProjectSettings(projectId).catch(() => null);
        const forgeProviderOverride = settings?.forgeProviderOverride ?? null;

        let effectiveRemoteUrl: string | null;
        if (typeof remoteUrl === "string" && remoteUrl.length > 0) {
          effectiveRemoteUrl = remoteUrl;
        } else {
          const gitService = gitServiceCache.getGitService(project.path);
          effectiveRemoteUrl = await gitService.getRemoteUrl(project.path).catch(() => null);
        }

        const globalDefaultProviderId = readDefaultProviderId();

        return resolveForgeProvider({
          remoteUrl: effectiveRemoteUrl,
          forgeProviderOverride,
          globalDefaultProviderId,
        });
      } catch (error) {
        console.warn(`[forgeSettings] resolve failed for ${projectId}:`, error);
        return { entry: null, resolvedVia: null };
      }
    })
  );

  return () => cleanups.forEach((c) => c());
}
