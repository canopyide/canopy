import type { ForgeProviderContribution, RepoRef } from "../../shared/types/forge.js";

/**
 * Host-side registry of `forgeProviders` contributions, keyed by pluginId.
 *
 * Populated eagerly from each plugin's manifest during `loadPlugin` so the
 * Preferences UI and remote-URL routing table are usable before any plugin's
 * `activate()` runs. Cleared on plugin unload via the existing disposable
 * cascade in `PluginService.unloadPlugin`.
 *
 * The runtime implementation handler (`ForgeProviderImpl`) is wired separately
 * in #8058 via `host.registerForgeProvider`. This registry tracks only the
 * descriptor surface declared in the manifest.
 */
const PLUGIN_FORGE_PROVIDERS = new Map<string, ForgeProviderContribution[]>();

export interface RegisteredForgeProvider {
  pluginId: string;
  contribution: ForgeProviderContribution;
}

export function registerForgeProviders(
  pluginId: string,
  contributions: ForgeProviderContribution[]
): void {
  if (typeof pluginId !== "string" || pluginId.length === 0) return;
  if (!Array.isArray(contributions) || contributions.length === 0) return;
  PLUGIN_FORGE_PROVIDERS.set(pluginId, [...contributions]);
}

export function unregisterForgeProviders(pluginId: string): void {
  if (typeof pluginId !== "string" || pluginId.length === 0) return;
  PLUGIN_FORGE_PROVIDERS.delete(pluginId);
}

export function clearForgeProviderRegistry(): void {
  PLUGIN_FORGE_PROVIDERS.clear();
}

export function getRegisteredForgeProviders(): RegisteredForgeProvider[] {
  const result: RegisteredForgeProvider[] = [];
  for (const [pluginId, contributions] of PLUGIN_FORGE_PROVIDERS) {
    for (const contribution of contributions) {
      result.push({ pluginId, contribution });
    }
  }
  return result;
}

export function listMatchingProviders(remoteUrl: string): RegisteredForgeProvider[] {
  const hostname = extractHostname(remoteUrl);
  if (hostname === null) return [];
  return listProvidersByHostname(hostname);
}

export function getActiveProvider(remoteUrl: string): RegisteredForgeProvider | undefined;
export function getActiveProvider(repoRef: RepoRef): RegisteredForgeProvider | undefined;
export function getActiveProvider(arg: string | RepoRef): RegisteredForgeProvider | undefined {
  if (typeof arg === "string") {
    return listMatchingProviders(arg)[0];
  }
  if (arg === null || typeof arg !== "object" || typeof arg.host !== "string") {
    return undefined;
  }
  const hostname = normalizeHostname(arg.host);
  if (hostname === null) return undefined;
  return listProvidersByHostname(hostname)[0];
}

function listProvidersByHostname(hostname: string): RegisteredForgeProvider[] {
  const matches: RegisteredForgeProvider[] = [];
  for (const [pluginId, contributions] of PLUGIN_FORGE_PROVIDERS) {
    for (const contribution of contributions) {
      if (hostnameMatchesAny(hostname, contribution.matches)) {
        matches.push({ pluginId, contribution });
      }
    }
  }
  return matches;
}

function hostnameMatchesAny(hostname: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const normalized = normalizeHostname(pattern);
    if (normalized !== null && normalized === hostname) return true;
  }
  return false;
}

function normalizeHostname(host: string): string | null {
  if (typeof host !== "string") return null;
  const trimmed = host.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  return trimmed.startsWith("www.") ? trimmed.slice(4) : trimmed;
}

/**
 * Extract a normalized hostname from a git remote URL. Handles SCP form
 * (`user@host:path`), HTTPS, and SSH (`ssh://...`). Returns `null` for
 * malformed input — callers treat that as "no match".
 */
function extractHostname(url: string): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;

  // SCP form: `user@host:path` — no scheme, host terminated by the first colon.
  // The `!includes("://")` discriminator distinguishes this from URLs that
  // carry a port (`https://host:443/...`), which never have an SCP shape.
  if (!trimmed.includes("://") && trimmed.includes(":")) {
    const match = /^(?:[^@/:]+@)?([^:/]+):/.exec(trimmed);
    if (match) return normalizeHostname(match[1]);
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return normalizeHostname(parsed.hostname);
  } catch {
    return null;
  }
}
