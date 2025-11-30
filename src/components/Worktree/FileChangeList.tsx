import { useMemo, Fragment } from "react";
import type { FileChangeDetail, GitStatus } from "../../types";
import { cn } from "../../lib/utils";

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

function splitPath(filePath: string): { dir: string; base: string } {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) {
    return { dir: "", base: normalized };
  }
  return {
    dir: normalized.slice(0, lastSlash),
    base: normalized.slice(lastSlash + 1),
  };
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
    <div className="mt-2">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs font-mono">
        {visibleChanges.map((change) => {
          const { icon, color } = STATUS_ICONS[change.status] || {
            icon: "?",
            color: "text-gray-400",
          };
          const relativePath = isAbsolutePath(change.path)
            ? getRelativePath(rootPath, change.path)
            : change.path;

          const { dir, base } = splitPath(relativePath);
          const additionsLabel = change.insertions !== null ? `+${change.insertions}` : "";
          const deletionsLabel = change.deletions !== null ? `-${change.deletions}` : "";

          return (
            <Fragment key={`${change.path}-${change.status}`}>
              {/* Icon Column */}
              <div className={cn(color, "font-bold flex items-center")}>{icon}</div>

              {/* Path Column - RTL for left-side truncation, LTR for content */}
              <div
                className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left text-gray-500"
                dir="rtl"
                title={relativePath}
              >
                <span dir="ltr">
                  {dir && <span className="text-gray-500">{dir}/</span>}
                  <span className="text-gray-200">{base}</span>
                </span>
              </div>

              {/* Stats Column */}
              <div className="flex items-center gap-2 justify-end">
                {additionsLabel && (
                  <span className="text-[var(--color-status-success)]">{additionsLabel}</span>
                )}
                {deletionsLabel && (
                  <span className="text-[var(--color-status-error)]">{deletionsLabel}</span>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>

      {remainingCount > 0 && (
        <div className="mt-1.5 text-gray-500 text-xs pl-0.5">
          ...and {remainingCount} more
          {remainingFiles.length > 0 && (
            <span className="ml-1 opacity-75">
              ({remainingFiles.map((f) => getBasename(f.path)).join(", ")}
              {sortedChanges.length > maxVisible + 2 && ", ..."})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
