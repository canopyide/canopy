import type {
  RegisteredForgeProvider,
  ResolvedForgeProvider,
} from "../../shared/types/forge.js";
import { getRegisteredForgeProviders, listMatchingProviders } from "./forgeProviderRegistry.js";
import { projectStore } from "./ProjectStore.js";
import { gitServiceCache } from "./GitServiceCache.js";
import { store } from "../store.js";

const NO_MATCH: ResolvedForgeProvider = { entry: null, resolvedVia: null };

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
 * Returns `{ entry: null, resolvedVia: null }` when no rule resolves — override
 * pointing at an uninstalled plugin, default pointing at an unregistered ID, or
 * no hostname match. Consumers treat `entry === null` the same as "no provider
 * registered" (quiet linkage absence, no toast, no log spam).
 *
 * `resolvedVia` reports which precedence tier picked the entry so the
 * Preferences UI can render an explanatory tooltip without re-implementing
 * the chain. Issue #8064.
 *
 * Stateless and synchronous per the issue contract — no caching beyond
 * per-call. Settings changes re-resolve on the next call.
 *
 * Override and global-default IDs may be stored either as the bare
 * `contribution.id` (e.g. `"github"`) or as the namespaced `{pluginId}.{id}`
 * form. The matcher accepts both.
 *
 * `remoteUrl`, when supplied, replaces the resolver's internal `getRemoteUrl`
 * lookup for hostname matching. Per-remote resolution (Preferences →
 * Forge Integrations) uses this; project-wide callers (PR linkage) omit it
 * and fall back to the project's `origin` remote.
 */
export async function resolveForgeProvider(
  projectId: string,
  remoteUrl?: string
): Promise<ResolvedForgeProvider> {
  if (typeof projectId !== "string" || projectId.length === 0) return NO_MATCH;

  try {
    const project = projectStore.getProjectById(projectId);
    if (!project) return NO_MATCH;

    // 1. Per-project override — searches the full registry, not just remote
    //    candidates. A user who names a provider overrides hostname matching
    //    entirely. Override-set-but-unregistered returns null (no fallthrough).
    //
    //    Read settings before the git remote lookup so the override path
    //    short-circuits without awaiting I/O it doesn't need.
    const settings = await projectStore.getProjectSettings(projectId).catch(() => null);
    const override = settings?.forgeProviderOverride;
    if (typeof override === "string" && override.length > 0) {
      const all = getRegisteredForgeProviders();
      const match = findById(all, override);
      return match ? { entry: match, resolvedVia: "override" } : NO_MATCH;
    }

    let effectiveRemoteUrl: string | null;
    if (typeof remoteUrl === "string" && remoteUrl.length > 0) {
      effectiveRemoteUrl = remoteUrl;
    } else {
      const gitService = gitServiceCache.getGitService(project.path);
      effectiveRemoteUrl = await gitService.getRemoteUrl(project.path).catch(() => null);
    }
    if (!effectiveRemoteUrl) return NO_MATCH;
    const candidates = listMatchingProviders(effectiveRemoteUrl);

    // 2. Global default — must be one of the remote's candidates. A default
    //    that does not match this project's remote returns null (no fallthrough).
    const globalDefault = store.get("forgeDefaultProviderId");
    if (typeof globalDefault === "string" && globalDefault.length > 0) {
      const match = findById(candidates, globalDefault);
      return match ? { entry: match, resolvedVia: "default" } : NO_MATCH;
    }

    // 3. First hostname match (or null if there are no candidates).
    const first = candidates[0];
    return first ? { entry: first, resolvedVia: "hostname" } : NO_MATCH;
  } catch (error) {
    console.warn(`[forgeProviderResolver] resolve failed for ${projectId}:`, error);
    return NO_MATCH;
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
