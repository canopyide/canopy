import { useMemo } from "react";
import type { FileChangeDetail, GitStatus } from "../../types";

/**
 * Browser-safe path utilities (no Node.js path module)
 */
function isAbsolutePath(filePath: string): boolean {
  // Unix absolute paths start with /
  // Windows absolute paths start with drive letter (C:\) or UNC (\\)
  return (
    filePath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith("\\\\")
  );
}

function getRelativePath(from: string, to: string): string {
  // Normalize separators to /
  const normalizedFrom = from.replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedTo = to.replace(/\\/g, "/");

  // If 'to' starts with 'from', just strip the prefix
  if (normalizedTo.startsWith(normalizedFrom + "/")) {
    return normalizedTo.slice(normalizedFrom.length + 1);
  }

  // Otherwise return as-is
  return normalizedTo;
}

function getBasename(filePath: string): string {
  // Normalize separators and get the last segment
  const normalized = filePath.replace(/\\/g, "/").replace(/\/$/, "");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
}

const STATUS_ICONS: Record<GitStatus, { icon: string; color: string }> = {
  added: { icon: "A", color: "text-[var(--color-status-success)]" },
  modified: { icon: "M", color: "text-[var(--color-status-warning)]" },
  deleted: { icon: "D", color: "text-[var(--color-status-error)]" },
  renamed: { icon: "R", color: "text-[var(--color-status-info)]" },
  copied: { icon: "C", color: "text-cyan-400" },
  untracked: { icon: "?", color: "text-gray-400" },
  ignored: { icon: "I", color: "text-gray-500" },
};

const STATUS_PRIORITY: Record<GitStatus, number> = {
  modified: 0,
  added: 1,
  deleted: 2,
  renamed: 3,
  copied: 4,
  untracked: 5,
  ignored: 6,
};

interface FileChangeListProps {
  changes: FileChangeDetail[];
  maxVisible?: number;
  rootPath: string;
}

function truncateMiddle(value: string, maxLength = 42): string {
  if (value.length <= maxLength) return value;
  const half = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, half)}...${value.slice(-half)}`;
}

export function FileChangeList({ changes, maxVisible = 4, rootPath }: FileChangeListProps) {
  // Sort changes by churn (most changes first), then by status priority as tiebreaker
  const sortedChanges = useMemo(() => {
    return [...changes].sort((a, b) => {
      // Primary sort: by churn (insertions + deletions), descending
      const churnA = (a.insertions ?? 0) + (a.deletions ?? 0);
      const churnB = (b.insertions ?? 0) + (b.deletions ?? 0);
      if (churnA !== churnB) {
        return churnB - churnA;
      }

      // Secondary sort: by status priority
      const priorityA = STATUS_PRIORITY[a.status] ?? 99;
      const priorityB = STATUS_PRIORITY[b.status] ?? 99;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      return a.path.localeCompare(b.path);
    });
  }, [changes]);

  const visibleChanges = sortedChanges.slice(0, maxVisible);
  const remainingCount = Math.max(0, sortedChanges.length - maxVisible);
  const remainingFiles = sortedChanges.slice(maxVisible, maxVisible + 2); // Show up to 2 additional filenames

  if (changes.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-1">
      {visibleChanges.map((change) => {
        const { icon, color } = STATUS_ICONS[change.status] || {
          icon: "?",
          color: "text-gray-400",
        };
        const relativePath = isAbsolutePath(change.path)
          ? getRelativePath(rootPath, change.path)
          : change.path;
        const displayPath = truncateMiddle(relativePath, 42);
        const additionsLabel = change.insertions !== null ? `+${change.insertions}` : "";
        const deletionsLabel = change.deletions !== null ? `-${change.deletions}` : "";

        return (
          <div
            key={`${change.path}-${change.status}`}
            className="flex items-center justify-between text-sm"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`${color} font-mono font-bold flex-shrink-0`}>{icon}</span>
              <span className="text-gray-200 truncate">{displayPath}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {additionsLabel && (
                <span className="text-[var(--color-status-success)] text-xs font-mono">
                  {additionsLabel}
                </span>
              )}
              {deletionsLabel && (
                <span className="text-[var(--color-status-error)] text-xs font-mono">
                  {deletionsLabel}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {remainingCount > 0 && (
        <div className="text-gray-500 text-sm">
          ...and {remainingCount} more
          {remainingFiles.length > 0 && (
            <span className="ml-1">
              ({remainingFiles.map((f) => getBasename(f.path)).join(", ")}
              {sortedChanges.length > maxVisible + 2 && ", ..."})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
