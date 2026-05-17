import type { PluginWorktreeSnapshot } from "../types/plugin.js";
import type { WorktreeSnapshot } from "../types/workspace-host.js";

/**
 * Project an internal `WorktreeSnapshot` down to the read-only
 * `PluginWorktreeSnapshot` allowlist, then freeze it.
 *
 * Explicit field assignment — do NOT spread. Internal shape changes must not
 * implicitly leak to third-party plugins.
 */
export function toPluginWorktreeSnapshot(snapshot: WorktreeSnapshot): PluginWorktreeSnapshot {
  const projection: PluginWorktreeSnapshot = {
    id: snapshot.id,
    worktreeId: snapshot.worktreeId,
    path: snapshot.path,
    name: snapshot.name,
    isCurrent: snapshot.isCurrent,
    branch: snapshot.branch,
    isMainWorktree: snapshot.isMainWorktree,
    aheadCount: snapshot.aheadCount,
    behindCount: snapshot.behindCount,
    // `linked` is provider-routed. The internal WorktreeSnapshot does not yet
    // carry provider identity (providerId/owner/repo), so there is nothing to
    // project here without coupling this allowlist to GitHub's URL shape.
    // Stays `null` until the ForgeProviderRegistry resolves linkage and
    // PRIntegrationService populates it (see forge-provider-abstraction.md).
    linked: null,
    mood: snapshot.mood,
    lastActivityTimestamp: snapshot.lastActivityTimestamp ?? null,
    createdAt: snapshot.createdAt,
  };
  return Object.freeze(projection);
}
