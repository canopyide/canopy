import { describe, expect, it } from "vitest";
import { toPluginWorktreeSnapshot } from "../pluginWorktreeSnapshot.js";
import type { WorktreeSnapshot } from "../../types/workspace-host.js";

function makeSnapshot(extra: Partial<WorktreeSnapshot> = {}): WorktreeSnapshot {
  return {
    id: "wt-1",
    worktreeId: "wt-1",
    path: "/repo/feature-x",
    name: "feature-x",
    isCurrent: false,
    ...extra,
  };
}

describe("toPluginWorktreeSnapshot — linked projection", () => {
  it("yields linked: null when neither issueNumber nor prNumber is present", () => {
    const out = toPluginWorktreeSnapshot(makeSnapshot());
    expect(out.linked).toBeNull();
  });

  it("populates linked.pr from prNumber/prUrl/prState/prTitle", () => {
    const out = toPluginWorktreeSnapshot(
      makeSnapshot({
        prNumber: 42,
        prUrl: "https://github.com/o/r/pull/42",
        prState: "open",
        prTitle: "Fix the thing",
      })
    );
    expect(out.linked).not.toBeNull();
    expect(out.linked?.providerId).toBe("github");
    expect(out.linked?.pr).toEqual({
      ref: {
        providerId: "github",
        owner: "",
        repo: "",
        number: 42,
        rawData: null,
      },
      title: "Fix the thing",
      url: "https://github.com/o/r/pull/42",
      state: "open",
    });
    expect(out.linked?.issue).toBeUndefined();
  });

  it("populates linked.issue from issueNumber/issueTitle", () => {
    const out = toPluginWorktreeSnapshot(
      makeSnapshot({ issueNumber: 7, issueTitle: "Bug report" })
    );
    expect(out.linked?.providerId).toBe("github");
    expect(out.linked?.issue).toEqual({
      ref: {
        providerId: "github",
        owner: "",
        repo: "",
        number: 7,
        rawData: null,
      },
      title: "Bug report",
    });
    expect(out.linked?.pr).toBeUndefined();
  });

  it("populates both arms when both PR and issue are linked", () => {
    const out = toPluginWorktreeSnapshot(
      makeSnapshot({
        prNumber: 42,
        prUrl: "https://github.com/o/r/pull/42",
        prState: "merged",
        issueNumber: 7,
      })
    );
    expect(out.linked?.pr?.ref.number).toBe(42);
    expect(out.linked?.pr?.state).toBe("merged");
    expect(out.linked?.issue?.ref.number).toBe(7);
  });

  it("maps the three WorktreeSnapshot prState values through directly", () => {
    const open = toPluginWorktreeSnapshot(makeSnapshot({ prNumber: 1, prState: "open" }));
    expect(open.linked?.pr?.state).toBe("open");

    const merged = toPluginWorktreeSnapshot(makeSnapshot({ prNumber: 1, prState: "merged" }));
    expect(merged.linked?.pr?.state).toBe("merged");

    const closed = toPluginWorktreeSnapshot(makeSnapshot({ prNumber: 1, prState: "closed" }));
    expect(closed.linked?.pr?.state).toBe("closed");
  });

  it("defaults missing prUrl to an empty string and missing prState to open", () => {
    const out = toPluginWorktreeSnapshot(makeSnapshot({ prNumber: 99 }));
    expect(out.linked?.pr?.url).toBe("");
    expect(out.linked?.pr?.state).toBe("open");
    expect(out.linked?.pr?.title).toBeUndefined();
  });

  it("freezes the snapshot, the linked object, and the linked refs", () => {
    const out = toPluginWorktreeSnapshot(
      makeSnapshot({
        prNumber: 1,
        prUrl: "u",
        prState: "open",
        issueNumber: 2,
      })
    );
    expect(Object.isFrozen(out)).toBe(true);
    expect(Object.isFrozen(out.linked)).toBe(true);
    expect(Object.isFrozen(out.linked?.pr)).toBe(true);
    expect(Object.isFrozen(out.linked?.pr?.ref)).toBe(true);
    expect(Object.isFrozen(out.linked?.issue)).toBe(true);
    expect(Object.isFrozen(out.linked?.issue?.ref)).toBe(true);
  });

  it("does not surface the removed GitHub-shaped flat fields on the output", () => {
    const out = toPluginWorktreeSnapshot(
      makeSnapshot({
        prNumber: 1,
        prUrl: "u",
        prState: "open",
        prTitle: "t",
        issueNumber: 2,
        issueTitle: "i",
      })
    );
    // The removed fields are no longer keys on the projection — even though
    // the source carries them, they must not leak out.
    expect(Object.keys(out)).not.toContain("issueNumber");
    expect(Object.keys(out)).not.toContain("issueTitle");
    expect(Object.keys(out)).not.toContain("prNumber");
    expect(Object.keys(out)).not.toContain("prUrl");
    expect(Object.keys(out)).not.toContain("prState");
    expect(Object.keys(out)).not.toContain("prTitle");
  });

  it("preserves the non-linkage allowlist fields", () => {
    const out = toPluginWorktreeSnapshot(
      makeSnapshot({
        id: "wt-2",
        worktreeId: "wt-2",
        path: "/repo/other",
        name: "other",
        isCurrent: true,
        branch: "feature-x",
        isMainWorktree: false,
        aheadCount: 3,
        behindCount: 1,
        mood: "active",
        lastActivityTimestamp: 1234,
        createdAt: 5678,
      })
    );
    expect(out.id).toBe("wt-2");
    expect(out.path).toBe("/repo/other");
    expect(out.name).toBe("other");
    expect(out.isCurrent).toBe(true);
    expect(out.branch).toBe("feature-x");
    expect(out.isMainWorktree).toBe(false);
    expect(out.aheadCount).toBe(3);
    expect(out.behindCount).toBe(1);
    expect(out.mood).toBe("active");
    expect(out.lastActivityTimestamp).toBe(1234);
    expect(out.createdAt).toBe(5678);
  });

  it("defaults lastActivityTimestamp to null when source omits it", () => {
    const out = toPluginWorktreeSnapshot(makeSnapshot());
    expect(out.lastActivityTimestamp).toBeNull();
  });
});
