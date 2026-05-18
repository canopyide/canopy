import { CHANNELS } from "../channels.js";
import { store } from "../../store.js";
import { typedHandle } from "../utils.js";
import { getRegisteredForgeProviders } from "../../services/forgeProviderRegistry.js";
import { resolveForgeProvider } from "../../services/forgeProviderResolver.js";
import { projectStore } from "../../services/ProjectStore.js";
import { gitServiceCache } from "../../services/GitServiceCache.js";

function readDefaultProviderId(): string | null {
  const value = store.get("forgeDefaultProviderId");
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
      let next: string | null = null;
      if (typeof providerId === "string") {
        const trimmed = providerId.trim();
        if (trimmed.length > 0) next = trimmed;
      }
      if (next === null) {
        store.set("forgeDefaultProviderId", null);
      } else {
        store.set("forgeDefaultProviderId", next);
      }
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

        const globalDefault = store.get("forgeDefaultProviderId");
        const globalDefaultProviderId = typeof globalDefault === "string" ? globalDefault : null;

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
