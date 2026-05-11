import { describe, it, expect, vi, beforeEach } from "vitest";
import { join as pathJoin } from "node:path";

const readFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    promises: {
      ...(actual as { promises: Record<string, unknown> }).promises,
      readFile: readFileMock,
    },
  };
});

import {
  parseRebaseTodoLine,
  parseRebaseTodoLines,
  readRebaseSequence,
} from "../parseRebaseTodo.js";

describe("parseRebaseTodoLine", () => {
  it("returns null for blank lines", () => {
    expect(parseRebaseTodoLine("")).toBeNull();
    expect(parseRebaseTodoLine("   ")).toBeNull();
  });

  it("returns null for comment lines", () => {
    expect(parseRebaseTodoLine("# this is a comment")).toBeNull();
    expect(parseRebaseTodoLine("  # indented comment")).toBeNull();
  });

  it("parses a pick line with abbreviated SHA and subject", () => {
    expect(parseRebaseTodoLine("pick abc1234 add new feature")).toEqual({
      action: "pick",
      sha: "abc1234",
      subject: "add new feature",
    });
  });

  it("strips git's '# ' separator between SHA and subject", () => {
    // Real git format from `git rebase -i` / `git rebase --merge`:
    //   `pick <sha> # <subject>`
    expect(parseRebaseTodoLine("pick abc1234 # add new feature")).toEqual({
      action: "pick",
      sha: "abc1234",
      subject: "add new feature",
    });
    expect(parseRebaseTodoLine("fixup -C deadbee # amend message")).toEqual({
      action: "fixup",
      sha: "deadbee",
      subject: "amend message",
    });
  });

  it("handles single-letter aliases (p/r/e/s/f/d)", () => {
    expect(parseRebaseTodoLine("p abc1234 first")).toMatchObject({ action: "pick" });
    expect(parseRebaseTodoLine("r abc1234 second")).toMatchObject({ action: "reword" });
    expect(parseRebaseTodoLine("e abc1234 third")).toMatchObject({ action: "edit" });
    expect(parseRebaseTodoLine("s abc1234 fourth")).toMatchObject({ action: "squash" });
    expect(parseRebaseTodoLine("f abc1234 fifth")).toMatchObject({ action: "fixup" });
    expect(parseRebaseTodoLine("d abc1234 sixth")).toMatchObject({ action: "drop" });
  });

  it("preserves subjects containing whitespace and punctuation", () => {
    expect(parseRebaseTodoLine("pick abc1234   fix(scope): hello   world")).toEqual({
      action: "pick",
      sha: "abc1234",
      subject: "fix(scope): hello   world",
    });
  });

  it("handles fixup -C / -c option tokens by skipping past them", () => {
    expect(parseRebaseTodoLine("fixup -C deadbee keep original message")).toEqual({
      action: "fixup",
      sha: "deadbee",
      subject: "keep original message",
    });
    expect(parseRebaseTodoLine("fixup -c deadbee edit original message")).toEqual({
      action: "fixup",
      sha: "deadbee",
      subject: "edit original message",
    });
  });

  it("treats exec lines as command-bearing with null sha", () => {
    expect(parseRebaseTodoLine("exec npm test")).toEqual({
      action: "exec",
      sha: null,
      subject: "npm test",
    });
    expect(parseRebaseTodoLine("x make lint")).toEqual({
      action: "exec",
      sha: null,
      subject: "make lint",
    });
  });

  it("folds label/reset/merge/break/update-ref into 'other'", () => {
    expect(parseRebaseTodoLine("label onto")).toMatchObject({ action: "other", sha: null });
    expect(parseRebaseTodoLine("reset onto")).toMatchObject({ action: "other", sha: null });
    expect(parseRebaseTodoLine("merge -C abc1234 branch # subject")).toMatchObject({
      action: "other",
      sha: null,
    });
    expect(parseRebaseTodoLine("break")).toMatchObject({ action: "other", sha: null });
    expect(parseRebaseTodoLine("update-ref refs/heads/topic")).toMatchObject({ action: "other" });
  });

  it("strips a trailing CR before parsing (CRLF safety)", () => {
    expect(parseRebaseTodoLine("pick abc1234 subject\r")).toEqual({
      action: "pick",
      sha: "abc1234",
      subject: "subject",
    });
  });

  it("does not throw on malformed lines lacking a SHA", () => {
    expect(parseRebaseTodoLine("pick")).toEqual({
      action: "pick",
      sha: null,
      subject: "",
    });
  });
});

describe("parseRebaseTodoLines", () => {
  it("returns an empty array for empty input", () => {
    expect(parseRebaseTodoLines("")).toEqual([]);
  });

  it("strips comments and blank lines, preserves order", () => {
    const text =
      "# rebase plan\n\npick aaa1111 first\n\nfixup bbb2222 second\n# trailer\npick ccc3333 third\n";
    expect(parseRebaseTodoLines(text)).toEqual([
      { action: "pick", sha: "aaa1111", subject: "first" },
      { action: "fixup", sha: "bbb2222", subject: "second" },
      { action: "pick", sha: "ccc3333", subject: "third" },
    ]);
  });
});

