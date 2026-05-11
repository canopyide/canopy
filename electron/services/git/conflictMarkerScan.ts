import type { SimpleGit } from "simple-git";

export const STAGED_FILE_SIZE_CAP = 1_000_000;

const CONFLICT_MARKER_RE = /^(?:<{7}|\|{7}|={7}|>{7})[ \t\r]?/m;

function parseBinaryPathsFromNumstat(raw: string): Set<string> {
  const binary = new Set<string>();
  for (const line of raw.split("\n")) {
    const tabIdx1 = line.indexOf("\t");
    if (tabIdx1 === -1) continue;
    const tabIdx2 = line.indexOf("\t", tabIdx1 + 1);
    if (tabIdx2 === -1) continue;
    if (line.slice(0, tabIdx2) !== "-\t-") continue;
    const filePath = line.slice(tabIdx2 + 1);
    if (filePath) binary.add(filePath);
  }
  return binary;
}

export async function scanStagedFilesForConflictMarkers(git: SimpleGit): Promise<void> {
  const status = await git.status();
  const candidates: string[] = [];
  for (const file of status.files) {
    const indexStatus = file.index;
    if (!indexStatus || indexStatus === " " || indexStatus === "?" || indexStatus === "D") {
      continue;
    }
    candidates.push(file.path);
  }
  if (candidates.length === 0) return;

  const numstatRaw = await git.diff(["--no-ext-diff", "--no-textconv", "--cached", "--numstat"]);
  const binaryPaths = parseBinaryPathsFromNumstat(numstatRaw);

  for (const filePath of candidates) {
    if (binaryPaths.has(filePath)) continue;
    const content = await git.raw(["cat-file", "blob", "--end-of-options", `:${filePath}`]);
    if (typeof content !== "string") continue;
    if (Buffer.byteLength(content, "utf8") > STAGED_FILE_SIZE_CAP) continue;
    const probe = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    if (CONFLICT_MARKER_RE.test(probe)) {
      throw new Error(
        `Unresolved conflict markers found in ${filePath}. Resolve all conflicts before committing.`
      );
    }
  }
}
