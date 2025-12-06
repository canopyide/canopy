import { useMemo, useState } from "react";
import type { FileChangeDetail, GitStatus } from "../../types";
import { cn } from "../../lib/utils";
import { FileDiffModal } from "./FileDiffModal";

function isAbsolutePath(filePath: string): boolean {
  return (
    filePath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith("\\\\")
  );
}

function getRelativePath(from: string, to: string): string {
  const normalizedFrom = from.replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedTo = to.replace(/\\/g, "/");

  if (normalizedTo.startsWith(normalizedFrom + "/")) {
    return normalizedTo.slice(normalizedFrom.length + 1);
  }

  return normalizedTo;
}

function getBasename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").replace(/\/$/, "");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
}

const STATUS_CONFIG: Record<GitStatus, { label: string; color: string }> = {
  modified: { label: "M", color: "text-amber-400" },
  added: { label: "A", color: "text-green-400" },
  deleted: { label: "D", color: "text-red-400" },
  untracked: { label: "?", color: "text-green-400" },
  renamed: { label: "R", color: "text-blue-400" },
  copied: { label: "C", color: "text-blue-400" },
  ignored: { label: "I", color: "text-canopy-text/40" },
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

function formatDirForDisplay(dir: string, maxSegments = 2): string {
  if (!dir) return "";
  const segments = dir.split("/");
  if (segments.length <= maxSegments) return dir;
  return "…/" + segments.slice(-maxSegments).join("/");
}

interface SelectedFile {
  path: string;
  status: GitStatus;
}

export function FileChangeList({ changes, maxVisible = 4, rootPath }: FileChangeListProps) {
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);

  const sortedChanges = useMemo(() => {
    return [...changes].sort((a, b) => {
      const churnA = (a.insertions ?? 0) + (a.deletions ?? 0);
      const churnB = (b.insertions ?? 0) + (b.deletions ?? 0);
      if (churnA !== churnB) {
        return churnB - churnA;
      }

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
  const remainingFiles = sortedChanges.slice(maxVisible, maxVisible + 2);

  if (changes.length === 0) {
    return null;
  }

  const handleFileClick = (change: FileChangeDetail) => {
    const relativePath = isAbsolutePath(change.path)
      ? getRelativePath(rootPath, change.path)
      : change.path;
    setSelectedFile({
      path: relativePath,
      status: change.status,
    });
  };

  const closeModal = () => {
    setSelectedFile(null);
  };

  return (
    <>
      <div className="flex flex-col gap-0.5 w-full">
        {visibleChanges.map((change) => {
          const config = STATUS_CONFIG[change.status] || STATUS_CONFIG.untracked;
          const relativePath = isAbsolutePath(change.path)
            ? getRelativePath(rootPath, change.path)
            : change.path;
          const { dir, base } = splitPath(relativePath);

          const displayDir = formatDirForDisplay(dir);

          return (
            <div
              key={`${change.path}-${change.status}`}
              className="group flex items-center text-xs font-mono hover:bg-white/5 rounded px-1.5 py-0.5 -mx-1.5 cursor-pointer transition-colors"
              onClick={() => handleFileClick(change)}
              title={relativePath}
            >
              {/* Status Letter */}
              <span className={cn("w-4 font-bold shrink-0", config.color)}>{config.label}</span>

              {/* File Path - directory truncates, filename is protected */}
              <div className="flex-1 min-w-0 flex items-center mr-2">
                {displayDir && (
                  <span className="truncate text-canopy-text/60 opacity-60 group-hover:opacity-80">
                    {displayDir}/
                  </span>
                )}
                <span className="text-canopy-text group-hover:text-white font-medium shrink-0">
                  {base}
                </span>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-2 shrink-0 text-[10px]">
                {(change.insertions ?? 0) > 0 && (
                  <span className="text-green-500/80">+{change.insertions}</span>
                )}
                {(change.deletions ?? 0) > 0 && (
                  <span className="text-red-500/80">-{change.deletions}</span>
                )}
              </div>
            </div>
          );
        })}

        {remainingCount > 0 && (
          <div className="text-[10px] text-canopy-text/60 pl-5 pt-1">
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

      <FileDiffModal
        isOpen={selectedFile !== null}
        filePath={selectedFile?.path ?? ""}
        status={selectedFile?.status ?? "modified"}
        worktreePath={rootPath}
        onClose={closeModal}
      />
    </>
  );
}
