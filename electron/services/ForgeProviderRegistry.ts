import type {
  ForgeProviderContribution,
  ForgeProviderDescriptor,
  ForgeProviderImpl,
} from "../../shared/types/forge.js";

/**
 * Composed provider id (`{pluginId}.{descriptorId}`) format. Mirrors
 * `PLUGIN_ACTION_ID_RE` in PluginService — duplicated rather than shared
 * because the two checks evolve independently and the constant is tiny.
 */
const PROVIDER_FULL_ID_RE = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-zA-Z0-9._-]*$/;

/**
 * Strip keys whose value is `undefined` so a JS plugin passing
 * `{ id, matches: undefined }` cannot clobber a statically-declared manifest
 * field when the runtime descriptor is merged over the eager one.
 */
function definedOnly<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

interface RegistryEntry {
  pluginId: string;
  fullId: string;
  /** Manifest contribution (eager) or runtime descriptor (lazy), merged. */
  descriptor: ForgeProviderDescriptor & { id: string };
  /**
   * `null` for a manifest-only (eager) registration whose `activate()` has not
   * yet bound the implementation. `listMatchingProviders` excludes null-impl
   * entries — a descriptor without an impl is not callable.
   */
  impl: ForgeProviderImpl | null;
}

/**
 * Host-side registry of plugin-contributed forge providers (issue #8057).
 *
 * Two registration paths, matching the forge contribution-point lifecycle:
 *
 * - **Eager / manifest-driven** (`registerDescriptorOnly`): called from
 *   `PluginService.loadPlugin()` for each `contributes.forgeProviders` entry.
 *   Populates the routing table and Preferences UI before any plugin code
 *   runs; `impl` is `null` until bound.
 * - **Lazy / implementation binding** (`register`): called from the
 *   `host.registerForgeProvider` API during `activate(host)`. Binds the
 *   runtime `impl`, upgrading a matching eager entry in place when present.
 *
 * Remote-URL routing uses exact hostname matching via `new URL().hostname`.
 * SSH scp-style remotes (`git@github.com:org/repo.git`) do NOT parse through
 * `new URL()` — callers must normalize remotes to HTTPS form before querying.
 * Glob patterns in `descriptor.matches` are out of scope for this stage.
 */
export class ForgeProviderRegistry {
  /** Keyed by pluginId; one plugin may contribute several providers. */
  private byPlugin = new Map<string, RegistryEntry[]>();

  private composeFullId(pluginId: string, descriptorId: string): string {
    if (typeof descriptorId !== "string" || descriptorId.length === 0) {
      throw new Error("Forge provider descriptor.id must be a non-empty string");
    }
    const fullId = `${pluginId}.${descriptorId}`;
    if (!PROVIDER_FULL_ID_RE.test(fullId)) {
      throw new Error(
        `Forge provider id "${fullId}" is invalid. Expected "{pluginId}.{providerId}" ` +
          `(lowercase start, alphanumerics, dot/dash/underscore).`
      );
    }
    return fullId;
  }

  private getList(pluginId: string): RegistryEntry[] {
    let list = this.byPlugin.get(pluginId);
    if (!list) {
      list = [];
      this.byPlugin.set(pluginId, list);
    }
    return list;
  }

  /**
   * Eager manifest registration. Records the descriptor with no impl. Calling
   * it again for the same provider replaces the descriptor while preserving
   * any impl already bound (load order between manifest scan and activate is
   * not guaranteed).
   */
  registerDescriptorOnly(pluginId: string, contribution: ForgeProviderContribution): void {
    const fullId = this.composeFullId(pluginId, contribution.id);
    const list = this.getList(pluginId);
    const existing = list.find((e) => e.fullId === fullId);
    if (existing) {
      existing.descriptor = { ...contribution };
      return;
    }
    list.push({ pluginId, fullId, descriptor: { ...contribution }, impl: null });
  }

  /**
   * Bind a runtime implementation. Upgrades a matching eager entry in place
   * (merging descriptor fields the runtime descriptor supplies) or creates a
   * new entry when registered purely at runtime. Returns an idempotent
   * disposer that removes exactly this registration.
   */
  register(
    pluginId: string,
    descriptor: ForgeProviderDescriptor,
    impl: ForgeProviderImpl
  ): () => void {
    const fullId = this.composeFullId(pluginId, descriptor.id);
    if (impl == null || typeof impl !== "object") {
      throw new Error(`Forge provider "${fullId}" implementation must be an object`);
    }
    const list = this.getList(pluginId);
    let entry = list.find((e) => e.fullId === fullId);
    if (entry && entry.impl != null) {
      // A second register() for an already-bound provider would force two
      // disposers to share one entry reference — disposing either silently
      // removes the live provider. Re-registration must go through the
      // disposer first; this keeps each disposer bound to its own entry.
      throw new Error(
        `Forge provider "${fullId}" is already registered. Dispose the previous ` +
          `registration before registering it again.`
      );
    }
    if (entry) {
      // Intended eager→lazy upgrade: bind the impl onto the manifest-declared
      // descriptor. Runtime descriptor fields override/extend it; explicit
      // `undefined` values must NOT clobber statically-declared manifest
      // fields (e.g. `matches`), so they are filtered before merging. This is
      // the only disposer for this entry (registerDescriptorOnly returns void).
      entry.descriptor = { ...entry.descriptor, ...definedOnly(descriptor), id: descriptor.id };
      entry.impl = impl;
    } else {
      entry = { pluginId, fullId, descriptor: { ...descriptor }, impl };
      list.push(entry);
    }

    const target = entry;
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const current = this.byPlugin.get(pluginId);
      if (!current) return;
      const idx = current.indexOf(target);
      if (idx >= 0) current.splice(idx, 1);
      if (current.length === 0) this.byPlugin.delete(pluginId);
    };
  }

  /** Remove every provider owned by a plugin. Idempotent. */
  unregisterAll(pluginId: string): void {
    this.byPlugin.delete(pluginId);
  }

  /**
   * All callable (impl-bound) providers whose `matches` contains the remote
   * URL's hostname. Registration order is preserved so the first match wins.
   * Returns `[]` for an unparseable URL (including SSH scp-style remotes).
   */
  listMatchingProviders(remoteUrl: string): ForgeProviderImpl[] {
    let hostname: string;
    try {
      hostname = new URL(remoteUrl).hostname;
    } catch {
      return [];
    }
    const matched: ForgeProviderImpl[] = [];
    for (const list of this.byPlugin.values()) {
      for (const entry of list) {
        if (entry.impl == null) continue;
        if (entry.descriptor.matches?.includes(hostname)) {
          matched.push(entry.impl);
        }
      }
    }
    return matched;
  }

  /**
   * The first registered impl-bound provider matching the remote URL, or
   * `null`. Used by remote-URL routing (PRIntegrationService rewrite, #8058
   * step 8).
   */
  getActiveProvider(remoteUrl: string): ForgeProviderImpl | null {
    return this.listMatchingProviders(remoteUrl)[0] ?? null;
  }

  /** Test-only: drop all registrations. */
  clear(): void {
    this.byPlugin.clear();
  }
}

export const forgeProviderRegistry = new ForgeProviderRegistry();
