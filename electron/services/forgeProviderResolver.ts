import type { RegisteredForgeProvider, ResolvedForgeProvider } from "../../shared/types/forge.js";
import { getRegisteredForgeProviders, listMatchingProviders } from "./forgeProviderRegistry.js";

const NO_MATCH: ResolvedForgeProvider = { entry: null, resolvedVia: null };

export interface ResolveForgeProviderInputs {
  /** Project's `origin` remote URL. Used for hostname matching when no override
   *  resolves. `null`/`undefined` skips hostname matching (no candidates). */
  remoteUrl: string | null | undefined;
  /** Per-project override (`forgeProviderOverride`). Bare id (`"github"`) or
   *  namespaced (`"builtin.github"`); both accepted. Set wins over default. */
  forgeProviderOverride: string | null | undefined;
  /** Global default (`forgeDefaultProviderId`). Same id forms as override.
   *  Only matches when present in the remote's candidate set. */
  globalDefaultProviderId: string | null | undefined;
}

/**
 * Pick the single active forge provider from the candidates the registry
 * exposes. Pure function — no I/O, no main-process bindings — so safe to call
 * from the workspace-host UtilityProcess (issue #8316: importing `projectStore`
 * here pulled `BrowserWindow`/`app` into the host bundle via the persistence
 * chain).
 *
 * Precedence (issue #8112):
 *
 *   1. Per-project override (`forgeProviderOverride`, #8111) — if set and the
 *      named provider is still registered.
 *   2. Global default (`forgeDefaultProviderId`, #8110) — if set and the named
 *      provider is one of the candidates for the project's remote.
 *   3. First hostname match from `listMatchingProviders(remoteUrl)`.
 *
 * Returns `{ entry: null, resolvedVia: null }` when no rule resolves. Consumers
 * treat `entry === null` the same as "no provider registered" (quiet linkage
 * absence, no toast, no log spam).
 *
 * `resolvedVia` reports which precedence tier picked the entry so the
 * Preferences UI can render an explanatory tooltip without re-implementing
 * the chain. Issue #8064.
 */
export function resolveForgeProvider(inputs: ResolveForgeProviderInputs): ResolvedForgeProvider {
  const { remoteUrl, forgeProviderOverride, globalDefaultProviderId } = inputs;

  // 1. Per-project override — searches the full registry, not just remote
  //    candidates. A user who names a provider overrides hostname matching
  //    entirely. Override-set-but-unregistered returns null (no fallthrough).
  if (typeof forgeProviderOverride === "string" && forgeProviderOverride.length > 0) {
    const all = getRegisteredForgeProviders();
    const match = findById(all, forgeProviderOverride);
    return match ? { entry: match, resolvedVia: "override" } : NO_MATCH;
  }

  if (typeof remoteUrl !== "string" || remoteUrl.length === 0) return NO_MATCH;
  const candidates = listMatchingProviders(remoteUrl);

  // 2. Global default — must be one of the remote's candidates. A default
  //    that does not match this project's remote returns null (no fallthrough).
  if (typeof globalDefaultProviderId === "string" && globalDefaultProviderId.length > 0) {
    const match = findById(candidates, globalDefaultProviderId);
    return match ? { entry: match, resolvedVia: "default" } : NO_MATCH;
  }

  // 3. First hostname match (or null if there are no candidates).
  const first = candidates[0];
  return first ? { entry: first, resolvedVia: "hostname" } : NO_MATCH;
}

function findById(
  providers: RegisteredForgeProvider[],
  id: string
): RegisteredForgeProvider | undefined {
  return providers.find(
    (p) => p.contribution.id === id || `${p.pluginId}.${p.contribution.id}` === id
  );
}
