import { CHANNELS } from "../channels.js";
import { store } from "../../store.js";
import { typedHandle } from "../utils.js";
import { getRegisteredForgeProviders } from "../../services/forgeProviderRegistry.js";

function readDefaultProviderId(): string | null {
  const value = store.get("forgeDefaultProviderId");
  return typeof value === "string" && value.length > 0 ? value : null;
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
      const next = typeof providerId === "string" && providerId.length > 0 ? providerId : null;
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

  return () => cleanups.forEach((c) => c());
}
