import { describe, expect, it } from "vitest";
import { toPluginWorktreeSnapshot } from "../pluginWorktreeSnapshot.js";
import type { WorktreeSnapshot } from "../../types/workspace-host.js";

function makeSnapshot(overrides: Partial<WorktreeSnapshot> = {}): WorktreeSnapshot {
  return {
    id: "wt-1",
    worktreeId: "wt-1",
    path: "/repo/wt-1",
    name: "feature-x",
    isCurrent: true,
    branch: "feature/x",
    isMainWorktree: false,
    aheadCount: 2,
    behindCount: 0,
    mood: "active",
    lastActivityTimestamp: 1234,
    createdAt: 1000,
    // GitHub-shaped fields still live on the INTERNAL snapshot — the
    // projection must NOT leak them onto PluginWorktreeSnapshot.
    issueNumber: 42,
    issueTitle: "Some issue",
    prNumber: 7,
    prUrl: "https://github.com/o/r/pull/7",
    prState: "open",
    prTitle: "Some PR",
    ...overrides,
  } as WorktreeSnapshot;
}

describe("toPluginWorktreeSnapshot", () => {
  it("projects identity fields and freezes the result", () => {
    const out = toPluginWorktreeSnapshot(makeSnapshot());
    expect(out.id).toBe("wt-1");
    expect(out.worktreeId).toBe("wt-1");
    expect(out.path).toBe("/repo/wt-1");
    expect(out.name).toBe("feature-x");
    expect(out.isCurrent).toBe(true);
    expect(out.branch).toBe("feature/x");
    expect(out.aheadCount).toBe(2);
    expect(out.mood).toBe("active");
    expect(Object.isFrozen(out)).toBe(true);
  });

  it("does not leak the removed GitHub-shaped fields", () => {
    const out = toPluginWorktreeSnapshot(makeSnapshot()) as unknown as Record<string, unknown>;
    for (const k of ["issueNumber", "issueTitle", "prNumber", "prUrl", "prState", "prTitle"]) {
      expect(out).not.toHaveProperty(k);
    }
  });

  it("projects exactly the documented allowlist keys", () => {
    const out = toPluginWorktreeSnapshot(makeSnapshot());
    expect(Object.keys(out).sort()).toEqual([
      "aheadCount",
      "behindCount",
      "branch",
      "createdAt",
      "id",
      "isCurrent",
      "isMainWorktree",
      "lastActivityTimestamp",
      "linked",
      "mood",
      "name",
      "path",
      "worktreeId",
    ]);
  });

  it("sets `linked` to null (provider routing not yet wired)", () => {
    expect(toPluginWorktreeSnapshot(makeSnapshot()).linked).toBeNull();
    // Even when the internal snapshot carries no PR/issue data at all.
    const bare = toPluginWorktreeSnapshot(
      makeSnapshot({
        issueNumber: undefined,
        issueTitle: undefined,
        prNumber: undefined,
        prUrl: undefined,
        prState: undefined,
        prTitle: undefined,
      })
    );
    expect(bare.linked).toBeNull();
  });

  it("normalizes a missing lastActivityTimestamp to null", () => {
    const out = toPluginWorktreeSnapshot(makeSnapshot({ lastActivityTimestamp: undefined }));
    expect(out.lastActivityTimestamp).toBeNull();
  });
});
