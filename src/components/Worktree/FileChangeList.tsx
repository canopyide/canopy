import { useMemo } from 'react';
import path from 'path';
import type { FileChangeDetail, GitStatus } from '../../types/index.js';

const STATUS_ICONS: Record<GitStatus, { icon: string; color: string }> = {
  added: { icon: 'A', color: 'text-green-400' },
  modified: { icon: 'M', color: 'text-yellow-400' },
  deleted: { icon: 'D', color: 'text-red-400' },
  renamed: { icon: 'R', color: 'text-blue-400' },
  untracked: { icon: '?', color: 'text-gray-400' },
  ignored: { icon: 'I', color: 'text-gray-500' },
};

const STATUS_PRIORITY: Record<GitStatus, number> = {
  modified: 0,
  added: 1,
  deleted: 2,
  renamed: 3,
  untracked: 4,
  ignored: 5,
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
        const { icon, color } = STATUS_ICONS[change.status] || { icon: '?', color: 'text-gray-400' };
        const relativePath = path.isAbsolute(change.path)
          ? path.relative(rootPath, change.path)
          : change.path;
        const displayPath = truncateMiddle(relativePath, 42);
        const additionsLabel = change.insertions !== null ? `+${change.insertions}` : '';
        const deletionsLabel = change.deletions !== null ? `-${change.deletions}` : '';

        return (
          <div key={`${change.path}-${change.status}`} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`${color} font-mono font-bold flex-shrink-0`}>{icon}</span>
              <span className="text-gray-200 truncate">{displayPath}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {additionsLabel && <span className="text-green-400 text-xs font-mono">{additionsLabel}</span>}
              {deletionsLabel && <span className="text-red-400 text-xs font-mono">{deletionsLabel}</span>}
            </div>
          </div>
        );
      })}
      {remainingCount > 0 && (
        <div className="text-gray-500 text-sm">
          ...and {remainingCount} more
          {remainingFiles.length > 0 && (
            <span className="ml-1">
              ({remainingFiles.map((f) => path.basename(f.path)).join(', ')}
              {sortedChanges.length > maxVisible + 2 && ', ...'})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
