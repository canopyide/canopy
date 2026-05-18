import type { RegisteredForgeProvider } from "../../shared/types/forge.js";
import { getRegisteredForgeProviders, listMatchingProviders } from "./forgeProviderRegistry.js";
import { projectStore } from "./ProjectStore.js";
import { gitServiceCache } from "./GitServiceCache.js";
import { store } from "../store.js";

/**
 * Pick the single active forge provider for a project from the candidates the
 * registry exposes. Precedence (issue #8112):
 *
 *   1. Per-project override (`forgeProviderOverride`, #8111) — if set and the
 *      named provider is still registered.
 *   2. Global default (`forgeDefaultProviderId`, #8110) — if set and the named
 *      provider is one of the candidates for the project's remote.
 *   3. First hostname match from `listMatchingProviders(remoteUrl)`.
 *
 * Returns `null` when no rule resolves — override pointing at an uninstalled
 * plugin, default pointing at an unregistered ID, or no hostname match.
 * Consumers treat `null` the same as "no provider registered" (quiet linkage
 * absence, no toast, no log spam).
 *
 * Stateless and synchronous per the issue contract — no caching beyond
 * per-call. Settings changes re-resolve on the next call.
 *
 * Override and global-default IDs may be stored either as the bare
 * `contribution.id` (e.g. `"github"`) or as the namespaced `{pluginId}.{id}`
 * form. The matcher accepts both.
 */
export async function resolveForgeProvider(
  projectId: string
): Promise<RegisteredForgeProvider | null> {
  if (typeof projectId !== "string" || projectId.length === 0) return null;

  try {
    const project = projectStore.getProjectById(projectId);
    if (!project) return null;

    const gitService = gitServiceCache.getGitService(project.path);
    const remoteUrl = await gitService.getRemoteUrl(project.path).catch(() => null);

    // 1. Per-project override — searches the full registry, not just remote
    //    candidates. A user who names a provider overrides hostname matching
    //    entirely. Override-set-but-unregistered returns null (no fallthrough).
    const settings = await projectStore.getProjectSettings(projectId).catch(() => null);
    const override = settings?.forgeProviderOverride;
    if (typeof override === "string" && override.length > 0) {
      const all = getRegisteredForgeProviders();
      return findById(all, override) ?? null;
    }

    if (!remoteUrl) return null;
    const candidates = listMatchingProviders(remoteUrl);

    // 2. Global default — must be one of the remote's candidates. A default
    //    that does not match this project's remote returns null (no fallthrough).
    const globalDefault = store.get("forgeDefaultProviderId");
    if (typeof globalDefault === "string" && globalDefault.length > 0) {
      return findById(candidates, globalDefault) ?? null;
    }

    // 3. First hostname match (or null if there are no candidates).
    return candidates[0] ?? null;
  } catch (error) {
    console.warn(`[forgeProviderResolver] resolve failed for ${projectId}:`, error);
    return null;
  }
}

function findById(
  providers: RegisteredForgeProvider[],
  id: string
): RegisteredForgeProvider | undefined {
  return providers.find(
    (p) => p.contribution.id === id || `${p.pluginId}.${p.contribution.id}` === id
  );
}
