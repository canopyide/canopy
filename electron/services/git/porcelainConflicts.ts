import type { ConflictedFileEntry } from "../../../shared/types/git.js";

export const CONFLICT_LABELS: Record<string, string> = {
  UU: "both modified",
  AA: "both added",
  DD: "both deleted",
  AU: "added by us",
  UA: "added by them",
  DU: "deleted by us",
  UD: "deleted by them",
};

export function parsePorcelainV2Conflicts(raw: string): ConflictedFileEntry[] {
  const entries: ConflictedFileEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.startsWith("u ")) continue;
    const parts = line.split(" ");
    if (parts.length < 11) continue;
    const xy = parts[1] ?? "";
    const filePath = parts.slice(10).join(" ");
    if (!filePath) continue;
    entries.push({
      path: filePath,
      xy,
      label: CONFLICT_LABELS[xy] ?? xy,
    });
  }
  return entries;
}
