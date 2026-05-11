import { promises as fs } from "node:fs";
import path from "node:path";
import type { RebaseAction, RebaseEntry, RebaseSequence } from "../../shared/types/git.js";

// Action aliases per Documentation/git-rebase.txt and sequencer.c. Long-form
// keys win; the single-letter forms reduce to the same `RebaseAction`. Anything
// outside this table (label/reset/merge/break/update-ref) folds to "other" so
// the renderer can de-emphasize structural lines uniformly.
const COMMIT_ACTIONS: Record<string, RebaseAction> = {
  pick: "pick",
  p: "pick",
  reword: "reword",
  r: "reword",
  edit: "edit",
  e: "edit",
  squash: "squash",
  s: "squash",
  fixup: "fixup",
  f: "fixup",
  drop: "drop",
  d: "drop",
};

const EXEC_KEYWORDS = new Set(["exec", "x"]);

/**
 * Parse a single git-rebase-todo / done line into a structured entry, or `null`
 * for comments and blank lines.
 *
 * Line shapes accepted:
 *   `pick abc1234 subject text`           — commit actions with abbreviated SHA
 *   `fixup -C deadbee subject`            — fixup with `-c`/`-C` option token
 *   `exec npm test`                       — command form, no SHA
 *   `label onto`, `reset HEAD~`           — structural; sha left as the label/name
 *   `# comment` / ``                      — returns null
 */
export function parseRebaseTodoLine(rawLine: string): Omit<RebaseEntry, "state"> | null {
  const line = rawLine.replace(/\r$/, "").trim();
  if (line.length === 0 || line.startsWith("#")) return null;

  // Split on the first run of whitespace so action and rest are recovered
  // without consuming intra-subject spaces.
  const firstSpace = line.search(/\s/);
  const actionRaw = (firstSpace === -1 ? line : line.slice(0, firstSpace)).toLowerCase();
  const rest = firstSpace === -1 ? "" : line.slice(firstSpace).trimStart();

  if (EXEC_KEYWORDS.has(actionRaw)) {
    // exec/break-style lines carry a command, not a commit; subject = command,
    // sha = null. `break`/`b` have no payload but pass through cleanly here.
    return { action: "exec", sha: null, subject: rest };
  }

  const commitAction = COMMIT_ACTIONS[actionRaw];
  if (commitAction == null) {
    // label/reset/merge/update-ref/break and unknown actions fold into "other".
    // Preserve the remainder as subject so the renderer can still show context.
    return { action: "other", sha: null, subject: rest || actionRaw };
  }

  // Commit actions: optional `-C`/`-c` option (fixup), then SHA, then subject.
  let cursor = rest;
  if (commitAction === "fixup" || commitAction === "squash") {
    const optMatch = cursor.match(/^(-[Cc])\s+/);
    if (optMatch) cursor = cursor.slice(optMatch[0].length);
  }
  const shaSpace = cursor.search(/\s/);
  const sha = (shaSpace === -1 ? cursor : cursor.slice(0, shaSpace)).trim();
  const subject = shaSpace === -1 ? "" : cursor.slice(shaSpace).trimStart();
  return {
    action: commitAction,
    sha: sha.length > 0 ? sha : null,
    subject,
  };
}

/** Parse a multi-line todo/done blob, dropping comments and blank lines. */
export function parseRebaseTodoLines(text: string): Omit<RebaseEntry, "state">[] {
  if (text.length === 0) return [];
  const out: Omit<RebaseEntry, "state">[] = [];
  for (const line of text.split("\n")) {
    const parsed = parseRebaseTodoLine(line);
    if (parsed) out.push(parsed);
  }
  return out;
}

async function readTextOrNull(p: string): Promise<string | null> {
  return fs.readFile(p, "utf8").catch(() => null);
}

/**
 * Read `.git/rebase-merge/done` + `git-rebase-todo` and assemble the structured
 * sequence. Returns `null` if `git-rebase-todo` is unreadable (the directory
 * isn't a live merge-backend rebase) or if no actionable entries exist.
 *
 * Entry state assignment: every line from `done` is `done`; the first parsed
 * entry from `git-rebase-todo` is `current` (the conflicting step has not yet
 * moved to `done`); the rest are `pending`.
 */
export async function readRebaseSequence(gitDir: string): Promise<RebaseSequence | null> {
  const dir = path.join(gitDir, "rebase-merge");
  const [doneRaw, todoRaw] = await Promise.all([
    readTextOrNull(path.join(dir, "done")),
    readTextOrNull(path.join(dir, "git-rebase-todo")),
  ]);

  if (todoRaw == null) return null;

  const done = parseRebaseTodoLines(doneRaw ?? "");
  const todo = parseRebaseTodoLines(todoRaw);

  const entries: RebaseEntry[] = [];
  for (const entry of done) entries.push({ ...entry, state: "done" });
  if (todo.length > 0) {
    entries.push({ ...todo[0]!, state: "current" });
    for (let i = 1; i < todo.length; i++) {
      entries.push({ ...todo[i]!, state: "pending" });
    }
  }

  if (entries.length === 0) return null;
  return { entries, backend: "merge" };
}