describe("readRebaseSequence", () => {
  const gitDir = pathJoin("/repo", ".git");
  const donePath = pathJoin(gitDir, "rebase-merge", "done");
  const todoPath = pathJoin(gitDir, "rebase-merge", "git-rebase-todo");

  beforeEach(() => {
    readFileMock.mockReset();
  });

  function mockFiles(files: Record<string, string | null>): void {
    readFileMock.mockImplementation(async (p: string) => {
      if (p in files) {
        const v = files[p];
        if (v == null) {
          const err = new Error("ENOENT") as NodeJS.ErrnoException;
          err.code = "ENOENT";
          throw err;
        }
        return v;
      }
      const err = new Error(`unexpected read: ${p}`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });
  }

  it("returns null when git-rebase-todo is missing", async () => {
    mockFiles({ [donePath]: null, [todoPath]: null });
    expect(await readRebaseSequence(gitDir)).toBeNull();
  });

  it("treats missing done as zero completed entries and anchors the first todo as current", async () => {
    mockFiles({
      [donePath]: null,
      [todoPath]: "pick aaa1111 first\npick bbb2222 second\n",
    });
    const seq = await readRebaseSequence(gitDir);
    expect(seq).not.toBeNull();
    expect(seq!.backend).toBe("merge");
    expect(seq!.entries).toEqual([
      { action: "pick", sha: "aaa1111", subject: "first", state: "current" },
      { action: "pick", sha: "bbb2222", subject: "second", state: "pending" },
    ]);
  });

  it("marks the last entry of `done` as current (git moves to done before pick)", async () => {
    // Empirical git behavior: when rebase halts on commit N, `done` contains
    // every command up to and including N (it's written before pick is attempted),
    // and `git-rebase-todo` contains only future commands. Verified with
    // git 2.54.0 (and earlier) — see issue #7795.
    mockFiles({
      [donePath]: "pick aaa1111 first\npick bbb2222 second\n",
      [todoPath]: "pick ccc3333 third\nfixup ddd4444 fourth\npick eee5555 fifth\n",
    });
    const seq = await readRebaseSequence(gitDir);
    expect(seq!.entries.map((e) => [e.sha, e.state])).toEqual([
      ["aaa1111", "done"],
      ["bbb2222", "current"],
      ["ccc3333", "pending"],
      ["ddd4444", "pending"],
      ["eee5555", "pending"],
    ]);
  });

  it("handles conflict on the final commit (empty git-rebase-todo)", async () => {
    // When the last commit conflicts, git-rebase-todo is a 0-byte file.
    // `readFile` returns `""` (not null), so the parser sees an empty todo.
    // The last entry of `done` must still be marked `current` — otherwise the
    // rail renders as fully completed while the user resolves the conflict.
    mockFiles({
      [donePath]: "pick aaa1111 first\npick bbb2222 second\n",
      [todoPath]: "",
    });
    const seq = await readRebaseSequence(gitDir);
    expect(seq!.entries).toEqual([
      { action: "pick", sha: "aaa1111", subject: "first", state: "done" },
      { action: "pick", sha: "bbb2222", subject: "second", state: "current" },
    ]);
  });

  it("ignores comments in done and todo when computing the current step", async () => {
    mockFiles({
      [donePath]: "# header\npick aaa1111 first\npick bbb2222 second\n",
      [todoPath]: "# rebase onto X\npick ccc3333 third\n",
    });
    const seq = await readRebaseSequence(gitDir);
    expect(seq!.entries).toEqual([
      { action: "pick", sha: "aaa1111", subject: "first", state: "done" },
      { action: "pick", sha: "bbb2222", subject: "second", state: "current" },
      { action: "pick", sha: "ccc3333", subject: "third", state: "pending" },
    ]);
  });

  it("returns null when both files exist but contain no actionable entries", async () => {
    mockFiles({ [donePath]: "# header only\n", [todoPath]: "# all comments\n\n" });
    expect(await readRebaseSequence(gitDir)).toBeNull();
  });

  it("captures fixup -C and exec lines in the sequence (real git format with #)", async () => {
    mockFiles({
      [donePath]: "pick aaa1111 # first\nfixup -C bbb2222 # amend first\n",
      [todoPath]: "exec npm test\npick ccc3333 # third\n",
    });
    const seq = await readRebaseSequence(gitDir);
    expect(seq!.entries).toEqual([
      { action: "pick", sha: "aaa1111", subject: "first", state: "done" },
      { action: "fixup", sha: "bbb2222", subject: "amend first", state: "current" },
      { action: "exec", sha: null, subject: "npm test", state: "pending" },
      { action: "pick", sha: "ccc3333", subject: "third", state: "pending" },
    ]);
  });
});
