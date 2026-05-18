import type {
  PluginWorktreeLinked,
  PluginWorktreeLinkedIssue,
  PluginWorktreeLinkedPR,
  PluginWorktreeSnapshot,
} from "../types/plugin.js";
import type { NormalizedPRState, ResourceRef } from "../types/forge.js";
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
    linked: buildLinkedProjection(snapshot),
    mood: snapshot.mood,
    lastActivityTimestamp: snapshot.lastActivityTimestamp ?? null,
    createdAt: snapshot.createdAt,
  };
  return Object.freeze(projection);
}

/**
 * Synthesize the provider-agnostic `linked` projection from the internal
 * snapshot's flat GitHub-shaped fields. Returns `null` when neither an issue
 * nor a PR is linked. Provider id is hardcoded to `"github"` because the only
 * forge currently writing these fields is the built-in GitHub integration.
 *
 * TODO(forge-abstraction): when `PRIntegrationService` is rewritten against
 * the {@link ForgeProviderImpl} contract, the synthesized {@link ResourceRef}
 * will be replaced with one carrying populated `owner`/`repo` — they're empty
 * here because `WorktreeSnapshot` does not currently carry repo identity.
 */
function buildLinkedProjection(snapshot: WorktreeSnapshot): PluginWorktreeLinked | null {
  const hasPR = typeof snapshot.prNumber === "number";
  const hasIssue = typeof snapshot.issueNumber === "number";
  if (!hasPR && !hasIssue) return null;

  const providerId = "github";
  const linked: { providerId: string; issue?: PluginWorktreeLinkedIssue; pr?: PluginWorktreeLinkedPR } = {
    providerId,
  };

  if (hasIssue) {
    const issueRef: ResourceRef = {
      providerId,
      owner: "",
      repo: "",
      number: snapshot.issueNumber as number,
      rawData: null,
    };
    linked.issue = Object.freeze({
      ref: Object.freeze(issueRef),
      title: snapshot.issueTitle,
    });
  }

  if (hasPR) {
    const prRef: ResourceRef = {
      providerId,
      owner: "",
      repo: "",
      number: snapshot.prNumber as number,
      rawData: null,
    };
    // WorktreeSnapshot.prState ("open" | "merged" | "closed") is a strict
    // subtype of NormalizedPRState (adds "declined"); a direct cast is safe.
    linked.pr = Object.freeze({
      ref: Object.freeze(prRef),
      title: snapshot.prTitle,
      url: snapshot.prUrl ?? "",
      state: (snapshot.prState ?? "open") as NormalizedPRState,
    });
  }

  return Object.freeze(linked);
}
