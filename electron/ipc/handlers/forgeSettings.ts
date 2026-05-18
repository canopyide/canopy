import { CHANNELS } from "../channels.js";
import { store } from "../../store.js";
import { typedHandle } from "../utils.js";
import { getRegisteredForgeProviders } from "../../services/forgeProviderRegistry.js";
import { resolveForgeProvider } from "../../services/forgeProviderResolver.js";

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
      const remoteUrlArg =
        typeof remoteUrl === "string" && remoteUrl.length > 0 ? remoteUrl : undefined;
      return resolveForgeProvider(projectId, remoteUrlArg);
    })
  );

  return () => cleanups.forEach((c) => c());
}
